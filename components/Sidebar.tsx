'use client'

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard', icon: 'grid',    label: 'Dashboard' },
  { href: '/jobs',      icon: 'jobs',    label: 'Jobs' },
  { href: '/profile',   icon: 'profile', label: 'Profile' },
]

const ADMIN_NAV = [
  { href: '/admin',              icon: 'admin',      label: 'Admin' },
  { href: '/admin/jobs',         icon: 'admin-jobs', label: 'All jobs' },
  { href: '/admin/installers',   icon: 'installers', label: 'Installers' },
  { href: '/admin/bus',          icon: 'bus',        label: 'BUS tracker' },
  { href: '/admin/qc',           icon: 'qc',         label: 'QC queue' },
]

function Icon({ id }: { id: string }) {
  const cls = "w-5 h-5"
  switch (id) {
    case 'grid': return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
    case 'jobs': return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 10-2 0v3a1 1 0 102 0v-3zm2-3a1 1 0 011 1v5a1 1 0 11-2 0v-5a1 1 0 011-1zm4-1a1 1 0 10-2 0v7a1 1 0 102 0V8z" clipRule="evenodd"/></svg>
    case 'profile': return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/></svg>
    case 'admin': return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
    default: return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
  }
}

export default function Sidebar() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const [initials, setInitials] = useState('?')
  const [mcsExpiry, setMcsExpiry] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: u } = await (supabase as any).from('users').select('role, full_name').eq('id', session.user.id).single()
      if (u?.role === 'admin') setIsAdmin(true)
      if (u?.full_name) {
        const parts = u.full_name.trim().split(' ')
        setInitials(parts.map((p: string) => p[0]).join('').toUpperCase().slice(0, 2))
      }
      const { data: ip } = await (supabase as any).from('installer_profiles').select('mcs_expiry_date, company_name').eq('user_id', session.user.id).single()
      if (ip?.mcs_expiry_date) setMcsExpiry(ip.mcs_expiry_date)
    }
    load()
  }, [])

  // Days until MCS expiry
  const mcsWarning = mcsExpiry ? Math.floor((new Date(mcsExpiry).getTime() - Date.now()) / 86400000) : null

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <div className="flex flex-col w-14 bg-gray-900 h-screen fixed left-0 top-0 z-30 border-r border-gray-800">
      {/* Logo */}
      <div className="flex items-center justify-center h-14 border-b border-gray-800 flex-shrink-0">
        <a href="/dashboard" className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
            <path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/>
          </svg>
        </a>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col items-center py-3 gap-1 flex-shrink-0">
        {NAV.map(item => (
          <a key={item.href} href={item.href} title={item.label}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors group relative ${
              isActive(item.href)
                ? 'bg-emerald-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}>
            <Icon id={item.icon}/>
            {/* Tooltip */}
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-gray-700 z-50">
              {item.label}
            </div>
          </a>
        ))}
      </nav>

      {/* Admin nav (separator) */}
      {isAdmin && (
        <>
          <div className="mx-3 border-t border-gray-800 my-1"/>
          <nav className="flex flex-col items-center py-1 gap-1 flex-shrink-0">
            {ADMIN_NAV.slice(0, 1).map(item => (
              <a key={item.href} href={item.href} title={item.label}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors group relative ${
                  isActive(item.href) ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}>
                <Icon id={item.icon}/>
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-gray-700 z-50">
                  {item.label}
                </div>
              </a>
            ))}
          </nav>
        </>
      )}

      <div className="flex-1"/>

      {/* MCS expiry warning */}
      {mcsWarning !== null && mcsWarning <= 60 && (
        <div className="mx-2 mb-2">
          <a href="/profile" title={`MCS expires in ${mcsWarning} days`}
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${
              mcsWarning <= 14 ? 'bg-red-900 text-red-300' : 'bg-amber-900 text-amber-300'
            }`}>
            {mcsWarning}d
          </a>
        </div>
      )}

      {/* User avatar */}
      <div className="flex items-center justify-center h-14 border-t border-gray-800 flex-shrink-0">
        <a href="/profile" title="Profile"
          className="w-8 h-8 rounded-full bg-emerald-800 flex items-center justify-center text-emerald-200 text-xs font-bold hover:bg-emerald-700 transition-colors">
          {initials}
        </a>
      </div>
    </div>
  )
}