"""
Prediction engine.

Combines:
  1. Kalshi market signal  — the YES probability implied by current market price
  2. BTC momentum signal   — derived from recent price changes and mempool activity

Decision matrix:
  combined_score > yes_threshold  → YES trade
  combined_score < (1 - no_threshold) → NO trade
  otherwise                        → SKIP

All thresholds come from config/config.yaml so they can be tuned without
touching this file.
"""
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from src.config import prediction as cfg
from src.data.btc_data import BTCSnapshot
from src.data.kalshi_client import KalshiMarket
from src.database.models import TradeAction


@dataclass
class Prediction:
    action: TradeAction
    confidence: float           # 0.0 - 1.0
    btc_score: float            # -1.0 to +1.0
    kalshi_yes_prob: float      # 0.0 - 1.0 (derived from yes_price / 100)
    combined_score: float       # 0.0 - 1.0
    reasoning: str              # JSON string with full breakdown
    predicted_at: datetime


def _btc_score_to_prob(btc_score: float) -> float:
    """Map BTC momentum score (-1 to +1) onto a 0–1 bullish probability."""
    return (btc_score + 1.0) / 2.0


def _build_reasoning(
    btc_score: float,
    btc_score_as_prob: float,
    kalshi_yes_prob: float,
    combined_score: float,
    action: TradeAction,
    btc_snapshot: BTCSnapshot,
    market: KalshiMarket,
    strike_block: Optional[str] = None,
) -> str:
    breakdown = {
        "action": action.value,
        "combined_score": round(combined_score, 4),
        "kalshi": {
            "yes_price_cents": market.yes_price,
            "no_price_cents": market.no_price,
            "yes_probability": round(kalshi_yes_prob, 4),
            "weight": cfg.kalshi_weight,
        },
        "btc": {
            "momentum_score": btc_score,
            "as_probability": round(btc_score_as_prob, 4),
            "price_usd": btc_snapshot.market.price_usd,
            "price_change_1m_pct": btc_snapshot.market.price_change_1m,
            "price_change_5m_pct": btc_snapshot.market.price_change_5m,
            "floor_strike": market.target_price,
            "dist_from_strike_pct": round(
                (btc_snapshot.market.price_usd - market.target_price) / market.target_price * 100, 4
            ) if market.target_price else None,
            "weight": cfg.btc_weight,
        },
        "thresholds": {
            "yes_threshold": cfg.yes_threshold,
            "no_threshold": cfg.no_threshold,
            "btc_bullish": cfg.btc_bullish_threshold,
            "btc_bearish": cfg.btc_bearish_threshold,
            "min_confidence": cfg.min_confidence,
        },
    }
    if strike_block:
        breakdown["skip_reason"] = strike_block
    return json.dumps(breakdown)


def predict(
    btc_snapshots: list[BTCSnapshot],
    market: KalshiMarket,
) -> Prediction:
    """
    Generate a trading prediction from the accumulated BTC snapshots
    and the current Kalshi market state.

    btc_snapshots: all snapshots collected in the 0-10 min data window.
                   We use the most recent for momentum and average for stability.
    """
    if not btc_snapshots:
        return Prediction(
            action=TradeAction.SKIP,
            confidence=0.0,
            btc_score=0.0,
            kalshi_yes_prob=0.5,
            combined_score=0.5,
            reasoning=json.dumps({"error": "no BTC data"}),
            predicted_at=datetime.now(timezone.utc),
        )

    # Use the most recent snapshot's momentum score but average across last 3
    # to reduce noise from a single volatile reading
    recent = btc_snapshots[-min(3, len(btc_snapshots)):]
    btc_score = sum(s.momentum_score for s in recent) / len(recent)

    # Kalshi YES probability (market price in cents / 100)
    kalshi_yes_prob = market.yes_price / 100.0

    # Convert BTC score to a 0–1 bullish probability
    btc_score_as_prob = _btc_score_to_prob(btc_score)

    # Weighted combination
    combined_score = (
        cfg.kalshi_weight * kalshi_yes_prob
        + cfg.btc_weight * btc_score_as_prob
    )

    # Determine action.
    # The combined_score already incorporates BTC direction (40% weight),
    # so no separate directional gate is needed — it would double-gate the
    # signal and block obvious trades when Kalshi is extreme but BTC is neutral.
    kalshi_no_prob = 1.0 - kalshi_yes_prob

    if (
        kalshi_yes_prob >= cfg.yes_threshold
        and combined_score >= cfg.min_confidence
    ):
        action = TradeAction.YES
        confidence = combined_score
    elif (
        kalshi_no_prob >= cfg.no_threshold
        and (1.0 - combined_score) >= cfg.min_confidence
    ):
        action = TradeAction.NO
        confidence = 1.0 - combined_score
    else:
        action = TradeAction.SKIP
        # Confidence in SKIP = how far we are from both thresholds
        confidence = 1.0 - max(
            abs(combined_score - cfg.yes_threshold),
            abs((1 - combined_score) - cfg.no_threshold),
        )

    # ── Strike position guard ──────────────────────────────────────────────
    # KXBTC15M resolves YES if BRTI at close ≥ floor_strike.
    # If BTC is currently above the strike, trading NO contradicts the most
    # direct signal available (price vs threshold). Vice-versa for YES.
    # This catches cases where yes_bid_dollars = 0 creates a false NO signal
    # even though BTC is clearly above the strike.
    strike_block: Optional[str] = None
    last_price = btc_snapshots[-1].market.price_usd
    floor_strike = market.target_price

    if floor_strike and action == TradeAction.NO and last_price > floor_strike:
        strike_block = (
            f"BTC ${last_price:,.0f} is above floor strike ${floor_strike:,.0f} "
            f"— NO trade blocked (direct conflict)"
        )
        action = TradeAction.SKIP
        confidence = 0.0
    elif floor_strike and action == TradeAction.YES and last_price < floor_strike:
        strike_block = (
            f"BTC ${last_price:,.0f} is below floor strike ${floor_strike:,.0f} "
            f"— YES trade blocked (direct conflict)"
        )
        action = TradeAction.SKIP
        confidence = 0.0

    reasoning = _build_reasoning(
        btc_score, btc_score_as_prob, kalshi_yes_prob,
        combined_score, action, btc_snapshots[-1], market,
        strike_block=strike_block,
    )

    return Prediction(
        action=action,
        confidence=round(confidence, 4),
        btc_score=round(btc_score, 4),
        kalshi_yes_prob=round(kalshi_yes_prob, 4),
        combined_score=round(combined_score, 4),
        reasoning=reasoning,
        predicted_at=datetime.now(timezone.utc),
    )
