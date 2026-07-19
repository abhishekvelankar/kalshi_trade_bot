import { useQuery } from '@tanstack/react-query'
import type { DashboardResponse, Trade, Cycle, PerformanceSummary, LiveAnalysisResponse } from '../types'
import { useTradeMode } from '../context/TradeModeContext'
import { useSeriesContext } from '../context/SeriesContext'

const BASE = '/api'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export function useDashboard() {
  const { isPaper } = useTradeMode()
  const { series } = useSeriesContext()
  return useQuery<DashboardResponse>({
    queryKey: ['dashboard', isPaper, series],
    queryFn: () => apiFetch(`/dashboard/?is_paper=${isPaper}&series_ticker=${series}`),
    refetchInterval: 5000,
  })
}

export function useTrades(params?: { limit?: number; offset?: number; outcome?: string }) {
  const { isPaper } = useTradeMode()
  const { series } = useSeriesContext()
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  if (params?.outcome) qs.set('outcome', params.outcome)
  qs.set('is_paper', String(isPaper))
  qs.set('series_ticker', series)
  return useQuery<Trade[]>({
    queryKey: ['trades', params, isPaper, series],
    queryFn: () => apiFetch(`/trades/?${qs}`),
    refetchInterval: 10000,
  })
}

export function usePerformance() {
  const { isPaper } = useTradeMode()
  const { series } = useSeriesContext()
  return useQuery<PerformanceSummary>({
    queryKey: ['performance', isPaper, series],
    queryFn: () => apiFetch(`/trades/performance?is_paper=${isPaper}&series_ticker=${series}`),
    refetchInterval: 15000,
  })
}

export function useLiveAnalysis() {
  const { series } = useSeriesContext()
  return useQuery<LiveAnalysisResponse>({
    queryKey: ['live', series],
    queryFn: () => apiFetch(`/live/?series_ticker=${series}`),
    refetchInterval: 5000,
  })
}

export function useCycles(params?: { limit?: number; offset?: number }) {
  const { series } = useSeriesContext()
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  qs.set('series_ticker', series)
  return useQuery<Cycle[]>({
    queryKey: ['cycles', params, series],
    queryFn: () => apiFetch(`/cycles/?${qs}`),
    refetchInterval: 15000,
  })
}

export function useCycleDetail(cycleId: number | null) {
  return useQuery<LiveAnalysisResponse>({
    queryKey: ['cycle-detail', cycleId],
    queryFn: () => apiFetch(`/live/${cycleId}`),
    enabled: cycleId != null,
  })
}
