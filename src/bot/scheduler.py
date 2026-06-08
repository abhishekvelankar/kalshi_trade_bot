"""
Bot scheduler — orchestrates one full 15-minute trading cycle.

Kalshi KXBTC15M markets open at each :00/:15/:30/:45 UTC mark and close
15 minutes later. Timeline within each cycle:

  0:00 - 12:00  Collect BTC data (one snapshot per minute)
  12:00         Snapshot Kalshi market state + run prediction engine
  12:00 - 15:00 Trade window (market closes at 15:00)
  15:00+        Market closes, resolve outcome, update DB

APScheduler fires run_cycle() at :00, :15, :30, :45 of every hour.
All internal deadlines are computed from the aligned clock mark (not
datetime.now() at call time) so execution overhead never causes drift.
"""
import time
from datetime import datetime, timedelta, timezone

import structlog
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from src.config import timing as t_cfg
from src.data import btc_data, kalshi_client
from src.database.db import get_db, init_db
from src.database.models import (
    BTCSnapshot, CycleStatus, MarketSnapshot,
    PredictionRecord, TradingCycle,
)
from src.prediction import engine as pred_engine
from src.trading import executor

log = structlog.get_logger()


def _aligned_cycle_start() -> datetime:
    """
    Return the most recent :00/:15/:30/:45 UTC mark.
    Using this as the cycle anchor ensures all deadlines stay on the clock
    regardless of how many milliseconds APScheduler fires late.
    """
    now = datetime.now(timezone.utc)
    aligned_minute = (now.minute // 15) * 15
    return now.replace(minute=aligned_minute, second=0, microsecond=0)


def _sleep_until(target: datetime) -> None:
    """Sleep until an absolute UTC time. No-op if already past."""
    remaining = (target - datetime.now(timezone.utc)).total_seconds()
    if remaining > 0:
        time.sleep(remaining)


def _save_btc_snapshot(cycle_id: int, snap: btc_data.BTCSnapshot) -> BTCSnapshot:
    record = BTCSnapshot(
        cycle_id=cycle_id,
        captured_at=snap.market.captured_at,
        price_usd=snap.market.price_usd,
        price_change_1m=snap.market.price_change_1m,
        price_change_5m=snap.market.price_change_5m,
        price_change_10m=snap.market.price_change_10m,
        mempool_fee_fastest=snap.mempool.fee_fastest,
        mempool_fee_half_hour=snap.mempool.fee_half_hour,
        mempool_size_bytes=snap.mempool.mempool_size_bytes,
        mempool_tx_count=snap.mempool.mempool_tx_count,
        block_height=snap.mempool.block_height,
        momentum_score=snap.momentum_score,
    )
    with get_db() as db:
        db.add(record)
    return record


def _save_market_snapshot(
    cycle_id: int, market: kalshi_client.KalshiMarket
) -> MarketSnapshot:
    record = MarketSnapshot(
        cycle_id=cycle_id,
        captured_at=datetime.now(timezone.utc),
        ticker=market.ticker,
        yes_price=market.yes_price,
        no_price=market.no_price,
        yes_volume=market.yes_volume,
        no_volume=market.no_volume,
        open_interest=market.open_interest,
        close_time=market.close_time,
    )
    with get_db() as db:
        db.add(record)
    return record


def _save_prediction(
    cycle_id: int, pred: pred_engine.Prediction
) -> PredictionRecord:
    record = PredictionRecord(
        cycle_id=cycle_id,
        predicted_at=pred.predicted_at,
        action=pred.action,
        confidence=pred.confidence,
        btc_score=pred.btc_score,
        kalshi_yes_prob=pred.kalshi_yes_prob,
        combined_score=pred.combined_score,
        reasoning=pred.reasoning,
    )
    with get_db() as db:
        db.add(record)
    return record


def _mark_cycle(cycle_id: int, status: CycleStatus, error: str | None = None) -> None:
    with get_db() as db:
        cycle = db.get(TradingCycle, cycle_id)
        cycle.status = status
        cycle.cycle_end = datetime.now(timezone.utc)
        if error:
            cycle.error_message = error


def run_cycle() -> None:
    """Execute one complete 15-minute trading cycle."""
    # Anchor to the clock mark, not to when APScheduler actually fired.
    cycle_start = _aligned_cycle_start()
    log.info("cycle.start", ts=cycle_start.isoformat())

    # ── Step 1: find active Kalshi BTC market ──────────────────────────────
    # Kalshi may take up to ~60s to make the new market queryable after
    # it opens at the clock mark, so retry with a short sleep.
    market = None
    for attempt in range(10):
        try:
            market = kalshi_client.find_active_btc_market()
        except Exception as exc:
            log.error("cycle.market_fetch_failed", attempt=attempt + 1, error=str(exc))
        if market:
            break
        if attempt < 9:
            log.info("cycle.market_not_ready", attempt=attempt + 1, retry_in=10)
            time.sleep(10)

    if not market:
        log.warning("cycle.no_market", msg="No active BTC 15-min market found after retries")
        return

    log.info("cycle.market_found", ticker=market.ticker, title=market.title)

    # ── Create cycle record ────────────────────────────────────────────────
    cycle_record = TradingCycle(
        cycle_start=cycle_start,
        market_ticker=market.ticker,
        market_title=market.title,
        target_price=market.target_price,
        status=CycleStatus.running,
    )
    with get_db() as db:
        db.add(cycle_record)
        db.flush()
        cycle_id = cycle_record.id

    try:
        # ── Step 2: collect BTC data for data_collection_window minutes ───
        # Each snapshot fires at cycle_start + N minutes exactly, so BTC data
        # timestamps are always anchored to the Kalshi event clock.
        btc_snapshots_data: list[btc_data.BTCSnapshot] = []

        for i in range(t_cfg.data_collection_window_minutes):
            # Collect immediately on iteration 0, then at each 1-min mark
            snap_deadline = cycle_start + timedelta(
                seconds=(i + 1) * t_cfg.btc_poll_interval_seconds
            )

            try:
                snap = btc_data.get_snapshot(floor_strike=market.target_price)
                _save_btc_snapshot(cycle_id, snap)
                btc_snapshots_data.append(snap)
                log.info(
                    "cycle.btc_snap",
                    minute=i + 1,
                    price=snap.market.price_usd,
                    momentum=snap.momentum_score,
                )
            except Exception as exc:
                log.warning("cycle.btc_snap_failed", minute=i + 1, error=str(exc))

            # Sleep until the next absolute minute mark (self-correcting)
            _sleep_until(snap_deadline)

        # ── Step 3: snapshot Kalshi market + predict ───────────────────────
        # Runs at exactly cycle_start + data_collection_window_minutes
        try:
            current_market = kalshi_client.get_market(market.ticker)
        except Exception:
            current_market = market  # fallback to initial state

        _save_market_snapshot(cycle_id, current_market)

        prediction = pred_engine.predict(btc_snapshots_data, current_market)
        _save_prediction(cycle_id, prediction)

        log.info(
            "cycle.prediction",
            action=prediction.action.value,
            confidence=prediction.confidence,
            btc_score=prediction.btc_score,
            kalshi_yes_prob=prediction.kalshi_yes_prob,
        )

        # ── Step 4: wait until trade entry window ─────────────────────────
        # Trade entry opens at cycle_start + trade_entry_start_minutes exactly.
        trade_entry_open = cycle_start + timedelta(minutes=t_cfg.trade_entry_start_minutes)
        trade_entry_close = cycle_start + timedelta(minutes=t_cfg.trade_entry_end_minutes)
        secs_to_entry = (trade_entry_open - datetime.now(timezone.utc)).total_seconds()
        if secs_to_entry > 0:
            log.info("cycle.waiting_for_entry_window", seconds=round(secs_to_entry))
            _sleep_until(trade_entry_open)

        # ── Step 5: execute trade ──────────────────────────────────────────
        trade = executor.execute(cycle_id, current_market, prediction)

        # ── Step 6: wait for market close ─────────────────────────────────
        # Prefer the close_time from Kalshi; fall back to cycle_start + 15 min.
        market_close = market.close_time or (
            cycle_start + timedelta(minutes=t_cfg.cycle_minutes)
        )
        secs_to_close = (market_close - datetime.now(timezone.utc)).total_seconds()
        if secs_to_close > 0:
            log.info("cycle.waiting_for_close", seconds=round(secs_to_close))
            _sleep_until(market_close + timedelta(seconds=5))

        # ── Step 7: resolve outcome ────────────────────────────────────────
        # Kalshi can take 5–30s after close to set the `result` field.
        # Retry up to 6 times (5s apart, max ~30s) before giving up.
        # If result is still unset after all retries, leave the trade as
        # pending rather than recording a false loss.
        if trade:
            try:
                resolved_market = None
                for attempt in range(6):
                    resolved_market = kalshi_client.get_market(market.ticker)
                    if resolved_market.result:
                        break
                    log.info(
                        "cycle.waiting_for_result",
                        ticker=market.ticker,
                        attempt=attempt + 1,
                        retry_in=5,
                    )
                    time.sleep(5)

                if not resolved_market or not resolved_market.result:
                    log.warning(
                        "cycle.result_unavailable",
                        ticker=market.ticker,
                        msg="result field empty after retries — trade left pending",
                    )
                else:
                    market_resolved_yes = resolved_market.result.lower() == "yes"
                    log.info(
                        "cycle.market_result",
                        ticker=market.ticker,
                        result=resolved_market.result,
                        resolved_yes=market_resolved_yes,
                    )
                    executor.resolve(trade, market_resolved_yes)
            except Exception as exc:
                log.error("cycle.resolve_failed", error=str(exc))

        _mark_cycle(cycle_id, CycleStatus.completed)
        log.info("cycle.complete", cycle_id=cycle_id)

    except Exception as exc:
        log.error("cycle.error", cycle_id=cycle_id, error=str(exc))
        _mark_cycle(cycle_id, CycleStatus.error, str(exc))


def _cleanup_stale_cycles() -> None:
    """
    On startup, every cycle still marked 'running' was killed by the restart.
    Mark them all as error regardless of age — a restart always interrupts
    whatever was in progress.
    """
    from sqlalchemy import select as sa_select
    with get_db() as db:
        stale = db.execute(
            sa_select(TradingCycle).where(
                TradingCycle.status == CycleStatus.running,
            )
        ).scalars().all()
        for cycle in stale:
            cycle.status = CycleStatus.error
            cycle.cycle_end = datetime.now(timezone.utc)
            cycle.error_message = "Interrupted by bot restart"
    if stale:
        log.info("startup.stale_cycles_cleaned", count=len(stale))


def start_scheduler() -> BackgroundScheduler:
    """Start APScheduler, firing run_cycle every 15 minutes on the clock."""
    init_db()
    _cleanup_stale_cycles()
    scheduler = BackgroundScheduler(timezone="UTC")
    # Fire 30s after each clock mark so the new market has time to open
    # on Kalshi's side, and the previous cycle has time to finish resolving.
    # Timeline: fires at :00:30, :15:30, :30:30, :45:30.
    # Previous cycle ends at most at :00:05/:15:05/... — 25s clear before next fire.
    scheduler.add_job(
        run_cycle,
        trigger=CronTrigger(minute="0,15,30,45", second=30),
        id="btc_cycle",
        name="BTC 15-min trading cycle",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    log.info("scheduler.started", next_run=str(scheduler.get_job("btc_cycle").next_run_time))
    return scheduler
