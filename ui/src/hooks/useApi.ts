import { useQuery } from '@tanstack/react-query'
import type { DashboardResponse, Trade, Cycle, PerformanceSummary, LiveAnalysisResponse } from '../types'

const BASE = '/api'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export function useDashboard() {
  return useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch('/dashboard/'),
    refetchInterval: 5000,
  })
}

export function useTrades(params?: { limit?: number; offset?: number; outcome?: string }) {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  if (params?.outcome) qs.set('outcome', params.outcome)
  return useQuery<Trade[]>({
    queryKey: ['trades', params],
    queryFn: () => apiFetch(`/trades/?${qs}`),
    refetchInterval: 10000,
  })
}

export function usePerformance() {
  return useQuery<PerformanceSummary>({
    queryKey: ['performance'],
    queryFn: () => apiFetch('/trades/performance'),
    refetchInterval: 15000,
  })
}

export function useLiveAnalysis() {
  return useQuery<LiveAnalysisResponse>({
    queryKey: ['live'],
    queryFn: () => apiFetch('/live/'),
    refetchInterval: 5000,
  })
}

export function useCycles(params?: { limit?: number; offset?: number }) {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  return useQuery<Cycle[]>({
    queryKey: ['cycles', params],
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
