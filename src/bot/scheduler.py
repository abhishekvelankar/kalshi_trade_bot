"""
Bot scheduler — orchestrates one full 15-minute trading cycle per series.

Markets open at each :00/:15/:30/:45 UTC mark and close 15 minutes later.
One APScheduler job per active series fires at :00:30, :15:30, etc.
Each job runs in its own thread so all series execute in parallel.
"""
import functools
import time
from datetime import datetime, timedelta, timezone

import structlog
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from src.config import timing as t_cfg, series as series_cfg, stop_loss as sl_cfg, get_series_cfg
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
    now = datetime.now(timezone.utc)
    aligned_minute = (now.minute // 15) * 15
    return now.replace(minute=aligned_minute, second=0, microsecond=0)


def _sleep_until(target: datetime) -> None:
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


def _save_market_snapshot(cycle_id: int, market: kalshi_client.KalshiMarket) -> MarketSnapshot:
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


def _save_prediction(cycle_id: int, pred: pred_engine.Prediction) -> PredictionRecord:
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


def run_cycle(series_ticker: str = "KXBTC15M", coin_id: str = "bitcoin") -> None:
    """Execute one complete 15-minute trading cycle for the given series."""
    s_cfg = get_series_cfg(series_ticker)
    series_paper = s_cfg["paper_trade"]
    series_amount = s_cfg["trade_amount"]
    series_min_dist = s_cfg["min_strike_distance_pct"]

    cycle_start = _aligned_cycle_start()
    log.info("cycle.start", ts=cycle_start.isoformat(), series=series_ticker,
             paper=series_paper, trade_amount=series_amount, min_dist_pct=series_min_dist)

    # ── Step 1: find active market ─────────────────────────────────────────
    market = None
    for attempt in range(10):
        try:
            market = kalshi_client.find_active_market(series_ticker)
        except Exception as exc:
            log.error("cycle.market_fetch_failed", series=series_ticker, attempt=attempt + 1, error=str(exc))
        if market:
            break
        if attempt < 9:
            log.info("cycle.market_not_ready", series=series_ticker, attempt=attempt + 1, retry_in=10)
            time.sleep(10)

    if not market:
        log.warning("cycle.no_market", series=series_ticker, msg="No active market found after retries")
        return

    log.info("cycle.market_found", series=series_ticker, ticker=market.ticker, title=market.title)

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
        # ── Step 2: collect coin price data ───────────────────────────────
        btc_snapshots_data: list[btc_data.BTCSnapshot] = []

        for i in range(t_cfg.data_collection_window_minutes):
            snap_deadline = cycle_start + timedelta(
                seconds=(i + 1) * t_cfg.btc_poll_interval_seconds
            )
            try:
                snap = btc_data.get_snapshot(coin_id=coin_id, floor_strike=market.target_price)
                _save_btc_snapshot(cycle_id, snap)
                btc_snapshots_data.append(snap)
                log.info(
                    "cycle.btc_snap",
                    series=series_ticker,
                    minute=i + 1,
                    price=snap.market.price_usd,
                    momentum=snap.momentum_score,
                )
            except Exception as exc:
                log.warning("cycle.btc_snap_failed", series=series_ticker, minute=i + 1, error=str(exc))

            _sleep_until(snap_deadline)

        # ── Step 3: snapshot market + predict ─────────────────────────────
        try:
            current_market = kalshi_client.get_market(market.ticker)
        except Exception:
            current_market = market

        _save_market_snapshot(cycle_id, current_market)

        prediction = pred_engine.predict(btc_snapshots_data, current_market,
                                         min_strike_distance_pct=series_min_dist)
        _save_prediction(cycle_id, prediction)

        log.info(
            "cycle.prediction",
            series=series_ticker,
            action=prediction.action.value,
            confidence=prediction.confidence,
            btc_score=prediction.btc_score,
            kalshi_yes_prob=prediction.kalshi_yes_prob,
        )

        # ── Step 4: wait for trade entry window ───────────────────────────
        trade_entry_open = cycle_start + timedelta(minutes=t_cfg.trade_entry_start_minutes)
        trade_entry_close = cycle_start + timedelta(minutes=t_cfg.trade_entry_end_minutes)
        secs_to_entry = (trade_entry_open - datetime.now(timezone.utc)).total_seconds()
        if secs_to_entry > 0:
            log.info("cycle.waiting_for_entry_window", series=series_ticker, seconds=round(secs_to_entry))
            _sleep_until(trade_entry_open)

        # ── Step 5: execute trade ──────────────────────────────────────────
        trade = executor.execute(cycle_id, current_market, prediction,
                                 paper_trade=series_paper, trade_amount=series_amount)

        # ── Step 6: monitor for stop-loss / wait for market close ────────────
        market_close = market.close_time or (cycle_start + timedelta(minutes=t_cfg.cycle_minutes))
        exited_early = False

        if trade and sl_cfg.enabled:
            exited_early = _monitor_for_stop_loss(trade, current_market, market_close, series_ticker,
                                                   paper_trade=series_paper)
        else:
            secs_to_close = (market_close - datetime.now(timezone.utc)).total_seconds()
            if secs_to_close > 0:
                log.info("cycle.waiting_for_close", series=series_ticker, seconds=round(secs_to_close))
                _sleep_until(market_close + timedelta(seconds=5))

        # ── Step 7: resolve outcome (skipped if stop-loss already exited) ────
        if trade and not exited_early:
            try:
                resolved_market = None
                for attempt in range(6):
                    resolved_market = kalshi_client.get_market(market.ticker)
                    if resolved_market.result:
                        break
                    log.info(
                        "cycle.waiting_for_result",
                        series=series_ticker,
                        ticker=market.ticker,
                        attempt=attempt + 1,
                        retry_in=5,
                    )
                    time.sleep(5)

                if not resolved_market or not resolved_market.result:
                    log.warning(
                        "cycle.result_unavailable",
                        series=series_ticker,
                        ticker=market.ticker,
                        msg="result field empty after retries — trade left pending",
                    )
                else:
                    market_resolved_yes = resolved_market.result.lower() == "yes"
                    log.info(
                        "cycle.market_result",
                        series=series_ticker,
                        ticker=market.ticker,
                        result=resolved_market.result,
                        resolved_yes=market_resolved_yes,
                    )
                    executor.resolve(trade, market_resolved_yes)
            except Exception as exc:
                log.error("cycle.resolve_failed", series=series_ticker, error=str(exc))

        _mark_cycle(cycle_id, CycleStatus.completed)
        log.info("cycle.complete", series=series_ticker, cycle_id=cycle_id)

    except Exception as exc:
        log.error("cycle.error", series=series_ticker, cycle_id=cycle_id, error=str(exc))
        _mark_cycle(cycle_id, CycleStatus.error, str(exc))


def _cleanup_stale_cycles() -> None:
    from sqlalchemy import select as sa_select
    with get_db() as db:
        stale = db.execute(
            sa_select(TradingCycle).where(TradingCycle.status == CycleStatus.running)
        ).scalars().all()
        for cycle in stale:
            cycle.status = CycleStatus.error
            cycle.cycle_end = datetime.now(timezone.utc)
            cycle.error_message = "Interrupted by bot restart"
    if stale:
        log.info("startup.stale_cycles_cleaned", count=len(stale))


def _monitor_for_stop_loss(
    trade,
    market: kalshi_client.KalshiMarket,
    market_close: datetime,
    series_ticker: str,
    paper_trade: bool = True,
) -> bool:
    """
    Poll market price every check_interval seconds until close.
    If the owned side drops below the threshold, exit early and return True.
    Returns False if we held through to close without triggering.
    """
    from src.database.models import TradeSide
    log.info(
        "stop_loss.monitoring_start",
        series=series_ticker,
        ticker=market.ticker,
        side=trade.side.value,
        threshold_cents=sl_cfg.threshold_cents,
        interval_s=sl_cfg.check_interval_seconds,
    )

    while True:
        now = datetime.now(timezone.utc)
        next_check = now + timedelta(seconds=sl_cfg.check_interval_seconds)

        if next_check >= market_close:
            # Not enough time for another check — wait out the rest
            secs_left = (market_close - now).total_seconds()
            if secs_left > 0:
                log.info("stop_loss.waiting_for_close", series=series_ticker, seconds=round(secs_left))
                _sleep_until(market_close + timedelta(seconds=5))
            return False

        _sleep_until(next_check)

        try:
            current = kalshi_client.get_market(market.ticker)
            own_price = current.yes_price if trade.side == TradeSide.yes else current.no_price

            log.info(
                "stop_loss.check",
                series=series_ticker,
                side=trade.side.value,
                own_price=own_price,
                threshold=sl_cfg.threshold_cents,
            )

            if own_price < sl_cfg.threshold_cents:
                log.warning(
                    "stop_loss.triggered",
                    series=series_ticker,
                    ticker=market.ticker,
                    side=trade.side.value,
                    own_price=own_price,
                    threshold=sl_cfg.threshold_cents,
                )
                executor.exit_position(trade, own_price, paper_trade=paper_trade)
                return True

        except Exception as exc:
            log.warning("stop_loss.check_error", series=series_ticker, error=str(exc))


def start_scheduler() -> BackgroundScheduler:
    """Start one APScheduler job per active series, all firing every 15 minutes."""
    init_db()
    _cleanup_stale_cycles()
    scheduler = BackgroundScheduler(timezone="UTC")

    for s in series_cfg.active:
        ticker = s["ticker"]
        coin_id = s["coin_id"]
        scheduler.add_job(
            functools.partial(run_cycle, series_ticker=ticker, coin_id=coin_id),
            trigger=CronTrigger(minute="0,15,30,45", second=30),
            id=f"{ticker}_cycle",
            name=f"{ticker} 15-min trading cycle",
            max_instances=1,
            coalesce=True,
        )
        log.info("scheduler.job_added", series=ticker, coin=coin_id)

    scheduler.start()
    first_job = scheduler.get_job(f"{series_cfg.active[0]['ticker']}_cycle")
    log.info("scheduler.started", next_run=str(first_job.next_run_time), series_count=len(series_cfg.active))
    return scheduler
