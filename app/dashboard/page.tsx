'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const [email, setEmail] = useState('')
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }
      setEmail(session.user.email ?? '')

      const { data } = await supabase
        .from('installer_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      setProfile(data)
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

  const pct = profile?.completion_pct ?? 0
  const isComplete = pct === 100

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
          <a href="/profile" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">Profile</a>
          <span className="text-xs text-gray-500">{email}</span>
          <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {!isComplete && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="4" y="7" width="8" height="7" rx="1" stroke="#92400e" strokeWidth="1.4"/>
                <path d="M5 7V5a3 3 0 016 0v2" stroke="#92400e" strokeWidth="1.4" fill="none"/>
              </svg>
              <div>
                <div className="text-sm font-medium text-amber-900">Profile {pct}% complete</div>
                <div className="text-xs text-amber-700 mt-0.5">Complete your profile to unlock job processing and the full platform</div>
              </div>
            </div>
            <a
              href="/profile"
              className="text-xs font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 px-4 py-2 rounded-lg transition-colors flex-shrink-0"
            >
              Complete profile →
            </a>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active jobs', value: '0', sub: 'Get started below' },
            { label: 'Completed', value: '0', sub: 'All time' },
            { label: 'BUS claimed', value: '£0', sub: 'Via your installs' },
            { label: 'Pending QC', value: '0', sub: 'Awaiting review' },
          ].map((m) => (
            <div key={m.label} className="bg-gray-100 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{m.label}</div>
              <div className="text-2xl font-semibold text-gray-900">{m.value}</div>
              <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="text-sm font-medium text-gray-900 mb-1">Start a new job</div>
            <div className="text-xs text-gray-500 mb-4">Register a customer and begin the MCS workflow</div>
            <a
              href={isComplete ? '/jobs/new' : '/profile'}
              className={`inline-flex text-xs font-medium px-4 py-2 rounded-lg transition-colors ${
                isComplete
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {isComplete ? 'New customer →' : 'Complete profile first'}
            </a>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="text-sm font-medium text-gray-900 mb-1">Complete your profile</div>
            <div className="text-xs text-gray-500 mb-3">Upload qualifications, insurance and sign the umbrella agreement</div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
              <div className="bg-emerald-600 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <a href="/profile" className="text-xs font-medium text-emerald-700 hover:underline">
              Go to profile →
            </a>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-sm font-medium text-gray-900 mb-4">Your jobs</div>
          <div className="text-center py-10 text-sm text-gray-400">
            {isComplete
              ? <a href="/jobs/new" className="text-emerald-700 hover:underline">Create your first job →</a>
              : 'Complete your profile to get started.'
            }
          </div>
        </div>
      </div>
    </div>
  )
}