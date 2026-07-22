import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/context/auth'

export const metadata: Metadata = {
  title: 'Legal Intelligence Platform',
  description: 'NSW Law · Semantic Search · RAG',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
