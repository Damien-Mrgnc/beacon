'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/',       label: 'Overview', icon: '◈' },
  { href: '/alerts', label: 'Alerts',   icon: '△' },
]

export function Sidebar() {
  const path = usePathname()

  return (
    <aside className="fixed top-0 left-0 h-screen w-[200px] bg-bg border-r border-border flex flex-col z-10">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <span className="text-xs font-mono font-bold tracking-[0.2em] text-primary">BEACON</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? 'bg-surface text-primary border border-border'
                  : 'text-muted hover:text-primary hover:bg-surface'
              }`}
            >
              <span className="text-[11px] opacity-60">{icon}</span>
              <span className="font-mono">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <p className="text-[10px] text-muted font-mono">v0.1.0</p>
      </div>
    </aside>
  )
}
