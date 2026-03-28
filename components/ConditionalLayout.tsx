'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

// Pages that should NOT have the sidebar
const PUBLIC_PATHS = ['/login', '/register', '/onboarding', '/accept', '/portal']

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  if (isPublic) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar/>
      <div className="flex-1 ml-52 min-w-0 overflow-x-hidden">
        {children}
      </div>
    </div>
  )
}