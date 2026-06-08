import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-netflix-bg">
      <Navbar />
      <main className="pt-16 px-6 py-8 max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
