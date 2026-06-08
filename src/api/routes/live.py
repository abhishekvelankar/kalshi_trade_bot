"""
Live analysis endpoint.

GET /api/live/          — current running cycle (or most recent)
GET /api/live/{id}      — any historical cycle by ID

Both return LiveAnalysisResponse so the UI can reuse the same components.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select

from src.config import timing as t_cfg
from src.database.db import SessionLocal
from src.database.models import TradingCycle, CycleStatus
from src.api.routes.dashboard import _parse_skip_reason

router = APIRouter(prefix="/live", tags=["live"])


def _cycle_config():
    from src.config import prediction as pred_cfg
    return CycleConfig(
        data_window_minutes=t_cfg.data_collection_window_minutes,
        trade_start_minutes=t_cfg.trade_entry_start_minutes,
        trade_end_minutes=t_cfg.trade_entry_end_minutes,
        cycle_minutes=t_cfg.cycle_minutes,
        yes_threshold=pred_cfg.yes_threshold,
        no_threshold=pred_cfg.no_threshold,
    )


def _phase(elapsed: float, status: str, has_prediction: bool) -> str:
    if status == "error":
        return "error"
    if status == "completed":
        return "completed"
    data_end = t_cfg.data_collection_window_minutes * 60
    trade_start = t_cfg.trade_entry_start_minutes * 60
    trade_end = t_cfg.trade_entry_end_minutes * 60
    if elapsed < data_end:
        return "collecting"
    if elapsed < trade_start:
        return "predicting"
    if elapsed < trade_end:
        return "trading"
    return "resolving"


# ── Response models ────────────────────────────────────────────────────────────

class LiveBTCSnapshot(BaseModel):
    minute: int
    captured_at: datetime
    price_usd: float
    price_change_1m: Optional[float]
    price_change_5m: Optional[float]
    price_change_10m: Optional[float]
    momentum_score: Optional[float]
    mempool_fee_fastest: Optional[float]
    mempool_fee_half_hour: Optional[float]
    mempool_tx_count: Optional[int]
    mempool_size_bytes: Optional[int]
    block_height: Optional[int]


class LiveMarketState(BaseModel):
    captured_at: datetime
    yes_price: float
    no_price: float
    yes_prob: float
    no_prob: float
    close_time: Optional[datetime]


class LivePrediction(BaseModel):
    action: str
    confidence: float
    btc_score: float
    kalshi_yes_prob: float
    combined_score: float
    skip_reason: Optional[str]
    reasoning_detail: Optional[dict]


class LiveTrade(BaseModel):
    side: str
    contracts: int
    price_per_contract: float
    total_cost: float
    is_paper: bool
    outcome: str
    pnl: Optional[float]


class CycleConfig(BaseModel):
    data_window_minutes: int
    trade_start_minutes: int
    trade_end_minutes: int
    cycle_minutes: int
    yes_threshold: float
    no_threshold: float


class LiveAnalysisResponse(BaseModel):
    has_active_cycle: bool
    is_live: bool

    cycle_id: Optional[int]
    cycle_start: Optional[datetime]
    market_ticker: Optional[str]
    market_title: Optional[str]
    target_price: Optional[float]
    status: Optional[str]
    elapsed_seconds: Optional[float]
    phase: Optional[str]

    btc_snapshots: list[LiveBTCSnapshot]
    market_state: Optional[LiveMarketState]
    prediction: Optional[LivePrediction]
    trade: Optional[LiveTrade]
    cycle_config: CycleConfig


# ── Shared builder ─────────────────────────────────────────────────────────────

def _build_response(cycle: TradingCycle, is_live: bool) -> LiveAnalysisResponse:
    now = datetime.now(timezone.utc)
    elapsed = (now - cycle.cycle_start).total_seconds()

    snapshots = sorted(cycle.btc_snapshots, key=lambda s: s.captured_at)
    btc_out = [
        LiveBTCSnapshot(
            minute=i + 1,
            captured_at=s.captured_at,
            price_usd=s.price_usd,
            price_change_1m=s.price_change_1m,
            price_change_5m=s.price_change_5m,
            price_change_10m=s.price_change_10m,
            momentum_score=s.momentum_score,
            mempool_fee_fastest=s.mempool_fee_fastest,
            mempool_fee_half_hour=s.mempool_fee_half_hour,
            mempool_tx_count=s.mempool_tx_count,
            mempool_size_bytes=s.mempool_size_bytes,
            block_height=s.block_height,
        )
        for i, s in enumerate(snapshots)
    ]

    ms = cycle.market_snapshot
    market_out = None
    if ms:
        market_out = LiveMarketState(
            captured_at=ms.captured_at,
            yes_price=ms.yes_price,
            no_price=ms.no_price,
            yes_prob=round(ms.yes_price / 100, 4),
            no_prob=round(ms.no_price / 100, 4),
            close_time=ms.close_time,
        )

    pred = cycle.prediction
    pred_out = None
    if pred:
        detail = None
        try:
            detail = json.loads(pred.reasoning) if pred.reasoning else None
        except Exception:
            pass
        pred_out = LivePrediction(
            action=pred.action.value,
            confidence=pred.confidence,
            btc_score=pred.btc_score,
            kalshi_yes_prob=pred.kalshi_yes_prob,
            combined_score=pred.combined_score,
            skip_reason=_parse_skip_reason(pred.reasoning),
            reasoning_detail=detail,
        )

    trade = cycle.trade
    trade_out = None
    if trade:
        trade_out = LiveTrade(
            side=trade.side.value,
            contracts=trade.contracts,
            price_per_contract=trade.price_per_contract,
            total_cost=trade.total_cost,
            is_paper=trade.is_paper,
            outcome=trade.outcome.value,
            pnl=trade.pnl,
        )

    phase = _phase(elapsed, cycle.status.value, pred is not None)

    return LiveAnalysisResponse(
        has_active_cycle=True,
        is_live=is_live,
        cycle_id=cycle.id,
        cycle_start=cycle.cycle_start,
        market_ticker=cycle.market_ticker,
        market_title=cycle.market_title,
        target_price=cycle.target_price,
        status=cycle.status.value,
        elapsed_seconds=round(elapsed, 1),
        phase=phase,
        btc_snapshots=btc_out,
        market_state=market_out,
        prediction=pred_out,
        trade=trade_out,
        cycle_config=_cycle_config(),
    )


def _empty_response() -> LiveAnalysisResponse:
    return LiveAnalysisResponse(
        has_active_cycle=False,
        is_live=False,
        cycle_id=None, cycle_start=None, market_ticker=None,
        market_title=None, target_price=None, status=None,
        elapsed_seconds=None, phase=None,
        btc_snapshots=[], market_state=None, prediction=None, trade=None,
        cycle_config=_cycle_config(),
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=LiveAnalysisResponse)
def get_live_analysis():
    with SessionLocal() as db:
        cycle = db.execute(
            select(TradingCycle)
            .where(TradingCycle.status == CycleStatus.running)
            .order_by(desc(TradingCycle.cycle_start))
            .limit(1)
        ).scalar_one_or_none()

        is_live = cycle is not None

        if not cycle:
            cycle = db.execute(
                select(TradingCycle).order_by(desc(TradingCycle.cycle_start)).limit(1)
            ).scalar_one_or_none()

        if not cycle:
            return _empty_response()

        return _build_response(cycle, is_live)


@router.get("/{cycle_id}", response_model=LiveAnalysisResponse)
def get_cycle_analysis(cycle_id: int):
    with SessionLocal() as db:
        cycle = db.get(TradingCycle, cycle_id)
        if not cycle:
            raise HTTPException(status_code=404, detail="Cycle not found")
        return _build_response(cycle, is_live=False)
