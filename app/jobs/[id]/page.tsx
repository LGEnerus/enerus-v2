'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STAGE_ORDER = [
  'customer','survey','design','proposal','acceptance',
  'bus_application','materials','installation','commissioning','handover'
]
const STAGE_LABEL: Record<string,string> = {
  customer:'Customer', survey:'Survey', design:'Design', proposal:'Proposal',
  acceptance:'Acceptance', bus_application:'BUS', materials:'Materials',
  installation:'Installation', commissioning:'Commissioning', handover:'Handover',
}
const BUS_COLORS: Record<string,string> = {
  not_started:'bg-gray-100 text-gray-400', eligible:'bg-blue-100 text-blue-700',
  submitted:'bg-amber-100 text-amber-700', approved:'bg-emerald-100 text-emerald-700',
  redeemed:'bg-emerald-700 text-white', rejected:'bg-red-100 text-red-700',
}

export default function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isWelcome = searchParams.get('welcome') === '1'
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const [{ data: u }, { data: ip }, { data: jd }] = await Promise.all([
      (supabase as any).from('users').select('*').eq('id', session.user.id).single(),
      (supabase as any).from('installer_profiles').select('*').eq('user_id', session.user.id).single(),
      (supabase as any).from('jobs').select('id,reference,bus_status,bus_eligible,created_at,updated_at,customers(first_name,last_name,address_line1,postcode),job_stages(stage,status)').eq('installer_id', session.user.id).order('updated_at', { ascending: false })
    ])
    setUser(u); setProfile(ip); setJobs(jd || [])
    setLoading(false)
  }

  function getCurrentStage(job: any) {
    const s: any[] = job.job_stages || []
    return s.find(x => x.status === 'in_progress') || [...s].reverse().find(x => x.status === 'complete') || { stage: 'customer', status: 'locked' }
  }

  const profileFields = [profile?.company_name, profile?.address_line1, profile?.postcode, profile?.phone, profile?.email, profile?.mcs_certificate_number, profile?.public_liability_insurer, profile?.logo_url]
  const profilePct = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100)
  const mcsExpiry = profile?.mcs_expiry_date
  const mcsDaysLeft = mcsExpiry ? Math.floor((new Date(mcsExpiry).getTime() - Date.now()) / 86400000) : null
  const activeJobs = jobs.filter(j => getCurrentStage(j).status === 'in_progress').length
  const completedJobs = jobs.filter(j => getCurrentStage(j).stage === 'handover' && getCurrentStage(j).status === 'complete').length
  const busApproved = jobs.filter(j => j.bus_status === 'approved' || j.bus_status === 'redeemed').length

  const filtered = jobs.filter(j => {
    const c = j.customers
    const name = `${c?.first_name} ${c?.last_name} ${c?.address_line1} ${c?.postcode}`.toLowerCase()
    const { stage } = getCurrentStage(j)
    return (!search || name.includes(search.toLowerCase())) && (!stageFilter || stage === stageFilter)
  })

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">Dashboard</span>
          {mcsDaysLeft !== null && mcsDaysLeft <= 60 && (
            <a href="/profile" className={`text-xs px-2.5 py-1 rounded-full font-medium ${mcsDaysLeft <= 14 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
              ⚠ MCS expires in {mcsDaysLeft}d
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 hidden sm:block">{user?.full_name}</span>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            className="text-xs text-gray-400 hover:text-gray-600">Sign out</button>
          <a href="/jobs/new" className={`text-xs font-medium px-4 py-1.5 rounded-lg transition-colors ${profilePct === 100 ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'bg-gray-100 text-gray-400 pointer-events-none'}`}>
            + New job
          </a>
        </div>
      </div>

      <div className="px-6 py-6">

        {/* Banners */}
        {isWelcome && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 mb-5 flex items-center gap-3">
            <span className="text-xl">🎉</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-emerald-900">Welcome to Enerus Plus</div>
              <div className="text-xs text-emerald-700 mt-0.5">Complete your profile to unlock all features.</div>
            </div>
            <a href="/profile" className="text-xs text-emerald-700 border border-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-100">Complete profile →</a>
          </div>
        )}
        {profilePct < 100 && !isWelcome && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-5 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-amber-900">Profile {profilePct}% complete</span>
                <div className="flex-1 max-w-28 bg-amber-200 rounded-full h-1.5"><div className="bg-amber-600 h-1.5 rounded-full" style={{ width: `${profilePct}%` }}/></div>
              </div>
              <div className="text-xs text-amber-700 mt-0.5">Add MCS number, insurance and branding to unlock full platform access.</div>
            </div>
            <a href="/profile" className="text-xs text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg font-medium">Complete →</a>
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active jobs',   value: String(activeJobs),                   sub: 'In progress' },
            { label: 'Completed',     value: String(completedJobs),                sub: 'All time' },
            { label: 'BUS grants',    value: `£${(busApproved * 7500).toLocaleString()}`, sub: `${busApproved} approved` },
            { label: 'Total jobs',    value: String(jobs.length),                  sub: 'All time' },
          ].map(m => (
            <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{m.label}</div>
              <div className="text-2xl font-semibold text-gray-900">{m.value}</div>
              <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Jobs table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-900">Jobs</span>
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-400 w-48"/>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none">
              <option value="">All stages</option>
              {STAGE_ORDER.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            <div className="ml-auto">
              <a href="/jobs/new" className="text-xs text-emerald-700 hover:underline">+ New job</a>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-3xl mb-3">📋</div>
              <div className="text-sm font-medium text-gray-500 mb-1">No jobs yet</div>
              <div className="text-xs text-gray-400 mb-4">{profilePct === 100 ? 'Create your first job to get started.' : 'Complete your profile first.'}</div>
              {profilePct === 100 && <a href="/jobs/new" className="text-xs bg-emerald-700 text-white px-4 py-2 rounded-lg hover:bg-emerald-800">New job →</a>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Customer', 'Address', 'Reference', 'Current stage', 'BUS', 'Updated'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-2.5 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.slice(0, 25).map(job => {
                    const c = job.customers
                    const { stage, status } = getCurrentStage(job)
                    const daysAgo = Math.floor((Date.now() - new Date(job.updated_at).getTime()) / 86400000)
                    const updLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`
                    const stagePill = status === 'in_progress' ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : status === 'complete' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-gray-50 text-gray-400 border border-gray-200'
                    return (
                      <tr key={job.id} onClick={() => router.push(`/jobs/${job.id}`)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{c?.first_name} {c?.last_name}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-500">{c?.address_line1}</div>
                          <div className="text-xs text-gray-400">{c?.postcode}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-gray-400">{job.reference || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap ${stagePill}`}>
                            {STAGE_LABEL[stage] || stage}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {job.bus_eligible ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BUS_COLORS[job.bus_status] || BUS_COLORS.not_started}`}>
                              {(job.bus_status || 'eligible').replace('_', ' ')}
                            </span>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-400">{updLabel}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length > 25 && (
                <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100 text-center">
                  Showing 25 of {filtered.length} · <a href="/jobs" className="text-emerald-700 hover:underline">View all</a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}