'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const STAGE_LABELS: Record<string, string> = {
  customer: 'Customer', survey: 'Survey', design: 'Design',
  proposal: 'Proposal', acceptance: 'Acceptance', bus_application: 'BUS Application',
  materials: 'Materials', installation: 'Installation', commissioning: 'Commissioning', handover: 'Handover',
}

const BUS_LABELS: Record<string, string> = {
  not_started: 'Not claiming', eligible: 'Eligible', submitted: 'Submitted',
  approved: 'Approved', rejected: 'Rejected', redeemed: 'Redeemed',
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState('all')
  const [busFilter, setBusFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }

      const { data: userData } = await (supabase as any)
        .from('users').select('role').eq('id', session.user.id).single()
      if (userData?.role !== 'admin') { window.location.replace('/dashboard'); return }

      const { data } = await (supabase as any)
        .from('jobs')
        .select(`
          id, reference, current_stage, bus_status, created_at,
          customers (first_name, last_name, city, postcode, epc_rating),
          installer_profiles (company_name, mcs_number)
        `)
        .order('created_at', { ascending: false })

      setJobs(data || [])
      setFiltered(data || [])
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    let f = jobs
    if (stageFilter !== 'all') f = f.filter(j => j.current_stage === stageFilter)
    if (busFilter !== 'all') f = f.filter(j => j.bus_status === busFilter)
    setFiltered(f)
  }, [stageFilter, busFilter, jobs])

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

  function getBusPill(status: string) {
    const colors: Record<string, string> = {
      not_started: 'bg-gray-100 text-gray-500', eligible: 'bg-emerald-50 text-emerald-700',
      submitted: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-100 text-emerald-800',
      rejected: 'bg-red-50 text-red-700', redeemed: 'bg-emerald-200 text-emerald-900',
    }
    return colors[status] || 'bg-gray-100 text-gray-500'
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  }

  const busTotal = jobs.filter(j => ['eligible','submitted','approved','redeemed'].includes(j.bus_status)).length * 7500

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z" /></svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Enerus Plus</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Admin</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Overview</a>
          <a href="/admin/installers" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">Installers</a>
          <a href="/admin/qc" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">QC</a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total jobs', value: jobs.length },
            { label: 'BUS pipeline', value: `£${busTotal.toLocaleString()}` },
            { label: 'In progress', value: jobs.filter(j => j.current_stage !== 'handover').length },
            { label: 'Completed', value: jobs.filter(j => j.current_stage === 'handover').length },
          ].map(m => (
            <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
              <div className="text-2xl font-semibold text-gray-900">{m.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All stages</option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select
            value={busFilter}
            onChange={e => setBusFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All BUS status</option>
            {Object.entries(BUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="text-xs text-gray-400 self-center">{filtered.length} jobs</span>
        </div>

        {/* Jobs table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-5 py-3">Ref</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Customer</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Installer</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Location</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Stage</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">BUS</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job: any) => (
                <tr key={job.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3"><span className="text-xs font-mono text-gray-400">{job.reference || '—'}</span></td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{job.customers?.first_name} {job.customers?.last_name}</div>
                    {job.customers?.epc_rating && <span className="text-xs text-gray-400">EPC {job.customers.epc_rating}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-700">{job.installer_profiles?.company_name}</div>
                    <div className="text-xs text-gray-400">{job.installer_profiles?.mcs_number}</div>
                  </td>
                  <td className="px-4 py-3"><div className="text-xs text-gray-500">{job.customers?.city}, {job.customers?.postcode}</div></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStagePill(job.current_stage)}`}>
                      {STAGE_LABELS[job.current_stage]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getBusPill(job.bus_status)}`}>
                      {BUS_LABELS[job.bus_status]}
                    </span>
                  </td>
                  <td className="px-4 py-3"><span className="text-xs text-gray-400">{new Date(job.created_at).toLocaleDateString('en-GB')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}