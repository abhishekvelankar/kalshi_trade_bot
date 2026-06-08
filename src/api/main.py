"""
FastAPI application entry point.
Mounts all routers, starts the background bot scheduler on startup.
"""
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import cycles, trades, dashboard, live
from src.bot.scheduler import start_scheduler
from src.database.db import init_db

log = structlog.get_logger()

app = FastAPI(
    title="Kalshi BTC Trade Bot",
    description="Automated BTC 15-min event trader using on-chain data + Kalshi signals",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tightened in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router, prefix="/api")
app.include_router(cycles.router, prefix="/api")
app.include_router(trades.router, prefix="/api")
app.include_router(live.router, prefix="/api")


@app.on_event("startup")
def on_startup():
    log.info("app.startup")
    init_db()
    start_scheduler()


@app.get("/health")
def health():
    return {"status": "ok"}
