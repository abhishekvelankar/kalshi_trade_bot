export interface DashboardResponse {
  server_time: string
  active_cycle: ActiveCycle | null
  recent_cycles: RecentCycleItem[]
  wins: number
  losses: number
  total_pnl: number
  win_rate: number
  config: BotConfig
}

export interface ActiveCycle {
  id: number
  cycle_start: string
  market_ticker: string
  market_title: string | null
  status: 'running' | 'completed' | 'error'
  prediction_action: 'YES' | 'NO' | 'SKIP' | null
  prediction_confidence: number | null
  skip_reason: string | null
}

export interface RecentCycleItem {
  id: number
  cycle_start: string
  market_ticker: string
  market_title: string | null
  status: 'running' | 'completed' | 'error'
  // Prediction
  prediction_action: 'YES' | 'NO' | 'SKIP' | null
  prediction_confidence: number | null
  kalshi_yes_prob: number | null
  btc_score: number | null
  skip_reason: string | null
  // Trade (null if SKIP)
  trade_side: 'yes' | 'no' | null
  trade_cost: number | null
  trade_outcome: 'win' | 'loss' | 'pending' | null
  trade_pnl: number | null
  is_paper: boolean | null
}

export interface BotConfig {
  paper_trade: boolean
  trade_amount: number
  yes_threshold: number
  no_threshold: number
  kalshi_weight: number
  btc_weight: number
  min_confidence: number
}

export interface Trade {
  id: number
  cycle_id: number
  placed_at: string
  ticker: string
  side: 'yes' | 'no'
  is_paper: boolean
  contracts: number
  price_per_contract: number
  total_cost: number
  outcome: 'win' | 'loss' | 'pending'
  resolved_at?: string
  payout?: number
  pnl?: number
}

export interface Cycle {
  id: number
  cycle_start: string
  cycle_end: string | null
  market_ticker: string
  market_title: string | null
  target_price: number | null
  status: 'running' | 'completed' | 'error'
}

export interface CycleDetail extends Cycle {
  btc_snapshots: BTCSnapshot[]
  market_snapshot: MarketSnapshot | null
  prediction: Prediction | null
  trade: Trade | null
}

export interface BTCSnapshot {
  captured_at: string
  price_usd: number
  price_change_5m: number | null
  price_change_10m: number | null
  momentum_score: number | null
  mempool_fee_fastest: number | null
}

export interface MarketSnapshot {
  captured_at: string
  ticker: string
  yes_price: number
  no_price: number
  close_time: string | null
}

export interface Prediction {
  predicted_at: string
  action: 'YES' | 'NO' | 'SKIP'
  confidence: number
  btc_score: number
  kalshi_yes_prob: number
  combined_score: number
}

export interface LiveBTCSnapshot {
  minute: number
  captured_at: string
  price_usd: number
  price_change_1m: number | null
  price_change_5m: number | null
  price_change_10m: number | null
  momentum_score: number | null
  mempool_fee_fastest: number | null
  mempool_fee_half_hour: number | null
  mempool_tx_count: number | null
  mempool_size_bytes: number | null
  block_height: number | null
}

export interface LiveMarketState {
  captured_at: string
  yes_price: number
  no_price: number
  yes_prob: number
  no_prob: number
  close_time: string | null
}

export interface LivePrediction {
  action: 'YES' | 'NO' | 'SKIP'
  confidence: number
  btc_score: number
  kalshi_yes_prob: number
  combined_score: number
  skip_reason: string | null
  reasoning_detail: Record<string, unknown> | null
}

export interface LiveTrade {
  side: 'yes' | 'no'
  contracts: number
  price_per_contract: number
  total_cost: number
  is_paper: boolean
  outcome: 'win' | 'loss' | 'pending'
  pnl: number | null
}

export interface CycleConfig {
  data_window_minutes: number
  trade_start_minutes: number
  trade_end_minutes: number
  cycle_minutes: number
  yes_threshold: number
  no_threshold: number
}

export interface LiveAnalysisResponse {
  has_active_cycle: boolean
  is_live: boolean
  cycle_id: number | null
  cycle_start: string | null
  market_ticker: string | null
  market_title: string | null
  target_price: number | null
  status: string | null
  elapsed_seconds: number | null
  phase: 'collecting' | 'predicting' | 'trading' | 'resolving' | 'completed' | 'error' | null
  btc_snapshots: LiveBTCSnapshot[]
  market_state: LiveMarketState | null
  prediction: LivePrediction | null
  trade: LiveTrade | null
  cycle_config: CycleConfig
}

export interface PerformanceSummary {
  total_trades: number
  wins: number
  losses: number
  pending: number
  win_rate: number
  total_invested: number
  total_payout: number
  total_pnl: number
  paper_trades: number
  live_trades: number
  starting_balance: number
}
