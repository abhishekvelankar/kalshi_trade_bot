"""
Trade executor.

Paper mode:  records the trade intent in the DB, simulates outcome at market close.
Live mode:   places a real limit order on Kalshi, then records the result.

The trade_amount from config is interpreted as total USD to spend per trade.
  contracts = floor(trade_amount_usd / (price_cents / 100))
Each contract pays $1.00 on a win.
"""
import math
from datetime import datetime, timezone
from pathlib import Path

import structlog
import yaml
from sqlalchemy import func, select

from typing import Optional
from src.config import trading as trade_cfg
from src.data import kalshi_client
from src.data.kalshi_client import KalshiMarket
from src.database.db import get_db
from src.database.models import Trade, TradeSide, TradeOutcome
from src.prediction.engine import Prediction
from src.database.models import TradeAction

log = structlog.get_logger()

_CONFIG_PATH = Path(__file__).parent.parent.parent / "config" / "config.yaml"
LIVE_LOSS_LIMIT = 4


def _live_loss_count() -> int:
    with get_db() as db:
        return db.execute(
            select(func.count()).where(
                Trade.is_paper == False,  # noqa: E712
                Trade.outcome == TradeOutcome.loss,
            )
        ).scalar() or 0


def _revert_to_paper() -> None:
    trade_cfg.paper_trade = True
    try:
        with open(_CONFIG_PATH) as f:
            data = yaml.safe_load(f)
        data["trading"]["paper_trade"] = True
        with open(_CONFIG_PATH, "w") as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        log.warning("executor.reverted_to_paper", reason=f"{LIVE_LOSS_LIMIT} live losses reached — config.yaml updated")
    except Exception as exc:
        log.error("executor.revert_write_failed", error=str(exc))


def _contracts_for_budget(price_cents: float, budget_usd: float) -> int:
    if price_cents <= 0:
        return 0
    return math.floor(budget_usd / (price_cents / 100))


def execute(
    cycle_id: int,
    market: KalshiMarket,
    prediction: Prediction,
    *,
    paper_trade: Optional[bool] = None,
    trade_amount: Optional[float] = None,
) -> Trade | None:
    """
    Execute a trade based on the prediction. Returns the saved Trade record
    or None if prediction is SKIP.
    Per-series overrides take precedence over global config when provided.
    """
    is_paper = paper_trade if paper_trade is not None else trade_cfg.paper_trade
    amount = trade_amount if trade_amount is not None else trade_cfg.trade_amount

    if prediction.action == TradeAction.SKIP:
        log.info("trade.skip", cycle_id=cycle_id, reason="prediction is SKIP")
        return None

    side = TradeSide.yes if prediction.action == TradeAction.YES else TradeSide.no
    price_cents = market.yes_price if side == TradeSide.yes else market.no_price

    profit_margin = 100 - price_cents
    if profit_margin < trade_cfg.min_profit_margin_cents:
        log.info(
            "trade.skip",
            cycle_id=cycle_id,
            reason=f"price {price_cents:.0f}¢ leaves only {profit_margin:.1f}¢ margin "
                   f"(min {trade_cfg.min_profit_margin_cents}¢)",
        )
        return None

    contracts = _contracts_for_budget(price_cents, amount)

    if contracts < 1:
        log.warning("trade.skip", cycle_id=cycle_id, reason="budget too small for even 1 contract")
        return None

    total_cost = round(contracts * (price_cents / 100), 2)
    kalshi_order_id = None

    # Auto-revert to paper if live loss limit reached
    if not is_paper:
        losses = _live_loss_count()
        if losses >= LIVE_LOSS_LIMIT:
            log.warning(
                "executor.live_loss_limit_hit",
                live_losses=losses,
                limit=LIVE_LOSS_LIMIT,
                action="reverting to paper trade",
            )
            _revert_to_paper()
            is_paper = True

    if not is_paper:
        try:
            result = kalshi_client.place_order(
                ticker=market.ticker,
                side=side.value,
                contracts=contracts,
                price_cents=int(price_cents),
            )
            kalshi_order_id = result.order_id
            log.info(
                "trade.live_order_placed",
                cycle_id=cycle_id,
                order_id=kalshi_order_id,
                side=side.value,
                contracts=contracts,
                price_cents=price_cents,
            )
        except Exception as exc:
            log.error("trade.order_failed", cycle_id=cycle_id, error=str(exc))
            raise

    trade = Trade(
        cycle_id=cycle_id,
        placed_at=datetime.now(timezone.utc),
        ticker=market.ticker,
        side=side,
        is_paper=is_paper,
        contracts=contracts,
        price_per_contract=price_cents,
        total_cost=total_cost,
        kalshi_order_id=kalshi_order_id,
        outcome=TradeOutcome.pending,
    )

    with get_db() as db:
        db.add(trade)
        db.flush()
        db.refresh(trade)
        trade_id = trade.id

    log.info(
        "trade.recorded",
        cycle_id=cycle_id,
        trade_id=trade_id,
        side=side.value,
        contracts=contracts,
        total_cost_usd=total_cost,
        paper=trade_cfg.paper_trade,
    )
    return trade


def exit_position(trade: Trade, exit_price_cents: float, *, paper_trade: Optional[bool] = None) -> None:
    """
    Exit a position early (stop-loss). Sells contracts back at current market
    price, recovering partial capital instead of holding to a full loss.
    """
    is_paper = paper_trade if paper_trade is not None else trade_cfg.paper_trade
    if not is_paper:
        try:
            kalshi_client.sell_contracts(trade.ticker, trade.side.value, trade.contracts)
            log.info("trade.stop_loss_sold", trade_id=trade.id, exit_price_cents=exit_price_cents)
        except Exception as exc:
            log.error("trade.stop_loss_sell_failed", trade_id=trade.id, error=str(exc))

    payout = round(trade.contracts * (exit_price_cents / 100), 2)
    pnl = round(payout - trade.total_cost, 2)

    with get_db() as db:
        db_trade = db.get(Trade, trade.id)
        db_trade.outcome = TradeOutcome.win if pnl >= 0 else TradeOutcome.loss
        db_trade.resolved_at = datetime.now(timezone.utc)
        db_trade.payout = payout
        db_trade.pnl = pnl

    log.warning(
        "trade.stop_loss_exit",
        trade_id=trade.id,
        side=trade.side.value,
        contracts=trade.contracts,
        entry_price_cents=trade.price_per_contract,
        exit_price_cents=exit_price_cents,
        entry_cost_usd=trade.total_cost,
        payout_usd=payout,
        pnl_usd=pnl,
        paper=is_paper,
    )


def resolve(trade: Trade, market_resolved_yes: bool) -> None:
    """
    Called when the Kalshi market closes. Updates the trade with its outcome.
    For paper trades, simulates the payout based on what the market resolved to.
    For live trades, the actual payout should be verified via Kalshi API.
    """
    side_won = (
        (trade.side == TradeSide.yes and market_resolved_yes)
        or (trade.side == TradeSide.no and not market_resolved_yes)
    )

    payout = round(trade.contracts * 1.00, 2) if side_won else 0.0
    pnl = round(payout - trade.total_cost, 2)

    with get_db() as db:
        db_trade = db.get(Trade, trade.id)
        db_trade.outcome = TradeOutcome.win if side_won else TradeOutcome.loss
        db_trade.resolved_at = datetime.now(timezone.utc)
        db_trade.payout = payout
        db_trade.pnl = pnl

    log.info(
        "trade.resolved",
        trade_id=trade.id,
        outcome=db_trade.outcome.value,
        pnl=pnl,
    )
