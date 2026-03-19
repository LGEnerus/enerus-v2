'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminQCPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [auditLog, setAuditLog] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedJob, setSelectedJob] = useState<any>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }

      const { data: userData } = await (supabase as any)
        .from('users').select('role').eq('id', session.user.id).single()
      if (userData?.role !== 'admin') { window.location.replace('/dashboard'); return }

      // Jobs at commissioning or handover stage
      const { data: qcJobs } = await (supabase as any)
        .from('jobs')
        .select(`
          id, reference, current_stage, bus_status, created_at,
          customers (first_name, last_name, address_line1, city, postcode, epc_rating),
          installer_profiles (company_name, mcs_number),
          job_stages (stage, status, completed_at),
          mcs_documents (doc_ref, doc_name, status)
        `)
        .in('current_stage', ['commissioning', 'handover', 'installation'])
        .order('created_at', { ascending: false })

      // Full audit log
      const { data: logs } = await (supabase as any)
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      setJobs(qcJobs || [])
      setAuditLog(logs || [])
      setLoading(false)
    }
    load()
  }, [])

  async function signOffJob(jobId: string, action: 'approve' | 'flag') {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await (supabase as any)
      .from('audit_log')
      .insert({
        job_id: jobId,
        user_id: session.user.id,
        action: action === 'approve' ? 'qc_approved' : 'qc_flagged',
        entity_type: 'job',
        entity_id: jobId,
        description: action === 'approve'
          ? `QC approved by admin${notes ? `: ${notes}` : ''}`
          : `QC flagged by admin: ${notes}`,
        metadata: { notes },
      })

    if (action === 'approve') {
      await (supabase as any)
        .from('jobs')
        .update({ qc_status: 'approved' })
        .eq('id', jobId)
    } else {
      await (supabase as any)
        .from('jobs')
        .update({ qc_status: 'flagged' })
        .eq('id', jobId)
    }

    setNotes('')
    setSelectedJob(null)
    setSaving(false)

    // Reload audit log
    const { data: logs } = await (supabase as any)
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setAuditLog(logs || [])
  }

  function getDocStatusPill(status: string) {
    const map: Record<string, string> = {
      not_generated: 'bg-gray-100 text-gray-400',
      generated: 'bg-blue-50 text-blue-700',
      signed: 'bg-emerald-50 text-emerald-700',
      approved: 'bg-emerald-100 text-emerald-800',
      rejected: 'bg-red-50 text-red-700',
    }
    return map[status] || 'bg-gray-100 text-gray-400'
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-sm text-gray-400">Loading QC queue...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z" /></svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Enerus Plus</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Admin · Quality Control</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Overview</a>
          <a href="/admin/installers" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">Installers</a>
          <a href="/admin/jobs" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">All jobs</a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-base font-medium text-gray-900">Quality control</h1>
            <p className="text-xs text-gray-500 mt-0.5">{jobs.length} jobs at installation, commissioning or handover stage</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">

          {/* QC queue */}
          <div className="col-span-2 space-y-3">
            {jobs.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                <div className="text-sm text-gray-400">No jobs currently require QC review</div>
              </div>
            ) : (
              jobs.map((job: any) => {
                const completedStages = (job.job_stages || []).filter((s: any) => s.status === 'complete').length
                const totalDocs = (job.mcs_documents || []).length
                const completedDocs = (job.mcs_documents || []).filter((d: any) => d.status !== 'not_generated').length

                return (
                  <div
                    key={job.id}
                    className={`bg-white border rounded-xl p-5 cursor-pointer transition-colors ${selectedJob?.id === job.id ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'}`}
                    onClick={() => setSelectedJob(job)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-gray-400">{job.reference}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            job.current_stage === 'handover' ? 'bg-emerald-100 text-emerald-800' :
                            job.current_stage === 'commissioning' ? 'bg-emerald-50 text-emerald-700' :
                            'bg-orange-50 text-orange-700'
                          }`}>
                            {job.current_stage.charAt(0).toUpperCase() + job.current_stage.slice(1)}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-gray-900">
                          {job.customers?.first_name} {job.customers?.last_name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {job.installer_profiles?.company_name} · {job.customers?.city}
                        </div>
                      </div>
                      <div className="text-right">
                        {job.bus_status === 'eligible' && (
                          <div className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full mb-1">BUS £7,500</div>
                        )}
                        <div className="text-xs text-gray-400">{new Date(job.created_at).toLocaleDateString('en-GB')}</div>
                      </div>
                    </div>

                    {/* Progress indicators */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-400">Stages complete</span>
                          <span className="text-gray-600 font-medium">{completedStages}/10</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${completedStages * 10}%` }}/>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-400">Documents</span>
                          <span className="text-gray-600 font-medium">{completedDocs}/{totalDocs}</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: totalDocs > 0 ? `${(completedDocs / totalDocs) * 100}%` : '0%' }}/>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Right panel — job detail / audit log */}
          <div className="col-span-1 space-y-4">

            {/* Selected job detail */}
            {selectedJob ? (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="text-xs font-medium text-gray-600 mb-3">QC review — {selectedJob.reference}</div>

                {/* Documents status */}
                <div className="space-y-1.5 mb-4">
                  {(selectedJob.mcs_documents || []).map((doc: any) => (
                    <div key={doc.doc_ref} className="flex items-center justify-between">
                      <span className="text-xs text-gray-600 truncate mr-2">{doc.doc_name}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${getDocStatusPill(doc.status)}`}>
                        {doc.status?.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">QC notes</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add notes for the installer..."
                    rows={3}
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => signOffJob(selectedJob.id, 'approve')}
                    disabled={saving}
                    className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium py-2 rounded-lg transition-colors"
                  >
                    {saving ? '...' : 'Approve ✓'}
                  </button>
                  <button
                    onClick={() => signOffJob(selectedJob.id, 'flag')}
                    disabled={saving || !notes}
                    className="bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-700 text-xs font-medium py-2 rounded-lg border border-red-200 transition-colors"
                  >
                    Flag issue
                  </button>
                </div>
                {!notes && <p className="text-xs text-gray-400 mt-1.5">Add a note to flag an issue</p>}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-center h-32">
                <p className="text-xs text-gray-400">Select a job to review</p>
              </div>
            )}

            {/* Audit log */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="text-xs font-medium text-gray-600 mb-3">Recent audit log</div>
              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {auditLog.slice(0, 20).map((log: any) => (
                  <div key={log.id} className="text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`font-medium flex-shrink-0 ${
                        log.action.includes('approved') ? 'text-emerald-700' :
                        log.action.includes('flagged') ? 'text-red-600' :
                        log.action.includes('bus') ? 'text-amber-700' :
                        'text-gray-700'
                      }`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-400 flex-shrink-0">{new Date(log.created_at).toLocaleDateString('en-GB')}</span>
                    </div>
                    <div className="text-gray-500 mt-0.5 truncate">{log.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}