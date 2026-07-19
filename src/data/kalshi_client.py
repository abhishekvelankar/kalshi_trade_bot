"""
Kalshi REST API v2 client.

Authentication: RSA-PSS SHA-256 signature over (timestamp_ms + METHOD + /path).
Headers: KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE.

All public methods raise httpx.HTTPStatusError on non-2xx responses.
"""
import base64
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import httpx
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import kalshi as cfg


@dataclass
class KalshiMarket:
    ticker: str
    title: str
    yes_price: float   # cents (0-100)
    no_price: float    # cents (0-100)
    yes_volume: int
    no_volume: int
    open_interest: int
    close_time: Optional[datetime]
    target_price: Optional[float]  # floor_strike from Kalshi
    result: Optional[str] = None   # "yes", "no", or "" when still open


@dataclass
class OrderResult:
    order_id: str
    ticker: str
    side: str
    contracts: int
    price: float
    status: str


def _load_private_key():
    key_pem = cfg.private_key.strip()
    if not key_pem.startswith("-----"):
        raise ValueError("KALSHI_PRIVATE_KEY does not look like a PEM-encoded key")
    return serialization.load_pem_private_key(
        key_pem.encode(),
        password=None,
        backend=default_backend(),
    )


def _sign(message: str) -> str:
    private_key = _load_private_key()
    signature = private_key.sign(
        message.encode("utf-8"),
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.DIGEST_LENGTH,
        ),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")


def _auth_headers(method: str, path: str) -> dict:
    timestamp_ms = str(int(time.time() * 1000))
    # Signature covers timestamp + METHOD + full_path (including /trade-api/v2 prefix)
    base_path = urlparse(cfg.base_url).path  # e.g. /trade-api/v2
    full_path = base_path + path             # e.g. /trade-api/v2/portfolio/balance
    message = timestamp_ms + method.upper() + full_path
    return {
        "KALSHI-ACCESS-KEY": cfg.api_key_id,
        "KALSHI-ACCESS-TIMESTAMP": timestamp_ms,
        "KALSHI-ACCESS-SIGNATURE": _sign(message),
        "Content-Type": "application/json",
    }


