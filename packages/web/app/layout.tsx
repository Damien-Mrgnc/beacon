import type { ReactNode } from 'react'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/layout/Navbar'
import { api } from '@/lib/api'

const inter = Inter({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata = {
  title: 'Beacon — Customer Health',
  description: 'Real-time customer health analytics',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tenants = await api.tenant.list()
  const criticalCount = tenants.filter((t) => t.tier === 'critical').length

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans bg-bg text-primary">
        <Navbar criticalCount={criticalCount} />
        <main className="pt-11 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
