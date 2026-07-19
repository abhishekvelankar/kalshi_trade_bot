import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { BarChart3, BookOpen, ChevronDown, History, LayoutDashboard, Radio, Settings } from 'lucide-react'
import clsx from 'clsx'
import { useTradeMode } from '../../context/TradeModeContext'
import { useSeriesContext, SERIES_LIST } from '../../context/SeriesContext'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/history', label: 'History', icon: BookOpen },
  { to: '/trades', label: 'Trades', icon: History },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/config', label: 'Config', icon: Settings },
]

export default function Navbar() {
  const { isPaper, setIsPaper } = useTradeMode()
  const { series, setSeries, seriesInfo } = useSeriesContext()
  const [showDropdown, setShowDropdown] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-netflix-bg/95 backdrop-blur border-b border-netflix-border flex items-center px-6 gap-8">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-8 h-8 bg-netflix-red rounded flex items-center justify-center">
          <span className="text-white font-black text-xs">{seriesInfo.label}</span>
        </div>
        <span className="font-bold text-lg tracking-tight">KalshiBot</span>
      </div>

      {/* Nav links */}
      <div className="flex items-center gap-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'text-netflix-text bg-netflix-surface'
                  : 'text-netflix-muted hover:text-netflix-text hover:bg-netflix-surface/50',
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </div>

      {/* Paper / Live mode toggle + Series selector */}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-netflix-dim hidden sm:block">Mode</span>
        <div className="flex items-center bg-netflix-card border border-netflix-border rounded-lg p-1 gap-1">
          <button
            onClick={() => setIsPaper(true)}
            className={clsx(
              'px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap',
              isPaper
                ? 'bg-amber-500 text-black'
                : 'text-netflix-muted hover:text-netflix-text',
            )}
          >
            Paper
          </button>
          <button
            onClick={() => setIsPaper(false)}
            className={clsx(
              'px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap',
              !isPaper
                ? 'bg-emerald-500 text-black'
                : 'text-netflix-muted hover:text-netflix-text',
            )}
          >
            Live
          </button>
        </div>

        {/* Series dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-netflix-card border border-netflix-border rounded-lg text-sm font-semibold hover:border-netflix-red transition-colors"
          >
            <span>{seriesInfo.label}</span>
            <ChevronDown size={14} className={clsx('transition-transform', showDropdown && 'rotate-180')} />
          </button>
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <div className="absolute right-0 top-full mt-1 bg-netflix-card border border-netflix-border rounded-lg overflow-hidden shadow-lg z-50 min-w-[110px]">
                {SERIES_LIST.map(s => (
                  <button
                    key={s.ticker}
                    onClick={() => { setSeries(s.ticker); setShowDropdown(false) }}
                    className={clsx(
                      'w-full text-left px-4 py-2 text-sm transition-colors',
                      s.ticker === series
                        ? 'bg-netflix-red text-white font-semibold'
                        : 'text-netflix-muted hover:text-netflix-text hover:bg-netflix-surface',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
