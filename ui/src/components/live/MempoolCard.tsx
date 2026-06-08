import type { LiveBTCSnapshot } from '../../types'

interface Props {
  snapshots: LiveBTCSnapshot[]
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-netflix-border/40 last:border-0">
      <span className="text-xs text-netflix-muted">{label}</span>
      <span className="text-xs font-semibold text-netflix-text">{value}</span>
    </div>
  )
}

export default function MempoolCard({ snapshots }: Props) {
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null

  if (!latest) {
    return (
      <div className="card flex items-center justify-center min-h-32">
        <p className="text-netflix-dim text-sm">Awaiting mempool data…</p>
      </div>
    )
  }

  const feeDesc =
    latest.mempool_fee_fastest != null
      ? latest.mempool_fee_fastest > 50
        ? 'High'
        : latest.mempool_fee_fastest < 10
        ? 'Low'
        : 'Normal'
      : '—'

  const mempoolMB =
    latest.mempool_size_bytes != null
      ? `${(latest.mempool_size_bytes / 1_000_000).toFixed(1)} MB`
      : '—'

  return (
    <div className="card space-y-1">
      <h3 className="font-semibold text-sm mb-2">Mempool / On-Chain</h3>
      <StatRow
        label="Fastest fee"
        value={latest.mempool_fee_fastest != null ? `${latest.mempool_fee_fastest} sat/vB` : '—'}
      />
      <StatRow
        label="Half-hour fee"
        value={latest.mempool_fee_half_hour != null ? `${latest.mempool_fee_half_hour} sat/vB` : '—'}
      />
      <StatRow label="Fee level" value={feeDesc} />
      <StatRow label="Mempool size" value={mempoolMB} />
      <StatRow
        label="Pending txs"
        value={latest.mempool_tx_count != null ? latest.mempool_tx_count.toLocaleString() : '—'}
      />
      <StatRow
        label="Block height"
        value={latest.block_height != null ? latest.block_height.toLocaleString() : '—'}
      />
      <StatRow label="Snapshots taken" value={`${snapshots.length}`} />
    </div>
  )
}
