# Kalshi BTC Trade Bot

Automated trading bot for Kalshi's BTC 15-minute price events. Uses on-chain BTC data (price momentum + mempool) combined with Kalshi's YES/NO market prices to predict outcomes and trade accordingly.

## Quick Start

```bash
# Build and run everything
docker compose up --build

# UI
open http://localhost:3000

# API docs
open http://localhost:8000/docs
```

## What It Does

Every 15 minutes the bot:
1. Finds the active BTC 15-min Kalshi market
2. Collects BTC price + mempool data for 10 minutes (1 snapshot/min)
3. Combines BTC momentum signal with Kalshi YES/NO probabilities
4. Decides: `YES trade`, `NO trade`, or `SKIP`
5. Places the trade in the 12–14 min window (close to expiry = better odds)
6. Records outcome when market closes

All running as **paper trade** by default — no real money until you flip `paper_trade: false` in `config/config.yaml` and set `ENVIRONMENT=production` in `.env`.

## Key Files

| File | Purpose |
|------|---------|
| `config/config.yaml` | **All tunable parameters** — thresholds, weights, trade amount, paper/live switch |
| `.env` | Credentials — Kalshi API key, DB URL |
| `src/prediction/engine.py` | Prediction logic |
| `src/bot/scheduler.py` | 15-min cycle orchestration |
| `docs/setup.md` | Full setup and configuration guide |
| `docs/architecture.md` | System design decisions |
| `docs/components.md` | Per-component reference |

## Stack

- **Backend**: Python 3.12, FastAPI, APScheduler, SQLAlchemy
- **Database**: PostgreSQL 16
- **UI**: React 18, TypeScript, Vite, TailwindCSS, Recharts (Netflix dark theme)
- **Data**: CoinGecko (price), mempool.space (on-chain), Kalshi API v2
