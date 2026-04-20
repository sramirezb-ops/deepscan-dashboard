import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DeepScan Dashboard',
  description: 'Dashboard de marketing digital · DeepScan',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body
        className="antialiased"
        style={{
          background: 'var(--bg)',
          color: 'var(--text-1)',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  )
}
