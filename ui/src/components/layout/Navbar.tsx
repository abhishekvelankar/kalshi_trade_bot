import { NavLink } from 'react-router-dom'
import { BarChart3, BookOpen, History, LayoutDashboard, Radio, Settings } from 'lucide-react'
import clsx from 'clsx'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/history', label: 'History', icon: BookOpen },
  { to: '/trades', label: 'Trades', icon: History },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/config', label: 'Config', icon: Settings },
]

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-netflix-bg/95 backdrop-blur border-b border-netflix-border flex items-center px-6 gap-8">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-8 h-8 bg-netflix-red rounded flex items-center justify-center">
          <span className="text-white font-black text-sm">BTC</span>
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
    </nav>
  )
}
