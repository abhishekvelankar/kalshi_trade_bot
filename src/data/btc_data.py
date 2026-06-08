"""
Fetches BTC price and on-chain data from public free APIs:
  - CoinGecko: current price and recent candles
  - mempool.space: fee rates, mempool stats, block height

No API key required for either source.
"""
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import btc_data as cfg


@dataclass
class BTCMarketData:
    price_usd: float
    price_change_1m: Optional[float]
    price_change_5m: Optional[float]
    price_change_10m: Optional[float]
    captured_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class MempoolData:
    fee_fastest: Optional[float]     # sat/vB
    fee_half_hour: Optional[float]
    mempool_size_bytes: Optional[int]
    mempool_tx_count: Optional[int]
    block_height: Optional[int]


@dataclass
class BTCSnapshot:
    market: BTCMarketData
    mempool: MempoolData
    momentum_score: float  # -1.0 (bearish) to +1.0 (bullish)


# Simple in-memory ring buffer for computing momentum
_price_history: list[tuple[float, float]] = []  # (timestamp, price)
_MAX_HISTORY = 15  # minutes


def _record_price(price: float) -> None:
    now = time.time()
    _price_history.append((now, price))
    cutoff = now - (_MAX_HISTORY * 60)
    while _price_history and _price_history[0][0] < cutoff:
        _price_history.pop(0)


def _price_change_pct(minutes_ago: int) -> Optional[float]:
    if len(_price_history) < 2:
        return None
    now = time.time()
    target_ts = now - (minutes_ago * 60)
    past_prices = [p for ts, p in _price_history if ts <= target_ts]
    if not past_prices:
        return None
    past_price = past_prices[-1]
    current_price = _price_history[-1][1]
    return (current_price - past_price) / past_price


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_btc_price() -> float:
    url = f"{cfg.coingecko_url}/simple/price"
    resp = httpx.get(url, params={"ids": "bitcoin", "vs_currencies": "usd"}, timeout=10)
    resp.raise_for_status()
    return float(resp.json()["bitcoin"]["usd"])


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_mempool() -> MempoolData:
    try:
        fee_resp = httpx.get(f"{cfg.mempool_url}/v1/fees/recommended", timeout=10)
        fee_resp.raise_for_status()
        fees = fee_resp.json()

        mempool_resp = httpx.get(f"{cfg.mempool_url}/mempool", timeout=10)
        mempool_resp.raise_for_status()
        mempool = mempool_resp.json()

        blocks_resp = httpx.get(f"{cfg.mempool_url}/blocks/tip/height", timeout=10)
        blocks_resp.raise_for_status()
        block_height = int(blocks_resp.text.strip())

        return MempoolData(
            fee_fastest=fees.get("fastestFee"),
            fee_half_hour=fees.get("halfHourFee"),
            mempool_size_bytes=mempool.get("vsize"),
            mempool_tx_count=mempool.get("count"),
            block_height=block_height,
        )
    except Exception:
        return MempoolData(None, None, None, None, None)


def _calc_momentum_score(
    price_usd: float,
    price_change_1m: Optional[float],
    price_change_5m: Optional[float],
    floor_strike: Optional[float],
) -> float:
    """
    Momentum score tuned for KXBTC15M: -1.0 (bearish) to +1.0 (bullish).

    KXBTC15M resolves YES if the BRTI average at close >= BRTI average at open
    (floor_strike). Three components, each normalised to [-1, +1]:

      50% — Distance from strike
            (current_price - floor_strike) / floor_strike, clipped at ±0.5%.
            If we're already above the opening reference, YES is winning.

      30% — 1-minute price change, clipped at ±0.2%.
            The most recent momentum is the strongest short-term predictor.

      20% — 5-minute price change, clipped at ±0.5%.
            Medium-term trend context.

    Mempool fees are dropped: they measure block congestion, not price direction.
    Missing components are skipped and remaining weights are rescaled.
    """
    score = 0.0
    weight_total = 0.0

    if floor_strike and floor_strike > 0:
        # How far above/below the opening reference price we currently are.
        # ±0.5% move = max signal (BTC rarely moves more than that in 15 min).
        dist = (price_usd - floor_strike) / floor_strike
        normalised = max(-1.0, min(1.0, dist / 0.005))
        score += normalised * 0.50
        weight_total += 0.50

    if price_change_1m is not None:
        # ±0.2% per minute = typical BTC intra-minute range.
        normalised = max(-1.0, min(1.0, price_change_1m / 0.002))
        score += normalised * 0.30
        weight_total += 0.30

    if price_change_5m is not None:
        # ±0.5% over 5 min = moderate move.
        normalised = max(-1.0, min(1.0, price_change_5m / 0.005))
        score += normalised * 0.20
        weight_total += 0.20

    if weight_total == 0:
        return 0.0

    # Rescale so missing components don't shrink the score range.
    return round(score / weight_total, 4)


def get_snapshot(floor_strike: Optional[float] = None) -> BTCSnapshot:
    """
    Fetch all BTC data and compute momentum score.
    Pass floor_strike (the KXBTC15M opening reference price) so the
    distance-from-strike component can be included in the score.
    """
    price = _fetch_btc_price()
    _record_price(price)

    market = BTCMarketData(
        price_usd=price,
        price_change_1m=_price_change_pct(1),
        price_change_5m=_price_change_pct(5),
        price_change_10m=_price_change_pct(10),
    )

    mempool = _fetch_mempool()

    momentum = _calc_momentum_score(
        price_usd=price,
        price_change_1m=market.price_change_1m,
        price_change_5m=market.price_change_5m,
        floor_strike=floor_strike,
    )

    return BTCSnapshot(market=market, mempool=mempool, momentum_score=momentum)
