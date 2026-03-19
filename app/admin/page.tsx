'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    installers: 0,
    activeInstallers: 0,
    totalJobs: 0,
    busEligible: 0,
    busApproved: 0,
    busValue: 0,
    qcPending: 0,
  })
  const [recentJobs, setRecentJobs] = useState<any[]>([])
  const [busQueue, setBusQueue] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }

      // Check admin role
      const { data: userData } = await (supabase as any)
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (userData?.role !== 'admin') {
        window.location.replace('/dashboard')
        return
      }

      // Fetch all installers
      const { data: profiles } = await (supabase as any)
        .from('installer_profiles')
        .select('id, status, completion_pct, company_name')

      // Fetch all jobs
      const { data: jobs } = await (supabase as any)
        .from('jobs')
        .select('id, bus_status, bus_amount, current_stage, created_at, installer_id, customers(first_name, last_name, city), installer_profiles(company_name)')
        .order('created_at', { ascending: false })

      // Fetch BUS audit log entries
      const { data: busLogs } = await (supabase as any)
        .from('audit_log')
        .select('*, jobs(id, customers(first_name, last_name), installer_profiles(company_name))')
        .eq('action', 'bus_application_requested')
        .order('created_at', { ascending: false })
        .limit(10)

      const allJobs = jobs || []
      const allProfiles = profiles || []

      setStats({
        installers: allProfiles.length,
        activeInstallers: allProfiles.filter((p: any) => p.status === 'active').length,
        totalJobs: allJobs.length,
        busEligible: allJobs.filter((j: any) => j.bus_status === 'eligible').length,
        busApproved: allJobs.filter((j: any) => j.bus_status === 'approved' || j.bus_status === 'redeemed').length,
        busValue: allJobs.filter((j: any) => ['eligible','submitted','approved','redeemed'].includes(j.bus_status)).length * 7500,
        qcPending: allJobs.filter((j: any) => j.current_stage === 'commissioning' || j.current_stage === 'handover').length,
      })

      setRecentJobs(allJobs.slice(0, 8))
      setBusQueue(busLogs || [])
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
        <p className="text-sm text-gray-400">Loading admin dashboard...</p>
      </div>
    )
  }

  const STAGE_LABELS: Record<string, string> = {
    customer: 'Customer', survey: 'Survey', design: 'Design',
    proposal: 'Proposal', acceptance: 'Acceptance', bus_application: 'BUS Application',
    materials: 'Materials', installation: 'Installation', commissioning: 'Commissioning', handover: 'Handover',
  }

  function getStagePill(stage: string) {
    const colors: Record<string, string> = {
      customer: 'bg-gray-100 text-gray-600', survey: 'bg-blue-50 text-blue-700',
      design: 'bg-blue-50 text-blue-700', proposal: 'bg-purple-50 text-purple-700',
      acceptance: 'bg-purple-50 text-purple-700', bus_application: 'bg-amber-50 text-amber-700',
      materials: 'bg-amber-50 text-amber-700', installation: 'bg-orange-50 text-orange-700',
      commissioning: 'bg-emerald-50 text-emerald-700', handover: 'bg-emerald-100 text-emerald-800',
    }
    return colors[stage] || 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
              <path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Enerus Plus</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Admin</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin/installers" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">Installers</a>
          <a href="/admin/jobs" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">All jobs</a>
          <a href="/admin/qc" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">QC</a>
          <a href="/dashboard" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">Installer view</a>
          <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Sign out</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total installers', value: stats.installers, sub: `${stats.activeInstallers} active` },
            { label: 'Total jobs', value: stats.totalJobs, sub: 'Across network' },
            { label: 'BUS pipeline value', value: `£${stats.busValue.toLocaleString()}`, sub: `${stats.busEligible} eligible · ${stats.busApproved} approved` },
            { label: 'QC attention needed', value: stats.qcPending, sub: 'Commissioning / handover', alert: stats.qcPending > 0 },
          ].map(m => (
            <div key={m.label} className={`bg-white border rounded-xl p-4 ${m.alert && m.value > 0 ? 'border-amber-200' : 'border-gray-200'}`}>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
              <div className={`text-2xl font-semibold ${m.alert && m.value > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{m.value}</div>
              <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* BUS notification queue */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900">BUS applications to process</div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${busQueue.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
                {busQueue.length} pending
              </span>
            </div>
            {busQueue.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-400">No BUS applications pending</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {busQueue.map((log: any, i: number) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-gray-900">
                        {log.jobs?.customers?.first_name} {log.jobs?.customers?.last_name}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {log.jobs?.installer_profiles?.company_name} · £7,500
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{new Date(log.created_at).toLocaleDateString('en-GB')}</span>
                      <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Action needed</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent jobs across network */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900">Recent jobs</div>
              <a href="/admin/jobs" className="text-xs text-emerald-700 hover:underline">View all →</a>
            </div>
            <div className="divide-y divide-gray-50">
              {recentJobs.slice(0, 6).map((job: any) => (
                <div key={job.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-gray-900">
                      {job.customers?.first_name} {job.customers?.last_name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {job.installer_profiles?.company_name} · {job.customers?.city}
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStagePill(job.current_stage)}`}>
                    {STAGE_LABELS[job.current_stage]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { title: 'Manage installers', desc: 'Review profiles, approve new sign-ups, manage compliance documents', href: '/admin/installers', cta: 'View installers →' },
            { title: 'Quality control', desc: 'Review jobs at commissioning and handover stage, sign off completed installs', href: '/admin/qc', cta: 'Open QC queue →' },
            { title: 'All jobs', desc: 'View every job across your installer network with full filtering', href: '/admin/jobs', cta: 'View all jobs →' },
          ].map(card => (
            <div key={card.title} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="text-sm font-medium text-gray-900 mb-1">{card.title}</div>
              <div className="text-xs text-gray-500 mb-4">{card.desc}</div>
              <a href={card.href} className="text-xs font-medium text-emerald-700 hover:underline">{card.cta}</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}