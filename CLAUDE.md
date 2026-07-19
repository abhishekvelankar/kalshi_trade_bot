# Kalshi Trade Bot — Session Bootstrapping Guide

This file is auto-loaded by Claude Code at session start. Read it before touching any code.

---

## What This Is

An automated trading bot for Kalshi crypto prediction markets. It trades 15-minute YES/NO contracts on whether a coin's price will be at or above a strike price at market close. Currently running 7 coin series in **paper trade mode** (no real money).

- **Backend**: Python + FastAPI + APScheduler (`src/`)
- **Frontend**: React + TypeScript + Tailwind (`ui/`)
- **DB**: PostgreSQL
- **Infra**: Docker Compose (3 containers: `kalshi_backend`, `kalshi_ui`, `kalshi_postgres`)

---

## Active Series

| Ticker | Coin | CoinGecko ID | Trade Amount | Mode |
|--------|------|-------------|-------------|------|
| KXBTC15M | Bitcoin | bitcoin | $50 | paper |
| KXETH15M | Ethereum | ethereum | $50 | paper |
| KXSOL15M | Solana | solana | $50 | paper |
| KXXRP15M | XRP | ripple | $50 | paper |
| KXDOGE15M | Dogecoin | dogecoin | $50 | paper |
| KXHYPE15M | HyperLiquid | hyperliquid | $200 | paper |
| KXBNB15M | BNB | binancecoin | $50 | paper |

---

## Architecture

### Cycle Flow (runs every 15 min per series, offset :00:30/:15:30/:30:30/:45:30 UTC)

```
1. Find active Kalshi market for the series
2. Collect coin price data — 12 snapshots, 1/min via CoinGecko
3. Snapshot market + run prediction engine
4. Wait for trade entry window (min 12, close 15)
5. Execute trade (paper or live)
6. Monitor for stop-loss every 5s until market close
7. Resolve outcome at market close
```

### Key Files

| File | Purpose |
|------|---------|
| `config/config.yaml` | **Volume-mounted** — all tunable params. Edit + restart backend (no rebuild needed) |
| `src/config.py` | Config loader. `get_series_cfg(ticker)` merges per-series overrides with global defaults |
| `src/bot/scheduler.py` | APScheduler orchestration, `run_cycle()`, `_monitor_for_stop_loss()` |
| `src/data/btc_data.py` | CoinGecko price fetcher, per-coin price history ring buffers, momentum score |
| `src/data/kalshi_client.py` | Kalshi REST API client — markets, orders, positions |
| `src/prediction/engine.py` | `predict()` — combines Kalshi market signal + coin momentum signal |
| `src/trading/executor.py` | `execute()`, `exit_position()`, `resolve()` — paper and live order handling |
| `src/api/routes/` | FastAPI endpoints: dashboard, trades, cycles, live |
| `ui/src/context/SeriesContext.tsx` | Active series state + `SERIES_LIST` (one entry per coin) |
| `ui/src/hooks/useApi.ts` | All API hooks — pass `series_ticker` and `is_paper` params |

---

## Prediction Engine (`src/prediction/engine.py`)

**Signal composition:**
- Kalshi YES price (60% weight) — crowd directional view
- Coin momentum score (40% weight) — 50% distance-from-strike + 30% 1m change + 20% 5m change

**Filters (applied in order, any → SKIP):**
1. **Proximity guard** — skip if coin is within `min_strike_distance_pct` (default 0.20%) of strike
2. **Volatility filter** — skip if price crossed the strike more than `max_strike_crossings` (default 1) times during 12-min collection
3. **Strike position guard** — skip NO if coin is above strike; skip YES if coin is below strike

**Thresholds:**
- YES trade: `kalshi_yes_prob >= 0.80` AND `combined_score >= 0.55`
- NO trade: `kalshi_no_prob >= 0.80` AND `(1 - combined_score) >= 0.55`

---

## Stop-Loss (`src/bot/scheduler.py` → `_monitor_for_stop_loss`)

After placing a trade, polls Kalshi every 5 seconds. If the owned side's price drops below **52¢**, exits the position immediately via `executor.exit_position()`. This recovers ~52¢/contract instead of losing the full entry price.

