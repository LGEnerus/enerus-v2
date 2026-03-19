'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const STAGE_LABELS: Record<string, string> = {
  customer: 'Customer',
  survey: 'Survey',
  design: 'Design',
  proposal: 'Proposal',
  acceptance: 'Acceptance',
  bus_application: 'BUS Application',
  materials: 'Materials',
  installation: 'Installation',
  commissioning: 'Commissioning',
  handover: 'Handover',
}

export default function DashboardPage() {
  const [email, setEmail] = useState('')
  const [profile, setProfile] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }
      setEmail(session.user.email ?? '')

      const { data: profileData } = await (supabase as any)
        .from('installer_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      setProfile(profileData)

      if (profileData) {
        const { data: jobsData } = await (supabase as any)
          .from('jobs')
          .select(`id, reference, current_stage, bus_status, created_at, customers (first_name, last_name, city, postcode)`)
          .eq('installer_id', profileData.id)
          .order('created_at', { ascending: false })
          .limit(5)
        setJobs(jobsData || [])
      }
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
  const activeJobs = jobs.filter(j => j.current_stage !== 'handover').length
  const busJobs = jobs.filter(j => ['eligible','submitted','approved','redeemed'].includes(j.bus_status)).length

  function getStagePill(stage: string) {
    const colors: Record<string, string> = {
      customer: 'bg-gray-100 text-gray-600',
      survey: 'bg-blue-50 text-blue-700',
      design: 'bg-blue-50 text-blue-700',
      proposal: 'bg-purple-50 text-purple-700',
      acceptance: 'bg-purple-50 text-purple-700',
      bus_application: 'bg-amber-50 text-amber-700',
      materials: 'bg-amber-50 text-amber-700',
      installation: 'bg-orange-50 text-orange-700',
      commissioning: 'bg-emerald-50 text-emerald-700',
      handover: 'bg-emerald-100 text-emerald-800',
    }
    return colors[stage] || 'bg-gray-100 text-gray-600'
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
          <a href="/jobs" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">Jobs</a>
          <a href="/profile" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">Profile</a>
          <span className="text-xs text-gray-400">{email}</span>
          <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Sign out</button>
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
                <div className="text-xs text-amber-700 mt-0.5">Complete your profile to unlock all features</div>
              </div>
            </div>
            <a href="/profile" className="text-xs font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 px-4 py-2 rounded-lg transition-colors flex-shrink-0">Complete profile →</a>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active jobs', value: activeJobs },
            { label: 'Total jobs', value: jobs.length },
            { label: 'BUS claimed', value: busJobs },
            { label: 'Profile', value: `${pct}%` },
          ].map((m) => (
            <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
              <div className="text-2xl font-semibold text-gray-900">{m.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-sm font-medium text-gray-900 mb-1">New customer</div>
            <div className="text-xs text-gray-500 mb-4">Register a customer and begin the MCS workflow</div>
            <a href={isComplete ? '/jobs/new' : '/profile'} className={`inline-flex text-xs font-medium px-4 py-2 rounded-lg transition-colors ${isComplete ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'bg-gray-100 text-gray-400'}`}>
              {isComplete ? 'New customer →' : 'Complete profile first'}
            </a>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-sm font-medium text-gray-900 mb-1">View all jobs</div>
            <div className="text-xs text-gray-500 mb-4">See all your jobs, stages and document status</div>
            <a href="/jobs" className="inline-flex text-xs font-medium text-emerald-700 hover:underline">Go to jobs →</a>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm font-medium text-gray-900">Recent jobs</div>
            <a href="/jobs" className="text-xs text-emerald-700 hover:underline">View all →</a>
          </div>
          {jobs.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              {isComplete ? <a href="/jobs/new" className="text-emerald-700 hover:underline">Create your first job →</a> : 'Complete your profile to get started.'}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-6 py-3">Ref</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Customer</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Location</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Stage</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job: any) => (
                  <tr key={job.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3"><span className="text-xs font-mono text-gray-400">{job.reference || '—'}</span></td>
                    <td className="px-4 py-3"><div className="text-sm font-medium text-gray-900">{job.customers?.first_name} {job.customers?.last_name}</div></td>
                    <td className="px-4 py-3"><div className="text-xs text-gray-500">{job.customers?.city}, {job.customers?.postcode}</div></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStagePill(job.current_stage)}`}>
                        {STAGE_LABELS[job.current_stage] || job.current_stage}
                      </span>
                    </td>
                    <td className="px-4 py-3"><a href={`/jobs/${job.id}`} className="text-xs text-emerald-700 hover:underline font-medium">Open →</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}