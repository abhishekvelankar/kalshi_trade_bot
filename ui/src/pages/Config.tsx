import { useDashboard } from '../hooks/useApi'

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-netflix-border last:border-0">
      <div>
        <p className="text-sm font-medium text-netflix-text">{label}</p>
        {hint && <p className="text-xs text-netflix-dim mt-0.5">{hint}</p>}
      </div>
      <span className="text-sm font-semibold text-netflix-text bg-netflix-card px-3 py-1 rounded-lg ml-4 whitespace-nowrap">
        {value}
      </span>
    </div>
  )
}

export default function Config() {
  const { data } = useDashboard()
  const cfg = data?.config

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configuration</h1>
        <p className="text-netflix-muted text-sm mt-1">
          Read-only view. Edit <code className="text-netflix-red">config/config.yaml</code> and restart the bot to change values.
        </p>
      </div>

      {!cfg ? (
        <div className="card">
          <p className="text-netflix-dim text-sm">Loading config…</p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2 className="font-semibold mb-1">Trading</h2>
            <p className="text-xs text-netflix-dim mb-3">Core trading parameters</p>
            <Row
              label="Mode"
              value={cfg.paper_trade ? 'Paper Trade' : 'Live Trade'}
              hint="Set paper_trade: false in config.yaml to go live"
            />
            <Row
              label="Trade Amount"
              value={`$${cfg.trade_amount} USD`}
              hint="Max USD to spend per trade"
            />
          </div>

          <div className="card">
            <h2 className="font-semibold mb-1">Prediction Thresholds</h2>
            <p className="text-xs text-netflix-dim mb-3">
              Tune these to balance aggression vs. selectivity
            </p>
            <Row
              label="YES Threshold"
              value={`${(cfg.yes_threshold * 100).toFixed(0)}%`}
              hint="Minimum Kalshi YES probability to take a YES trade"
            />
            <Row
              label="NO Threshold"
              value={`${(cfg.no_threshold * 100).toFixed(0)}%`}
              hint="Minimum Kalshi NO probability to take a NO trade"
            />
            <Row
              label="Min Confidence"
              value={`${(cfg.min_confidence * 100).toFixed(0)}%`}
              hint="Combined score floor before any trade is placed"
            />
          </div>

          <div className="card">
            <h2 className="font-semibold mb-1">Signal Weights</h2>
            <p className="text-xs text-netflix-dim mb-3">
              Must sum to 1.0 — how much each signal contributes to the combined score
            </p>
            <Row
              label="Kalshi Weight"
              value={`${(cfg.kalshi_weight * 100).toFixed(0)}%`}
              hint="Weight of YES/NO market probability"
            />
            <Row
              label="BTC Momentum Weight"
              value={`${(cfg.btc_weight * 100).toFixed(0)}%`}
              hint="Weight of on-chain price momentum signal"
            />
          </div>
        </>
      )}
    </div>
  )
}
