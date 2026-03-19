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

const STAGE_ORDER = [
  'customer', 'survey', 'design', 'proposal', 'acceptance',
  'bus_application', 'materials', 'installation', 'commissioning', 'handover'
]

const BUS_LABELS: Record<string, string> = {
  not_started: 'Not claiming',
  eligible: 'Eligible',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  redeemed: 'Redeemed',
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }

      const { data: profile } = await (supabase as any)
        .from('installer_profiles')
        .select('id')
        .eq('user_id', session.user.id)
        .single()

      if (!profile) { setLoading(false); return }

      const { data } = await (supabase as any)
        .from('jobs')
        .select(`
          id, reference, current_stage, bus_status, created_at,
          customers (first_name, last_name, address_line1, city, postcode, epc_rating),
          job_stages (stage, status)
        `)
        .eq('installer_id', profile.id)
        .order('created_at', { ascending: false })

      setJobs(data || [])
      setLoading(false)
    }
    load()
  }, [])

  function getStageProgress(jobStages: any[]) {
    if (!jobStages) return 0
    const done = jobStages.filter((s: any) => s.status === 'complete').length
    return Math.round((done / 10) * 100)
  }

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

  function getBusPill(status: string) {
    const colors: Record<string, string> = {
      not_started: 'bg-gray-100 text-gray-500',
      eligible: 'bg-emerald-50 text-emerald-700',
      submitted: 'bg-amber-50 text-amber-700',
      approved: 'bg-emerald-100 text-emerald-800',
      rejected: 'bg-red-50 text-red-700',
      redeemed: 'bg-emerald-200 text-emerald-900',
    }
    return colors[status] || 'bg-gray-100 text-gray-500'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading jobs...</p>
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
          <a href="/dashboard" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Dashboard</a>
          <a href="/jobs/new" className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
            New customer
          </a>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total jobs', value: jobs.length },
            { label: 'In progress', value: jobs.filter(j => j.current_stage !== 'handover').length },
            { label: 'BUS claimed', value: jobs.filter(j => ['eligible','submitted','approved','redeemed'].includes(j.bus_status)).length },
            { label: 'Completed', value: jobs.filter(j => j.current_stage === 'handover').length },
          ].map(m => (
            <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
              <div className="text-2xl font-semibold text-gray-900">{m.value}</div>
            </div>
          ))}
        </div>

        {/* Jobs table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm font-medium text-gray-900">All jobs</div>
            <div className="text-xs text-gray-400">{jobs.length} total</div>
          </div>

          {jobs.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400">
              No jobs yet.{' '}
              <a href="/jobs/new" className="text-emerald-700 hover:underline">Create your first job →</a>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-6 py-3">Ref</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Customer</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Location</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Stage</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Progress</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">BUS</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job: any) => (
                  <tr key={job.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono text-gray-500">{job.reference || '—'}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {job.customers?.first_name} {job.customers?.last_name}
                      </div>
                      {job.customers?.epc_rating && (
                        <span className="text-xs text-gray-400">EPC {job.customers.epc_rating}</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs text-gray-600">{job.customers?.city}</div>
                      <div className="text-xs text-gray-400">{job.customers?.postcode}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStagePill(job.current_stage)}`}>
                        {STAGE_LABELS[job.current_stage] || job.current_stage}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="w-24">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">{getStageProgress(job.job_stages)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${getStageProgress(job.job_stages)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getBusPill(job.bus_status)}`}>
                        {BUS_LABELS[job.bus_status] || job.bus_status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <a
                        href={`/jobs/${job.id}`}
                        className="text-xs text-emerald-700 hover:underline font-medium"
                      >
                        Open →
                      </a>
                    </td>
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