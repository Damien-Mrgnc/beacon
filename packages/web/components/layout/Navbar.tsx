'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavbarProps {
  criticalCount: number
}

export function Navbar({ criticalCount }: NavbarProps) {
  const path = usePathname()

  const navLink = (href: string, label: string) => {
    const active = href === '/' ? path === '/' : path.startsWith(href)
    return (
      <Link
        href={href}
        className={`relative px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
          active
            ? 'bg-surface border border-border text-primary'
            : 'text-muted hover:text-primary hover:bg-surface'
        }`}
      >
        {label}
        {href === '/alerts' && criticalCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-critical rounded-full text-[9px] flex items-center justify-center text-white font-bold tabular-nums">
            {criticalCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <header className="fixed top-0 left-0 right-0 h-11 bg-bg border-b border-border flex items-center px-6 z-50 gap-6">
      {/* Logo */}
      <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-primary shrink-0">
        BEACON
      </span>

      {/* Separator */}
      <div className="w-px h-4 bg-border" />

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {navLink('/', 'Overview')}
        {navLink('/alerts', 'Alerts')}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-4">
        {criticalCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-critical animate-pulse" />
            <span className="text-[11px] font-mono text-critical">{criticalCount} critical</span>
          </div>
        )}
        <span className="text-[10px] text-muted font-mono">v0.1.0</span>
      </div>
    </header>
  )
}
