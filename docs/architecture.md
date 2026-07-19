# Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Docker Compose Network                       │
│                                                                     │
│  ┌──────────────────┐    ┌───────────────────┐    ┌─────────────┐  │
│  │   UI (React)     │────│  Backend (FastAPI) │────│  PostgreSQL │  │
│  │   Port 3000      │    │  Port 8000         │    │  Port 5432  │  │
│  └──────────────────┘    └───────────────────┘    └─────────────┘  │
│                               │                                     │
│                     ┌─────────┴──────────┐                         │
│                     │  Bot Scheduler      │                         │
│                     │  (APScheduler)      │                         │
│                     └─────────┬──────────┘                         │
│                               │                                     │
└───────────────────────────────┼─────────────────────────────────────┘
                                │  HTTP (external)
                    ┌───────────┴───────────┐
                    │                       │
              ┌─────┴──────┐       ┌────────┴───────┐
              │  CoinGecko  │       │ mempool.space  │
              │  (BTC price)│       │ (on-chain data)│
              └─────────────┘       └───────────────┘
                                           │
                                   ┌───────┴───────┐
                                   │  Kalshi API   │
                                   │  (markets +   │
                                   │   orders)     │
                                   └───────────────┘
```

## Component Layers

### 1. Data Layer (`src/data/`)
- **`btc_data.py`** — fetches BTC price (CoinGecko) and mempool stats (mempool.space). Maintains a rolling price history for momentum calculation. No API key required.
- **`kalshi_client.py`** — authenticates to Kalshi API v2 via RSA-PSS signature, discovers active BTC 15-min markets, fetches live YES/NO prices, and places orders.

### 2. Prediction Engine (`src/prediction/engine.py`)
Combines two signals into a `combined_score` (0–1):
- **Kalshi signal**: YES market price / 100 = implied probability
- **BTC signal**: price momentum + mempool fee pressure → mapped to 0–1

```
combined_score = kalshi_weight × yes_prob + btc_weight × btc_score_normalised
```

Decision rules (all thresholds in `config/config.yaml`):
| Condition | Action |
|-----------|--------|
| yes_prob ≥ yes_threshold AND btc_score ≥ btc_bullish_threshold AND combined_score ≥ min_confidence | YES trade |
| no_prob ≥ no_threshold AND btc_score ≤ btc_bearish_threshold AND (1-combined_score) ≥ min_confidence | NO trade |
| otherwise | SKIP |

### 3. Trading Executor (`src/trading/executor.py`)
- **Paper mode**: records trade intent in DB, simulates outcome from actual market resolution
- **Live mode**: calls `POST /portfolio/orders` on Kalshi, stores the order ID
- Contract sizing: `floor(trade_amount_usd / (price_cents / 100))`
- Each contract pays $1.00 on a win. Cost = contracts × (price / 100)

### 4. Bot Scheduler (`src/bot/scheduler.py`)
APScheduler fires `run_cycle()` at `:00`, `:15`, `:30`, `:45` past every hour (UTC).

Cycle timeline:
```
00:00  Market discovered, cycle record created
00–10  BTC snapshot every 60s (10 snapshots total)
10:00  Kalshi market re-fetched, prediction generated
12:00  Trade placed (if action ≠ SKIP)
14:00  Trade window closes
15:00  Market resolves, outcome recorded
```

### 5. API (`src/api/`)
FastAPI with three route groups:
- `GET /api/dashboard/` — full page data in one call (used by UI home page)
- `GET /api/cycles/` — paginated cycle history
- `GET /api/trades/` + `GET /api/trades/performance` — trade history and aggregates

### 6. Database (`src/database/`)
PostgreSQL via SQLAlchemy ORM. Schema:

```
TradingCycle ──→ BTCSnapshot (many)
             ──→ MarketSnapshot (one)
             ──→ PredictionRecord (one)
             ──→ Trade (one, optional)
```

See `src/database/models.py` for full column definitions.

### 7. UI (`ui/`)
React 18 + TypeScript + Vite + TailwindCSS.
- Netflix dark theme (black `#141414`, red `#e50914`, green `#46d369`)
- Polls `/api/dashboard/` every 5 seconds for live updates
- 4 pages: Dashboard, Trades, Analytics, Config