def _get(path: str, params: dict | None = None) -> dict:
    url = cfg.base_url + path
    headers = _auth_headers("GET", path)
    resp = httpx.get(url, headers=headers, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _post(path: str, body: dict) -> dict:
    url = cfg.base_url + path
    headers = _auth_headers("POST", path)
    resp = httpx.post(url, headers=headers, json=body, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _parse_target_price(m: dict) -> Optional[float]:
    """
    Extract the strike/target price from a market dict.
    KXBTC15M provides it as 'floor_strike' (float, USD).
    KXBTC and older series embed it in the title as '$97,500'.
    """
    if "floor_strike" in m and m["floor_strike"]:
        return float(m["floor_strike"])
    import re
    title = m.get("title", "")
    match = re.search(r"\$([0-9,]+(?:\.[0-9]+)?)", title)
    if match:
        return float(match.group(1).replace(",", ""))
    return None


def _parse_yes_price(m: dict) -> float:
    """
    Return the YES price in cents.
    KXBTC15M uses yes_bid_dollars (dollar string, e.g. '0.53').
    Older series use yes_ask / yes_bid as integer cents.

    Guard: yes_bid_dollars can be "0.0000" on an unresolved market when
    there are simply no active YES buyers (a liquidity gap, not true 0%
    probability). In that case we infer from no_ask_dollars and apply a
    2-cent floor so the Kalshi signal doesn't read as absolute certainty.
    Resolved markets (result field is set) are allowed to reach 0.
    """
    if "yes_bid_dollars" in m:
        val = float(m["yes_bid_dollars"] or 0)
        is_resolved = bool(m.get("result"))
        if val == 0 and not is_resolved:
            no_ask = float(m.get("no_ask_dollars") or 1)
            return round(max((1.0 - no_ask) * 100, 2.0), 2)
        return round(val * 100, 2)
    return float(m.get("yes_ask", m.get("yes_bid", 50)))


def _parse_no_price(m: dict) -> float:
    """
    Return the NO price in cents.
    KXBTC15M uses no_ask_dollars (dollar string, e.g. '0.47').
    Older series use no_ask / no_bid as integer cents.
    """
    if "no_ask_dollars" in m:
        val = float(m["no_ask_dollars"] or 0)
        return round(val * 100, 2)
    return float(m.get("no_ask", m.get("no_bid", 50)))


def _parse_close_time(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def find_active_market(series_ticker: str) -> Optional[KalshiMarket]:
    """
    Search for the currently active 15-min market for the given series.
    Returns the market closest to closing (most urgent).
    """
    now_ts = int(time.time())
    # Markets open at :00/:15/:30/:45 and close 15 min later.
    # Allow up to 20 min so we always catch the current cycle's market.
    data = _get("/markets", params={
        "series_ticker": series_ticker,
        "status": "open",
        "limit": 20,
        "min_close_ts": now_ts + cfg.trade_cutoff_seconds,
        "max_close_ts": now_ts + 20 * 60,
    })

    markets = data.get("markets", [])
    if not markets:
        return None

    # Pick the market closing soonest
    markets.sort(key=lambda m: m.get("close_time", ""))
    m = markets[0]

    return KalshiMarket(
        ticker=m["ticker"],
        title=m.get("title", ""),
        yes_price=_parse_yes_price(m),
        no_price=_parse_no_price(m),
        yes_volume=int(float(m.get("volume_24h_fp", m.get("volume_24h", 0)) or 0)),
        no_volume=0,
        open_interest=int(float(m.get("open_interest_fp", m.get("open_interest", 0)) or 0)),
        close_time=_parse_close_time(m.get("close_time")),
        target_price=_parse_target_price(m),
        result=m.get("result") or None,
    )


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def get_market(ticker: str) -> KalshiMarket:
    """Fetch up-to-date prices for a specific market ticker."""
    data = _get(f"/markets/{ticker}")
    m = data.get("market", data)

    return KalshiMarket(
        ticker=m["ticker"],
        title=m.get("title", ""),
        yes_price=_parse_yes_price(m),
        no_price=_parse_no_price(m),
        yes_volume=int(float(m.get("volume_24h_fp", m.get("volume_24h", 0)) or 0)),
        no_volume=0,
        open_interest=int(float(m.get("open_interest_fp", m.get("open_interest", 0)) or 0)),
        close_time=_parse_close_time(m.get("close_time")),
        target_price=_parse_target_price(m),
        result=m.get("result") or None,
    )


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=5))
def place_order(
    ticker: str,
    side: str,          # "yes" or "no"
    contracts: int,
    price_cents: int,   # limit price in cents
) -> OrderResult:
    """Place a real limit order on Kalshi."""
    body = {
        "ticker": ticker,
        "action": "buy",
        "side": side,
        "type": "limit",
        "count": contracts,
        f"{side}_price": price_cents,
    }
    data = _post("/portfolio/orders", body)
    order = data.get("order", data)
    return OrderResult(
        order_id=order.get("order_id", ""),
        ticker=ticker,
        side=side,
        contracts=contracts,
        price=price_cents,
        status=order.get("status", "unknown"),
    )


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=5))
def sell_contracts(
    ticker: str,
    side: str,      # "yes" or "no" — the side we own
    contracts: int,
) -> OrderResult:
    """Sell (exit) a position at market price."""
    body = {
        "ticker": ticker,
        "action": "sell",
        "side": side,
        "type": "market",
        "count": contracts,
    }
    data = _post("/portfolio/orders", body)
    order = data.get("order", data)
    return OrderResult(
        order_id=order.get("order_id", ""),
        ticker=ticker,
        side=side,
        contracts=contracts,
        price=0,
        status=order.get("status", "unknown"),
    )


def get_balance() -> float:
    """Return available portfolio balance in USD."""
    data = _get("/portfolio/balance")
    return float(data.get("balance", 0)) / 100  # Kalshi returns cents


def get_order_status(order_id: str) -> dict:
    return _get(f"/portfolio/orders/{order_id}")
