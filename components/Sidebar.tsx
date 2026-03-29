'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', badge: false, icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z"/></svg>
  )},
  { href: '/works', label: 'Work', badge: false, icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 10-2 0v3a1 1 0 102 0v-3zm2-3a1 1 0 011 1v5a1 1 0 11-2 0v-5a1 1 0 011-1zm4-1a1 1 0 10-2 0v7a1 1 0 102 0V8z" clipRule="evenodd"/></svg>
  )},
  { href: '/customers', label: 'Customers', badge: false, icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
  )},
  { href: '/calendar', label: 'Calendar', badge: false, icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
  )},
  { href: '/costs', label: 'Costs', badge: false, icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.077 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.077-2.354-1.253V5z" clipRule="evenodd"/></svg>
  )},
  { href: '/calculators', label: 'Calculators', badge: false, icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 2a1 1 0 000 2h6a1 1 0 100-2H7zm6 7a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1zm-3 3a1 1 0 100 2h.01a1 1 0 100-2H10zm-4 1a1 1 0 011-1h.01a1 1 0 110 2H7a1 1 0 01-1-1zm1-4a1 1 0 100 2h.01a1 1 0 100-2H7zm2 1a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm4-4a1 1 0 100 2h.01a1 1 0 100-2H13zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zM7 8a1 1 0 000 2h.01a1 1 0 000-2H7z" clipRule="evenodd"/></svg>
  )},
  { href: '/compliance', label: 'Compliance', badge: true, icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
  )},
]

const BOTTOM_NAV = [
  { href: '/time', label: 'Time tracking', icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
  )},
  { href: '/vat', label: 'VAT returns', icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
  )},
  { href: '/settings', label: 'Settings', icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
  )},
]

export default function Sidebar() {
  const pathname = usePathname()
  const [initials, setInitials] = useState('?')
  const [userName, setUserName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [urgentCompliance, setUrgentCompliance] = useState(0)
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: u } = await (supabase as any)
        .from('users')
        .select('full_name, role, email, accounts(business_name, status, trial_ends_at)')
        .eq('id', session.user.id)
        .single()

      if (!u) return

      if (u.full_name) {
        setUserName(u.full_name)
        const parts = u.full_name.trim().split(' ')
        setInitials(parts.map((p: string) => p[0]).join('').toUpperCase().slice(0, 2))
      } else if (u.email) {
        setInitials(u.email[0].toUpperCase())
      }

      if (u.accounts?.business_name) setBusinessName(u.accounts.business_name)
      if (u.role === 'admin') setIsAdmin(true)

      // Trial countdown
      if (u.accounts?.status === 'trial' && u.accounts?.trial_ends_at) {
        const days = Math.ceil((new Date(u.accounts.trial_ends_at).getTime() - Date.now()) / 86400000)
        setTrialDaysLeft(days)
      }

      // Compliance expiry badge
      const soon = new Date()
      soon.setDate(soon.getDate() + 30)
      const { data: comp } = await (supabase as any)
        .from('compliance_records')
        .select('id')
        .eq('is_active', true)
        .lte('expiry_date', soon.toISOString().split('T')[0])
      setUrgentCompliance((comp || []).length)
    }
    load()
  }, [])

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  function cls(active: boolean) {
    return `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all relative group ${
      active ? 'bg-amber-500/10 text-amber-300' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
    }`
  }

  return (
    <div className="flex flex-col w-52 bg-gray-900 border-r border-gray-800 h-screen fixed left-0 top-0 z-30">

      {/* Business name header */}
      <div className="px-4 h-14 border-b border-gray-800 flex items-center flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">
            {businessName || 'trade stack'}
          </div>
          {trialDaysLeft !== null && trialDaysLeft <= 14 && (
            <a href="/pricing" className={`text-xs mt-0.5 block ${trialDaysLeft <= 3 ? 'text-red-400' : 'text-amber-500'} hover:underline`}>
              {trialDaysLeft <= 0 ? 'Trial expired — upgrade' : `${trialDaysLeft}d trial left`}
            </a>
          )}
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col px-2 py-2 gap-0.5 flex-1 overflow-y-auto">
        {NAV.map(item => {
          const active = isActive(item.href)
          return (
            <a key={item.href} href={item.href} className={cls(active)}>
              {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber-500 rounded-r-full"/>}
              <span className={`flex-shrink-0 relative ${active ? 'text-amber-400' : 'text-gray-500 group-hover:text-gray-300'}`}>
                {item.icon}
                {item.badge && urgentCompliance > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold leading-none px-0.5">
                    {urgentCompliance > 9 ? '9+' : urgentCompliance}
                  </span>
                )}
              </span>
              <span className={`text-sm font-medium truncate ${active ? 'text-amber-300' : 'text-gray-400 group-hover:text-gray-100'}`}>
                {item.label}
              </span>
            </a>
          )
        })}
      </nav>

      {/* Bottom nav */}
      <div className="px-2 pt-2 pb-3 border-t border-gray-800 flex flex-col gap-0.5">

        {/* Admin — only for admin users */}
        {isAdmin && (
          <a href="/admin" className={cls(pathname.startsWith('/admin'))}>
            {pathname.startsWith('/admin') && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-red-500 rounded-r-full"/>}
            <span className="flex-shrink-0 text-red-400">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd"/>
              </svg>
            </span>
            <span className="text-sm font-medium text-red-400 truncate">Admin</span>
          </a>
        )}

        {BOTTOM_NAV.map(item => {
          const active = isActive(item.href)
          return (
            <a key={item.href} href={item.href} className={cls(active)}>
              {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber-500 rounded-r-full"/>}
              <span className={`flex-shrink-0 ${active ? 'text-amber-400' : 'text-gray-500 group-hover:text-gray-300'}`}>{item.icon}</span>
              <span className={`text-sm font-medium truncate ${active ? 'text-amber-300' : 'text-gray-400 group-hover:text-gray-100'}`}>{item.label}</span>
            </a>
          )
        })}

        {/* User profile */}
        <a href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-800 transition-colors mt-1 group">
          <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-gray-300 group-hover:text-white truncate transition-colors">{userName || 'Account'}</div>
            <div className="text-xs text-gray-600">Settings</div>
          </div>
        </a>

        {/* Logo mark */}
        <div className="px-3 pt-3 mt-1 border-t border-gray-800/60">
          <svg viewBox="0 0 175 42" width="150" height="36" xmlns="http://www.w3.org/2000/svg">
            <text x="0" y="26" fontFamily="system-ui,-apple-system,sans-serif" fontSize="26" fontWeight="800" fill="#6b7280" letterSpacing="-0.5">trade stack</text>
            <text x="173" y="38" textAnchor="end" fontFamily="system-ui,-apple-system,sans-serif" fontSize="10" fontWeight="400" fill="#374151" letterSpacing="0.3">by enerus</text>
          </svg>
        </div>
      </div>
    </div>
  )
}