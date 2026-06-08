from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, select

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
):
    with SessionLocal() as db:
        rows = db.execute(
            select(TradingCycle).order_by(desc(TradingCycle.cycle_start)).offset(offset).limit(limit)
        ).scalars().all()
        return rows


@router.get("/{cycle_id}", response_model=CycleDetail)
def get_cycle(cycle_id: int):
    with SessionLocal() as db:
        cycle = db.get(TradingCycle, cycle_id)
        if not cycle:
            raise HTTPException(status_code=404, detail="Cycle not found")
        return cycle
