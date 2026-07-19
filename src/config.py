"""
Loads config.yaml and merges with environment variables.
All other modules import settings from here — never read .env directly.
"""
import os
from pathlib import Path
from typing import Optional

import yaml
from dotenv import load_dotenv

load_dotenv()

_CONFIG_PATH = Path(__file__).parent.parent / "config" / "config.yaml"


def _load_yaml() -> dict:
    with open(_CONFIG_PATH) as f:
        return yaml.safe_load(f)


_raw = _load_yaml()


class TradingConfig:
    paper_trade: bool = _raw["trading"]["paper_trade"]
    trade_amount: float = _raw["trading"]["trade_amount"]
    min_profit_margin_cents: int = _raw["trading"]["min_profit_margin_cents"]
    starting_balance: float = _raw["trading"]["starting_balance"]


class KalshiConfig:
    api_key_id: str = os.environ["KALSHI_API_KEY_ID"]
    private_key: str = os.environ["KALSHI_PRIVATE_KEY"]
    demo_base_url: str = _raw["kalshi"]["demo_base_url"]
    live_base_url: str = _raw["kalshi"]["live_base_url"]
    trade_cutoff_seconds: int = _raw["kalshi"]["trade_cutoff_seconds"]

    @property
    def base_url(self) -> str:
        env = os.getenv("ENVIRONMENT", "development")
        return self.live_base_url if env == "production" else self.demo_base_url


class PredictionConfig:
    yes_threshold: float = _raw["prediction"]["yes_threshold"]
    no_threshold: float = _raw["prediction"]["no_threshold"]
    btc_bullish_threshold: float = _raw["prediction"]["btc_bullish_threshold"]
    btc_bearish_threshold: float = _raw["prediction"]["btc_bearish_threshold"]
    kalshi_weight: float = _raw["prediction"]["kalshi_weight"]
    btc_weight: float = _raw["prediction"]["btc_weight"]
    min_confidence: float = _raw["prediction"]["min_confidence"]
    min_strike_distance_pct: float = _raw["prediction"].get("min_strike_distance_pct", 0.20)
    max_strike_crossings: int = _raw["prediction"].get("max_strike_crossings", 1)


class TimingConfig:
    data_collection_window_minutes: int = _raw["timing"]["data_collection_window_minutes"]
    trade_entry_start_minutes: int = _raw["timing"]["trade_entry_start_minutes"]
    trade_entry_end_minutes: int = _raw["timing"]["trade_entry_end_minutes"]
    cycle_minutes: int = _raw["timing"]["cycle_minutes"]
    btc_poll_interval_seconds: int = _raw["timing"]["btc_poll_interval_seconds"]


class BTCDataConfig:
    coingecko_url: str = _raw["btc_data"]["coingecko_url"]
    mempool_url: str = _raw["btc_data"]["mempool_url"]
    momentum_lookback_minutes: int = _raw["btc_data"]["momentum_lookback_minutes"]


class DatabaseConfig:
    url: str = os.getenv("DATABASE_URL", _raw["database"]["url"])


class APIConfig:
    host: str = _raw["api"]["host"]
    port: int = _raw["api"]["port"]
    poll_interval_ms: int = _raw["api"]["poll_interval_ms"]


_sl = _raw.get("stop_loss", {})


class StopLossConfig:
    enabled: bool = _sl.get("enabled", True)
    threshold_cents: float = _sl.get("threshold_cents", 60.0)
    check_interval_seconds: int = _sl.get("check_interval_seconds", 30)


_series_active = _raw.get("series", {}).get("active", [
    {"ticker": "KXBTC15M", "coin_id": "bitcoin", "display_name": "BTC"},
])


class SeriesConfig:
    active: list = _series_active
    coin_map: dict = {s["ticker"]: s["coin_id"] for s in _series_active}
    tickers: list = [s["ticker"] for s in _series_active]


trading = TradingConfig()
kalshi = KalshiConfig()
prediction = PredictionConfig()
timing = TimingConfig()
btc_data = BTCDataConfig()
database = DatabaseConfig()
api = APIConfig()
series = SeriesConfig()
stop_loss = StopLossConfig()


def get_series_cfg(ticker: str) -> dict:
    """Return effective config for a series, merging per-series overrides with global defaults."""
    s = next((x for x in series.active if x["ticker"] == ticker), {})
    return {
        "paper_trade": bool(s.get("paper_trade", trading.paper_trade)),
        "trade_amount": float(s.get("trade_amount", trading.trade_amount)),
        "min_strike_distance_pct": float(s.get("min_strike_distance_pct", prediction.min_strike_distance_pct)),
    }
