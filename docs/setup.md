# Setup & Running

## Prerequisites

- Docker Desktop 4.x+
- Docker Compose v2
- Git

## Quick Start

```bash
# 1. Clone (already done)
cd ~/Desktop/projects/kalshi/kalshi_trade_bot

# 2. Credentials are already in .env from your zshrc setup.
#    Verify it looks right:
cat .env

# 3. Build and start everything
docker compose up --build

# 4. Open the UI
open http://localhost:3000

# 5. Check backend health
curl http://localhost:8000/health
```

## Services

| Service | URL | Description |
|---------|-----|-------------|
| UI | http://localhost:3000 | Netflix-themed dashboard |
| Backend API | http://localhost:8000 | FastAPI + bot scheduler |
| API Docs | http://localhost:8000/docs | Auto-generated Swagger UI |
| PostgreSQL | localhost:5432 | Database (user/pass: kalshi_bot) |

## Changing Configuration

All bot parameters are in `config/config.yaml`. The config directory is
mounted as a read-only volume, so you can edit it and restart just the
backend — no rebuild needed:

```bash
# Edit parameters
nano config/config.yaml

# Restart backend only
docker compose restart backend
```

Key variables to tune:

| Key | Default | Effect |
|-----|---------|--------|
| `trading.paper_trade` | `true` | Switch to `false` for real money |
| `trading.trade_amount` | `100.0` | USD per trade |
| `prediction.yes_threshold` | `0.60` | Lower = more YES trades taken |
| `prediction.no_threshold` | `0.60` | Lower = more NO trades taken |
| `prediction.min_confidence` | `0.55` | Lower = more trades overall |
| `prediction.kalshi_weight` | `0.60` | Increase to trust Kalshi more |
| `prediction.btc_weight` | `0.40` | Increase to trust BTC signal more |

## Going Live (Real Money)

1. Set `ENVIRONMENT=production` in `.env`
2. Set `paper_trade: false` in `config/config.yaml`
3. Restart: `docker compose restart backend`

> **Warning**: Real trades are irreversible. Test thoroughly in paper mode first.

## Stopping

```bash
docker compose down          # stop containers, keep DB data
docker compose down -v       # stop + delete all data (destructive!)
```

## Viewing Logs

```bash
docker compose logs -f backend   # bot + API logs
docker compose logs -f ui        # nginx logs
docker compose logs -f postgres  # DB logs
```

## Connecting to the Database

```bash
docker exec -it kalshi_postgres psql -U kalshi_bot -d kalshi_bot
```

Useful queries:

```sql
-- All trades
SELECT id, placed_at, side, is_paper, total_cost, outcome, pnl FROM trades ORDER BY placed_at DESC;

-- Win rate
SELECT
  COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
  COUNT(*) FILTER (WHERE outcome = 'loss') AS losses,
  ROUND(COUNT(*) FILTER (WHERE outcome = 'win')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE outcome != 'pending'), 0), 3) AS win_rate
FROM trades;

-- Cycles with their predictions
SELECT c.id, c.market_ticker, c.status, p.action, p.confidence, p.btc_score
FROM trading_cycles c
LEFT JOIN predictions p ON p.cycle_id = c.id
ORDER BY c.cycle_start DESC LIMIT 20;
```
