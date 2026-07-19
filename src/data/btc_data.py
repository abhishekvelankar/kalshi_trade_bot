"""
Fetches coin price and on-chain data from public free APIs:
  - CoinGecko: current price (any coin by coin_id)
  - mempool.space: fee rates, mempool stats, block height (BTC only)

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


# Per-coin ring buffers for momentum computation
_price_histories: dict[str, list[tuple[float, float]]] = {}
_MAX_HISTORY = 15  # minutes


def _record_price(coin_id: str, price: float) -> None:
    if coin_id not in _price_histories:
        _price_histories[coin_id] = []
    now = time.time()
    _price_histories[coin_id].append((now, price))
    cutoff = now - (_MAX_HISTORY * 60)
    hist = _price_histories[coin_id]
    while hist and hist[0][0] < cutoff:
        hist.pop(0)


def _price_change_pct(coin_id: str, minutes_ago: int) -> Optional[float]:
    history = _price_histories.get(coin_id, [])
    if len(history) < 2:
        return None
    now = time.time()
    target_ts = now - (minutes_ago * 60)
    past_prices = [p for ts, p in history if ts <= target_ts]
    if not past_prices:
        return None
    past_price = past_prices[-1]
    current_price = history[-1][1]
    return (current_price - past_price) / past_price


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_coin_price(coin_id: str) -> float:
    url = f"{cfg.coingecko_url}/simple/price"
    resp = httpx.get(url, params={"ids": coin_id, "vs_currencies": "usd"}, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if coin_id not in data:
        raise ValueError(f"CoinGecko returned no data for coin_id={coin_id}")
    return float(data[coin_id]["usd"])


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
    Momentum score: -1.0 (bearish) to +1.0 (bullish).

    Three components, each normalised to [-1, +1]:
      50% — Distance from strike (current vs opening reference)
      30% — 1-minute price change
      20% — 5-minute price change

    Clip thresholds are calibrated for BTC-scale moves (±0.5%).
    Higher-volatility coins (SOL, DOGE) will saturate at ±1.0 more often,
    which is fine — it means the signal is unambiguous.
    """
    score = 0.0
    weight_total = 0.0

    if floor_strike and floor_strike > 0:
        dist = (price_usd - floor_strike) / floor_strike
        normalised = max(-1.0, min(1.0, dist / 0.005))
        score += normalised * 0.50
        weight_total += 0.50

    if price_change_1m is not None:
        normalised = max(-1.0, min(1.0, price_change_1m / 0.002))
        score += normalised * 0.30
        weight_total += 0.30

    if price_change_5m is not None:
        normalised = max(-1.0, min(1.0, price_change_5m / 0.005))
        score += normalised * 0.20
        weight_total += 0.20

    if weight_total == 0:
        return 0.0

    return round(score / weight_total, 4)


def get_snapshot(coin_id: str = "bitcoin", floor_strike: Optional[float] = None) -> BTCSnapshot:
    """
    Fetch price data for the given coin and compute momentum score.
    Mempool data is only fetched for bitcoin (it's BTC-specific).
    """
    price = _fetch_coin_price(coin_id)
    _record_price(coin_id, price)

    market = BTCMarketData(
        price_usd=price,
        price_change_1m=_price_change_pct(coin_id, 1),
        price_change_5m=_price_change_pct(coin_id, 5),
        price_change_10m=_price_change_pct(coin_id, 10),
    )

    mempool = _fetch_mempool() if coin_id == "bitcoin" else MempoolData(None, None, None, None, None)

    momentum = _calc_momentum_score(
        price_usd=price,
        price_change_1m=market.price_change_1m,
        price_change_5m=market.price_change_5m,
        floor_strike=floor_strike,
    )

    return BTCSnapshot(market=market, mempool=mempool, momentum_score=momentum)
