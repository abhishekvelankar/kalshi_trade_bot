from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, desc, func, select

from src.database.db import SessionLocal
from src.database.models import TradingCycle, BTCSnapshot, MarketSnapshot, PredictionRecord, Trade

router = APIRouter(prefix="/cycles", tags=["cycles"])


class BTCSnapshotOut(BaseModel):
    captured_at: datetime
    price_usd: float
    price_change_5m: Optional[float]
    price_change_10m: Optional[float]
    momentum_score: Optional[float]
    mempool_fee_fastest: Optional[float]

    model_config = {"from_attributes": True}


class MarketSnapshotOut(BaseModel):
    captured_at: datetime
    ticker: str
    yes_price: float
    no_price: float
    close_time: Optional[datetime]

    model_config = {"from_attributes": True}


class PredictionOut(BaseModel):
    predicted_at: datetime
    action: str
    confidence: float
    btc_score: float
    kalshi_yes_prob: float
    combined_score: float

    model_config = {"from_attributes": True}


class TradeOut(BaseModel):
    placed_at: datetime
    side: str
    is_paper: bool
    contracts: int
    price_per_contract: float
    total_cost: float
    outcome: str
    pnl: Optional[float]

    model_config = {"from_attributes": True}


class CycleListItem(BaseModel):
    id: int
    cycle_start: datetime
    cycle_end: Optional[datetime]
    market_ticker: str
    market_title: Optional[str]
    target_price: Optional[float]
    coin_price: Optional[float]
    strike_diff: Optional[float]
    strike_diff_pct: Optional[float]
    status: str

    model_config = {"from_attributes": True}


class CycleDetail(CycleListItem):
    btc_snapshots: list[BTCSnapshotOut]
    market_snapshot: Optional[MarketSnapshotOut]
    prediction: Optional[PredictionOut]
    trade: Optional[TradeOut]


@router.get("/", response_model=list[CycleListItem])
def list_cycles(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    series_ticker: Optional[str] = Query(None),
):
    with SessionLocal() as db:
        q = select(TradingCycle).order_by(desc(TradingCycle.cycle_start))
        if series_ticker:
            q = q.where(TradingCycle.market_ticker.like(f"{series_ticker}%"))
        cycles = db.execute(q.offset(offset).limit(limit)).scalars().all()

        # Batch-fetch last coin price per cycle
        cycle_ids = [c.id for c in cycles]
        last_price_map: dict[int, float] = {}
        if cycle_ids:
            max_ts_sq = (
                select(BTCSnapshot.cycle_id, func.max(BTCSnapshot.captured_at).label("max_at"))
                .where(BTCSnapshot.cycle_id.in_(cycle_ids))
                .group_by(BTCSnapshot.cycle_id)
                .subquery()
            )
            price_rows = db.execute(
                select(BTCSnapshot.cycle_id, BTCSnapshot.price_usd)
                .join(max_ts_sq, and_(
                    BTCSnapshot.cycle_id == max_ts_sq.c.cycle_id,
                    BTCSnapshot.captured_at == max_ts_sq.c.max_at,
                ))
            ).all()
            last_price_map = {cid: price for cid, price in price_rows}

    result = []
    for c in cycles:
        coin_price = last_price_map.get(c.id)
        strike = c.target_price
        if coin_price is not None and strike and strike > 0:
            diff = coin_price - strike
            diff_pct = round(diff / strike * 100, 4)
        else:
            diff = diff_pct = None
        result.append(CycleListItem(
            id=c.id,
            cycle_start=c.cycle_start,
            cycle_end=c.cycle_end,
            market_ticker=c.market_ticker,
            market_title=c.market_title,
            target_price=strike,
            coin_price=round(coin_price, 2) if coin_price is not None else None,
            strike_diff=round(diff, 2) if diff is not None else None,
            strike_diff_pct=diff_pct,
            status=c.status.value,
        ))
    return result


@router.get("/{cycle_id}", response_model=CycleDetail)
def get_cycle(cycle_id: int):
    with SessionLocal() as db:
        cycle = db.get(TradingCycle, cycle_id)
        if not cycle:
            raise HTTPException(status_code=404, detail="Cycle not found")
        return cycle