---

## Per-Series Config

All series inherit global defaults. Override any key under `series.active[n]`:

```yaml
series:
  active:
    - ticker: "KXHYPE15M"
      coin_id: "hyperliquid"
      display_name: "HYPE"
      paper_trade: true          # override global trading.paper_trade
      trade_amount: 200.0        # override global trading.trade_amount
      min_strike_distance_pct: 0.20  # override global prediction.min_strike_distance_pct
```

`get_series_cfg(ticker)` in `src/config.py` returns the merged result.

---

## Live vs Paper Trade

- `paper_trade: true` → records intent in DB, simulates payout at resolution. No real API order.
- `paper_trade: false` → places real market order on Kalshi via `kalshi_client.place_order()`
- `ENVIRONMENT=production` in `.env` → Kalshi client uses `api.elections.kalshi.com` (live)
- `ENVIRONMENT=development` → uses `demo-api.kalshi.co`
- **Auto-revert**: if 4 live losses accumulate, `executor.py` reverts `config.yaml` back to paper

To go live on a single series: set `paper_trade: false` on that series entry only, then `docker compose restart backend`.

---

## Docker Operations

```bash
# Restart all (after config.yaml change)
docker compose restart

# Rebuild + restart backend (after Python code change)
docker compose build backend && docker compose up -d backend

# Rebuild + restart UI (after frontend code change)
docker compose build ui && docker compose up -d ui

# Watch logs
docker logs kalshi_backend -f

# Run psql
docker exec kalshi_postgres psql -U kalshi_bot -d kalshi_bot
```

**Important**: Python code is baked into the Docker image — code changes require `docker compose build backend`. Config is volume-mounted — `config.yaml` changes only need `docker compose restart backend`.

---

## Database Schema

| Table | Key Columns |
|-------|------------|
| `trading_cycles` | `id`, `market_ticker`, `target_price`, `status` (running/completed/error), `cycle_start`, `cycle_end`, `error_message` |
| `trades` | `id`, `cycle_id`, `side` (yes/no), `is_paper`, `price_per_contract`, `contracts`, `total_cost`, `outcome` (pending/win/loss), `pnl`, `payout` |
| `predictions` | `id`, `cycle_id`, `action`, `confidence`, `kalshi_yes_prob`, `btc_score`, `combined_score`, `reasoning` (JSON) |
| `btc_snapshots` | `id`, `cycle_id`, `price_usd`, `momentum_score`, `price_change_1m/5m/10m`, mempool fields |
| `market_snapshots` | `id`, `cycle_id`, `yes_price`, `no_price`, `yes_volume`, `no_volume` |

---

## Known Issues & Historical Decisions

- **CoinGecko rate limiting**: With 7 series polling simultaneously, CoinGecko's free tier (30 req/min) can get hit. Current mitigation: 3 retries with exponential backoff. Failed snaps are logged as `cycle.btc_snap_failed` warnings and skipped — the cycle continues with partial data.
- **HYPE losses pattern**: High entry price (80–90¢) trades have poor risk/reward. Proximity filter at 0.20% still passes trades that are too close to the strike. Consider raising HYPE's `min_strike_distance_pct` to 0.35%+ and capping entry at 87¢ max.
- **Stale cycles on restart**: `_cleanup_stale_cycles()` runs at startup and marks any `running` cycles as `error`. Expected behavior.
- **`floor_strike` ordering bug** (fixed): In `engine.py`, `floor_strike` must be assigned before `_count_strike_crossings()` is called. The variable was previously referenced before assignment causing `UnboundLocalError`.

---

## UI Structure

- **Series selector**: Navbar dropdown (stores selection in `localStorage`)
- **Pages**: Dashboard, Live Analysis, Trades, Cycle History, Cycle Detail, Analytics, Config
- **All API hooks** in `useApi.ts` pass `series_ticker` so each page is scoped to the selected series
- **"vs Strike" column** in Trades, CycleHistory, Dashboard tables shows `coin_price - strike_price` (absolute + %)
