"""
Dashboard endpoint — returns the current bot state in a single call
so the UI only needs one request to render the home page.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import and_, desc, func, select

from src.config import trading as trade_cfg, prediction as pred_cfg
from src.database.db import SessionLocal
from src.database.models import BTCSnapshot, Trade, TradingCycle, TradeOutcome

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _parse_skip_reason(reasoning_json: Optional[str]) -> Optional[str]:
    """
    Turn the stored reasoning JSON into a short human-readable explanation
    of why the bot decided not to trade. Returns None for YES/NO actions.
    """
    if not reasoning_json:
        return None
    try:
        r = json.loads(reasoning_json)
        if r.get("action") != "SKIP":
            return None
        # Explicit skip reason set by the engine (e.g. strike position guard)
        if r.get("skip_reason"):
            return r["skip_reason"]

        kalshi = r.get("kalshi", {})
        btc = r.get("btc", {})
        thresholds = r.get("thresholds", {})

        yes_prob = kalshi.get("yes_probability", 0)
        no_prob = round(1 - yes_prob, 4)
        yes_thresh = thresholds.get("yes_threshold", 0.85)
        no_thresh = thresholds.get("no_threshold", 0.85)
        btc_score = btc.get("momentum_score", 0)
        min_conf = thresholds.get("min_confidence", 0.55)
        combined = r.get("combined_score", 0)

        reasons = []

        # Kalshi side strong enough for YES?
        yes_kalshi_ok = yes_prob >= yes_thresh
        # Kalshi side strong enough for NO?
        no_kalshi_ok = no_prob >= no_thresh
        # Combined score clears the floor for each direction
        yes_conf_ok = combined >= min_conf
        no_conf_ok = (1 - combined) >= min_conf

        if not yes_kalshi_ok and not no_kalshi_ok:
            reasons.append(
                f"Kalshi YES {yes_prob*100:.0f}% / NO {no_prob*100:.0f}%"
                f" — neither reached {yes_thresh*100:.0f}% threshold"
            )
        elif yes_kalshi_ok and not yes_conf_ok:
            # Kalshi YES strong but combined score dragged down (BTC opposing)
            reasons.append(
                f"Kalshi YES {yes_prob*100:.0f}% but combined score {combined:.0%}"
                f" below {min_conf:.0%} floor"
                + (f" (BTC bearish drag, score {btc_score:+.2f})" if btc_score < -0.05 else "")
            )
        elif no_kalshi_ok and not no_conf_ok:
            # Kalshi NO strong but inverse confidence dragged down (BTC opposing)
            inv = 1 - combined
            reasons.append(
                f"Kalshi NO {no_prob*100:.0f}% but inverse confidence {inv:.0%}"
                f" below {min_conf:.0%} floor"
                + (f" (BTC bullish drag, score {btc_score:+.2f})" if btc_score > 0.05 else "")
            )
        elif not yes_kalshi_ok:
            reasons.append(
                f"Kalshi YES {yes_prob*100:.0f}% below {yes_thresh*100:.0f}% threshold"
                + (f" (BTC {btc_score:+.2f})" if abs(btc_score) > 0.05 else "")
            )
        elif not no_kalshi_ok:
            reasons.append(
                f"Kalshi NO {no_prob*100:.0f}% below {no_thresh*100:.0f}% threshold"
                + (f" (BTC {btc_score:+.2f})" if abs(btc_score) > 0.05 else "")
            )

        return " · ".join(reasons) if reasons else "Conditions not met"

    except Exception:
        return None


class CurrentConfig(BaseModel):
    paper_trade: bool
    trade_amount: float
    yes_threshold: float
    no_threshold: float
    kalshi_weight: float
    btc_weight: float
    min_confidence: float


class RecentCycleItem(BaseModel):
    id: int
    cycle_start: datetime
    market_ticker: str
    market_title: Optional[str]
    status: str
    # Prediction
    prediction_action: Optional[str]
    prediction_confidence: Optional[float]
    kalshi_yes_prob: Optional[float]
    btc_score: Optional[float]
    skip_reason: Optional[str]
    # Strike vs coin price
    target_price: Optional[float]
    coin_price: Optional[float]
    strike_diff: Optional[float]
    strike_diff_pct: Optional[float]
    # Trade (if taken)
    trade_side: Optional[str]
    trade_cost: Optional[float]
    trade_outcome: Optional[str]
    trade_pnl: Optional[float]
    is_paper: Optional[bool]


class ActiveCycle(BaseModel):
    id: int
    cycle_start: datetime
    market_ticker: str
    market_title: Optional[str]
    status: str
    prediction_action: Optional[str]
    prediction_confidence: Optional[float]
    skip_reason: Optional[str]


class DashboardResponse(BaseModel):
    server_time: datetime
    active_cycle: Optional[ActiveCycle]
    recent_cycles: list[RecentCycleItem]
    wins: int
    losses: int
    total_pnl: float
    win_rate: float
    config: CurrentConfig


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    is_paper: Optional[bool] = Query(None),
    series_ticker: Optional[str] = Query(None),
):
    with SessionLocal() as db:
        # Latest cycle (for hero card)
        latest_cycle = db.execute(
            select(TradingCycle).order_by(desc(TradingCycle.cycle_start)).limit(1)
        ).scalar_one_or_none()

        active: Optional[ActiveCycle] = None
        if latest_cycle:
            pred = latest_cycle.prediction
            skip_reason = _parse_skip_reason(pred.reasoning if pred else None)
            active = ActiveCycle(
                id=latest_cycle.id,
                cycle_start=latest_cycle.cycle_start,
                market_ticker=latest_cycle.market_ticker,
                market_title=latest_cycle.market_title,
                status=latest_cycle.status.value,
                prediction_action=pred.action.value if pred else None,
                prediction_confidence=pred.confidence if pred else None,
                skip_reason=skip_reason,
            )

        # Recent cycles (last 20) with prediction + trade info
        recent_cycles_db = db.execute(
            select(TradingCycle).order_by(desc(TradingCycle.cycle_start)).limit(20)
        ).scalars().all()

        # Batch-fetch last coin price for each recent cycle
        recent_ids = [c.id for c in recent_cycles_db]
        recent_price_map: dict[int, float] = {}
        if recent_ids:
            max_ts_sq = (
                select(BTCSnapshot.cycle_id, func.max(BTCSnapshot.captured_at).label("max_at"))
                .where(BTCSnapshot.cycle_id.in_(recent_ids))
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
            recent_price_map = {cid: price for cid, price in price_rows}

        recent_cycles = []
        for c in recent_cycles_db:
            pred = c.prediction
            trade = c.trade
            coin_price = recent_price_map.get(c.id)
            strike = c.target_price
            if coin_price is not None and strike and strike > 0:
                diff = coin_price - strike
                diff_pct = round(diff / strike * 100, 4)
            else:
                diff = diff_pct = None
            recent_cycles.append(RecentCycleItem(
                id=c.id,
                cycle_start=c.cycle_start,
                market_ticker=c.market_ticker,
                market_title=c.market_title,
                status=c.status.value,
                prediction_action=pred.action.value if pred else None,
                prediction_confidence=pred.confidence if pred else None,
                kalshi_yes_prob=pred.kalshi_yes_prob if pred else None,
                btc_score=pred.btc_score if pred else None,
                skip_reason=_parse_skip_reason(pred.reasoning if pred else None),
                target_price=strike,
                coin_price=round(coin_price, 2) if coin_price is not None else None,
                strike_diff=round(diff, 2) if diff is not None else None,
                strike_diff_pct=diff_pct,
                trade_side=trade.side.value if trade else None,
                trade_cost=trade.total_cost if trade else None,
                trade_outcome=trade.outcome.value if trade else None,
                trade_pnl=trade.pnl if trade else None,
                is_paper=trade.is_paper if trade else None,
            ))

        # Aggregate P&L — optionally filter by paper/live mode and series
        tq = select(Trade)
        if series_ticker:
            tq = tq.join(TradingCycle, Trade.cycle_id == TradingCycle.id).where(
                TradingCycle.market_ticker.like(f"{series_ticker}%")
            )
        all_trades = db.execute(tq).scalars().all()
        if is_paper is not None:
            all_trades = [t for t in all_trades if t.is_paper == is_paper]
        wins = sum(1 for t in all_trades if t.outcome == TradeOutcome.win)
        losses = sum(1 for t in all_trades if t.outcome == TradeOutcome.loss)
        resolved = wins + losses
        total_pnl = sum((t.pnl or 0) for t in all_trades)

    return DashboardResponse(
        server_time=datetime.now(timezone.utc),
        active_cycle=active,
        recent_cycles=recent_cycles,
        wins=wins,
        losses=losses,
        total_pnl=round(total_pnl, 2),
        win_rate=round(wins / resolved, 4) if resolved else 0.0,
        config=CurrentConfig(
            paper_trade=trade_cfg.paper_trade,
            trade_amount=trade_cfg.trade_amount,
            yes_threshold=pred_cfg.yes_threshold,
            no_threshold=pred_cfg.no_threshold,
            kalshi_weight=pred_cfg.kalshi_weight,
            btc_weight=pred_cfg.btc_weight,
            min_confidence=pred_cfg.min_confidence,
        ),
    )
