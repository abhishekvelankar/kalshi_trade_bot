# Component Reference

## `src/data/btc_data.py`

### `get_snapshot() → BTCSnapshot`
Main entry point. Fetches price from CoinGecko and mempool stats from mempool.space,
computes momentum, returns a `BTCSnapshot`.

**Momentum score formula:**
```
score = (5m_change / 0.01 × 0.50) + (10m_change / 0.01 × 0.30) + (fee_pressure × 0.20)
```
Where fee pressure = `(fastest_fee - 25) / 25`, clipped to [-1, 1].
The 0.01 normaliser means a 1% price change maps to a score of 1.0 (maximum bullish).

### Price history ring buffer
`_price_history` is an in-memory list of `(timestamp, price)` tuples. It's populated
every time `get_snapshot()` is called. On restart it is empty — the first 5 and 10
minutes of a new container run will have `None` for momentum until enough data accumulates.

---

## `src/data/kalshi_client.py`

### Authentication
Every request signs `timestamp_ms + METHOD + /path` with the RSA private key
from `KALSHI_PRIVATE_KEY` env var. The path must NOT include the query string.

### `find_active_btc_market() → KalshiMarket | None`
Searches for open markets in the `KXBTC` series (configurable via `kalshi.btc_series_ticker`)
with a close time in the next 16 minutes. Returns the one closing soonest.
Returns `None` if no market is found (between cycles, market not yet opened, etc).

### `get_market(ticker) → KalshiMarket`
Fetches live YES/NO prices for a specific ticker. Call this just before placing
a trade to get the most current prices.

### `place_order(...) → OrderResult`
Places a real limit order. Only called when `trading.paper_trade = false`.

---

## `src/prediction/engine.py`

### `predict(btc_snapshots, market) → Prediction`
Takes the list of `BTCSnapshot` objects collected during the data window and
the current `KalshiMarket` state. Returns a `Prediction` with:

| Field | Description |
|-------|-------------|
| `action` | `YES`, `NO`, or `SKIP` |
| `confidence` | 0–1, how sure we are about the action |
| `btc_score` | Average momentum score across last 3 snapshots |
| `kalshi_yes_prob` | `yes_price / 100` |
| `combined_score` | Weighted blend of both signals |
| `reasoning` | JSON string with full breakdown (stored in DB for tuning) |

### Tuning Tips
- High false positives (trading too much): raise `min_confidence` or thresholds
- Missing good trades (too conservative): lower thresholds or `min_confidence`
- BTC signal too noisy: lower `btc_weight`, raise `kalshi_weight`
- Kalshi market is mispriced: raise `btc_weight`

---

## `src/trading/executor.py`

### `execute(cycle_id, market, prediction) → Trade | None`
- Returns `None` if action is `SKIP`
- In paper mode: creates `Trade` record with `is_paper=True`, no Kalshi API call
- In live mode: calls `kalshi_client.place_order()`, stores `kalshi_order_id`

### `resolve(trade, market_resolved_yes)`
Called when the market closes. For YES-side trades: win if `market_resolved_yes=True`.
For NO-side trades: win if `market_resolved_yes=False`.
Updates `outcome`, `payout`, `pnl` in the DB.

---

## `src/bot/scheduler.py`

### `run_cycle()`
The full 15-minute lifecycle. This function is blocking — it runs for up to 15 minutes.
APScheduler calls it with `max_instances=1` to prevent overlapping cycles.

Error handling: any exception marks the cycle as `error` in the DB and logs the
message. The bot continues to the next cycle.

### `start_scheduler() → BackgroundScheduler`
Called once at app startup. Returns the scheduler for graceful shutdown if needed.

---

## `src/api/main.py`

FastAPI app with:
- CORS middleware (open for local dev, tighten in production)
- 3 route groups: `/api/dashboard/`, `/api/cycles/`, `/api/trades/`
- `GET /health` — for Docker healthcheck

---

## UI Pages

| Page | Route | Refresh rate | Key data |
|------|-------|-------------|----------|
| Dashboard | `/` | 5s | Active cycle, latest prediction, recent trades, P&L |
| Trades | `/trades` | 10s | Full trade history with filters |
| Analytics | `/analytics` | 15s | P&L chart, outcome pie, ROI |
| Config | `/config` | 5s (via dashboard) | Current config params (read-only) |
