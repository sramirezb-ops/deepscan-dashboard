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
      <body className="antialiased bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  )
}
