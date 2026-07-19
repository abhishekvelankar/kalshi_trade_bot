from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import and_, desc, func, select

from src.config import trading as trade_cfg
from src.database.db import SessionLocal
from src.database.models import BTCSnapshot, Trade, TradingCycle, TradeOutcome

router = APIRouter(prefix="/trades", tags=["trades"])


class TradeItem(BaseModel):
    id: int
    cycle_id: int
    placed_at: datetime
    ticker: str
    side: str
    is_paper: bool
    contracts: int
    price_per_contract: float
    total_cost: float
    outcome: str
    resolved_at: Optional[datetime]
    payout: Optional[float]
    pnl: Optional[float]
    strike_price: Optional[float]
    coin_price: Optional[float]
    strike_diff: Optional[float]      # coin_price - strike_price
    strike_diff_pct: Optional[float]  # % relative to strike

    model_config = {"from_attributes": True}


class PerformanceSummary(BaseModel):
    total_trades: int
    wins: int
    losses: int
    pending: int
    win_rate: float
    total_invested: float
    total_payout: float
    total_pnl: float
    paper_trades: int
    live_trades: int
    starting_balance: float


def _coin_price_subquery():
    """Subquery: cycle_id → price_usd of the last BTCSnapshot in that cycle."""
    max_ts = (
        select(BTCSnapshot.cycle_id, func.max(BTCSnapshot.captured_at).label("max_at"))
        .group_by(BTCSnapshot.cycle_id)
        .subquery()
    )
    return (
        select(BTCSnapshot.cycle_id, BTCSnapshot.price_usd.label("coin_price"))
        .join(max_ts, and_(
            BTCSnapshot.cycle_id == max_ts.c.cycle_id,
            BTCSnapshot.captured_at == max_ts.c.max_at,
        ))
        .subquery()
    )


@router.get("/", response_model=list[TradeItem])
def list_trades(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    outcome: Optional[str] = Query(None),
    side: Optional[str] = Query(None),
    is_paper: Optional[bool] = Query(None),
    series_ticker: Optional[str] = Query(None),
):
    price_sq = _coin_price_subquery()
    with SessionLocal() as db:
        q = (
            select(Trade, TradingCycle.target_price.label("strike_price"), price_sq.c.coin_price)
            .join(TradingCycle, Trade.cycle_id == TradingCycle.id)
            .outerjoin(price_sq, Trade.cycle_id == price_sq.c.cycle_id)
            .order_by(desc(Trade.placed_at))
        )
        if series_ticker:
            q = q.where(TradingCycle.market_ticker.like(f"{series_ticker}%"))
        if outcome:
            q = q.where(Trade.outcome == outcome)
        if side:
            q = q.where(Trade.side == side)
        if is_paper is not None:
            q = q.where(Trade.is_paper == is_paper)

        rows = db.execute(q.offset(offset).limit(limit)).all()

    result = []
    for trade, strike_price, coin_price in rows:
        if coin_price is not None and strike_price and strike_price > 0:
            diff = coin_price - strike_price
            diff_pct = round(diff / strike_price * 100, 4)
        else:
            diff = diff_pct = None
        result.append(TradeItem(
            id=trade.id,
            cycle_id=trade.cycle_id,
            placed_at=trade.placed_at,
            ticker=trade.ticker,
            side=trade.side.value,
            is_paper=trade.is_paper,
            contracts=trade.contracts,
            price_per_contract=trade.price_per_contract,
            total_cost=trade.total_cost,
            outcome=trade.outcome.value,
            resolved_at=trade.resolved_at,
            payout=trade.payout,
            pnl=trade.pnl,
            strike_price=strike_price,
            coin_price=round(coin_price, 2) if coin_price is not None else None,
            strike_diff=round(diff, 2) if diff is not None else None,
            strike_diff_pct=diff_pct,
        ))
    return result


@router.get("/performance", response_model=PerformanceSummary)
def get_performance(
    is_paper: Optional[bool] = Query(None),
    series_ticker: Optional[str] = Query(None),
):
    from src.database.models import TradingCycle
    with SessionLocal() as db:
        q = select(Trade)
        if series_ticker:
            q = q.join(TradingCycle, Trade.cycle_id == TradingCycle.id).where(
                TradingCycle.market_ticker.like(f"{series_ticker}%")
            )
        if is_paper is not None:
            q = q.where(Trade.is_paper == is_paper)
        all_trades = db.execute(q).scalars().all()

    wins = [t for t in all_trades if t.outcome == TradeOutcome.win]
    losses = [t for t in all_trades if t.outcome == TradeOutcome.loss]
    pending = [t for t in all_trades if t.outcome == TradeOutcome.pending]
    resolved = wins + losses

    total_invested = sum(t.total_cost for t in all_trades)
    total_payout = sum((t.payout or 0) for t in all_trades)
    total_pnl = sum((t.pnl or 0) for t in all_trades)

    return PerformanceSummary(
        total_trades=len(all_trades),
        wins=len(wins),
        losses=len(losses),
        pending=len(pending),
        win_rate=len(wins) / len(resolved) if resolved else 0.0,
        total_invested=round(total_invested, 2),
        total_payout=round(total_payout, 2),
        total_pnl=round(total_pnl, 2),
        paper_trades=sum(1 for t in all_trades if t.is_paper),
        live_trades=sum(1 for t in all_trades if not t.is_paper),
        starting_balance=trade_cfg.starting_balance,
    )
