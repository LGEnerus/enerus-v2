'use client'

import React from 'react'
import Sidebar from './Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      {/* Push content right of the 56px sidebar */}
      <div className="flex-1 ml-14 min-w-0">
        {children}
      </div>
    </div>
  )
}