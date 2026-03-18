'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.replace('/login')
        return
      }
      setEmail(session.user.email ?? '')
      setLoading(false)
    }
    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
              <path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Enerus Plus</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">MCS Umbrella</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{email}</span>
          <button
            onClick={signOut}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active jobs', value: '0' },
            { label: 'Completed', value: '0' },
            { label: 'BUS claimed', value: '£0' },
            { label: 'Pending QC', value: '0' },
          ].map((m) => (
            <div key={m.label} className="bg-gray-100 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{m.label}</div>
              <div className="text-2xl font-semibold text-gray-900">{m.value}</div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-sm font-medium text-gray-900 mb-4">Your jobs</div>
          <div className="text-center py-10 text-sm text-gray-400">
            No jobs yet — complete your profile to get started.
          </div>
        </div>
      </div>
    </div>
  )
}