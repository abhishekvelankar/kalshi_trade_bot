from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select

from src.config import trading as trade_cfg
from src.database.db import SessionLocal
from src.database.models import Trade, TradeOutcome

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


@router.get("/", response_model=list[TradeItem])
def list_trades(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    outcome: Optional[str] = Query(None),
    side: Optional[str] = Query(None),
):
    with SessionLocal() as db:
        q = select(Trade).order_by(desc(Trade.placed_at))
        if outcome:
            q = q.where(Trade.outcome == outcome)
        if side:
            q = q.where(Trade.side == side)
        return db.execute(q.offset(offset).limit(limit)).scalars().all()


@router.get("/performance", response_model=PerformanceSummary)
def get_performance():
    with SessionLocal() as db:
        all_trades = db.execute(select(Trade)).scalars().all()

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
