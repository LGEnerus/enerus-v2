'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BUS_STAGES = [
  { key: 'eligible', label: 'Eligible', desc: 'Customer qualifies — not yet submitted', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'submitted', label: 'Submitted', desc: 'Application sent to Ofgem', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'approved', label: 'Approved', desc: 'Ofgem grant approved', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'redeemed', label: 'Redeemed', desc: 'Grant paid out', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { key: 'rejected', label: 'Rejected', desc: 'Application rejected by Ofgem', color: 'bg-red-50 text-red-700 border-red-200' },
]

export default function AdminBusPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [auditLog, setAuditLog] = useState<any[]>([])

  // Form state for selected job
  const [busStatus, setBusStatus] = useState('')
  const [ofgemRef, setOfgemRef] = useState('')
  const [approvalDate, setApprovalDate] = useState('')
  const [redemptionDate, setRedemptionDate] = useState('')
  const [grantAmount, setGrantAmount] = useState('7500')
  const [notes, setNotes] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }

    const { data: userData } = await (supabase as any)
      .from('users').select('role').eq('id', session.user.id).single()
    if (userData?.role !== 'admin') { window.location.replace('/dashboard'); return }

    const { data } = await (supabase as any)
      .from('jobs')
      .select(`
        id, reference, bus_status, bus_reference, bus_amount,
        bus_submitted_at, bus_approved_at, created_at,
        customers (first_name, last_name, address_line1, city, postcode, epc_rating, notes),
        installer_profiles (company_name, mcs_number)
      `)
      .neq('bus_status', 'not_started')
      .order('created_at', { ascending: false })

    setJobs(data || [])
    setLoading(false)
  }

  async function loadAuditLog(jobId: string) {
    const { data } = await (supabase as any)
      .from('audit_log')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
    setAuditLog(data || [])
  }

  function selectJob(job: any) {
    setSelected(job)
    setBusStatus(job.bus_status || 'eligible')
    setOfgemRef(job.bus_reference || '')
    setApprovalDate(job.bus_approved_at ? job.bus_approved_at.slice(0, 10) : '')
    setRedemptionDate('')
    setGrantAmount(job.bus_amount ? String(job.bus_amount) : '7500')
    setNotes('')
    loadAuditLog(job.id)
  }

  async function saveBusUpdate() {
    if (!selected) return
    setSaving(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const updates: any = {
      bus_status: busStatus,
      bus_reference: ofgemRef || null,
      bus_amount: parseFloat(grantAmount) || 7500,
    }

    if (busStatus === 'submitted') updates.bus_submitted_at = new Date().toISOString()
    if (busStatus === 'approved' && approvalDate) updates.bus_approved_at = new Date(approvalDate).toISOString()

    await (supabase as any)
      .from('jobs')
      .update(updates)
      .eq('id', selected.id)

    // Log the change
    const statusLabel = BUS_STAGES.find(s => s.key === busStatus)?.label || busStatus
    await (supabase as any)
      .from('audit_log')
      .insert({
        job_id: selected.id,
        user_id: session.user.id,
        action: `bus_status_updated`,
        stage: 'bus_application',
        entity_type: 'job',
        entity_id: selected.id,
        description: `BUS status updated to ${statusLabel}${ofgemRef ? ` · Ofgem ref: ${ofgemRef}` : ''}${notes ? ` · Notes: ${notes}` : ''}`,
        metadata: {
          bus_status: busStatus,
          ofgem_ref: ofgemRef,
          grant_amount: grantAmount,
          notes,
        },
      })

    // Reload
    await load()
    await loadAuditLog(selected.id)

    // Update selected with new values
    setSelected((prev: any) => ({ ...prev, bus_status: busStatus, bus_reference: ofgemRef, bus_amount: grantAmount }))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function getBusColor(status: string) {
    return BUS_STAGES.find(s => s.key === status)?.color || 'bg-gray-100 text-gray-500 border-gray-200'
  }

  function getBusLabel(status: string) {
    return BUS_STAGES.find(s => s.key === status)?.label || status
  }

  const filtered = filterStatus === 'all' ? jobs : jobs.filter(j => j.bus_status === filterStatus)

  // Stats
  const totalEligible = jobs.filter(j => j.bus_status === 'eligible').length
  const totalSubmitted = jobs.filter(j => j.bus_status === 'submitted').length
  const totalApproved = jobs.filter(j => j.bus_status === 'approved').length
  const totalRedeemed = jobs.filter(j => j.bus_status === 'redeemed').length
  const totalValue = jobs.filter(j => ['submitted','approved','redeemed'].includes(j.bus_status)).length * 7500

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-sm text-gray-400">Loading BUS applications...</p></div>
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
            <div className="text-xs text-gray-400 uppercase tracking-wide">Admin · BUS Applications</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Overview</a>
          <a href="/admin/installers" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">Installers</a>
          <a href="/admin/jobs" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">All jobs</a>
          <a href="/admin/qc" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">QC</a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Eligible', value: totalEligible, color: 'text-emerald-700' },
            { label: 'Submitted', value: totalSubmitted, color: 'text-amber-700' },
            { label: 'Approved', value: totalApproved, color: 'text-blue-700' },
            { label: 'Redeemed', value: totalRedeemed, color: 'text-emerald-800' },
            { label: 'Total value processed', value: `£${totalValue.toLocaleString()}`, color: 'text-gray-900' },
          ].map(m => (
            <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
              <div className={`text-xl font-semibold ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">

          {/* Left — job list */}
          <div className="col-span-2">
            {/* Filter tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-4 w-fit">
              {['all', 'eligible', 'submitted', 'approved', 'redeemed', 'rejected'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors capitalize ${
                    filterStatus === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {s === 'all' ? `All (${jobs.length})` : `${BUS_STAGES.find(b => b.key === s)?.label} (${jobs.filter(j => j.bus_status === s).length})`}
                </button>
              ))}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400">No BUS applications in this category</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-5 py-3">Job</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Customer</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Installer</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Status</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Ofgem ref</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((job: any) => (
                      <tr
                        key={job.id}
                        className={`border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${selected?.id === job.id ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                        onClick={() => selectJob(job)}
                      >
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono text-gray-400">{job.reference || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{job.customers?.first_name} {job.customers?.last_name}</div>
                          <div className="text-xs text-gray-400">{job.customers?.city} · EPC {job.customers?.epc_rating || '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-700">{job.installer_profiles?.company_name}</div>
                          <div className="text-xs text-gray-400">{job.installer_profiles?.mcs_number}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${getBusColor(job.bus_status)}`}>
                            {getBusLabel(job.bus_status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-gray-500">{job.bus_reference || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-emerald-700">Manage →</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right — management panel */}
          <div className="col-span-1 space-y-4">
            {selected ? (
              <>
                {/* Job summary */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Application</div>
                  <div className="text-sm font-medium text-gray-900 mb-0.5">
                    {selected.customers?.first_name} {selected.customers?.last_name}
                  </div>
                  <div className="text-xs text-gray-500 mb-0.5">{selected.customers?.address_line1}</div>
                  <div className="text-xs text-gray-500 mb-3">{selected.customers?.city} · {selected.customers?.postcode}</div>

                  {/* EPC cert from notes */}
                  {selected.customers?.notes && (
                    <div className="bg-gray-50 rounded-lg px-3 py-2 mb-3">
                      <div className="text-xs text-gray-400 mb-0.5">EPC Certificate Number</div>
                      <div className="text-xs font-mono text-gray-700 break-all">
                        {selected.customers.notes.replace('EPC Certificate Number: ', '')}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 mb-1">{selected.installer_profiles?.company_name}</div>
                  <div className="text-xs font-mono text-gray-400">{selected.reference}</div>
                </div>

                {/* BUS management form */}
                <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                  <div className="text-xs font-medium text-gray-600">Update BUS application</div>

                  {/* Status selector */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Application status</label>
                    <div className="space-y-2">
                      {BUS_STAGES.map(stage => (
                        <button
                          key={stage.key}
                          onClick={() => setBusStatus(stage.key)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                            busStatus === stage.key
                              ? `${stage.color} border`
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div className={`text-xs font-medium ${busStatus === stage.key ? '' : 'text-gray-700'}`}>{stage.label}</div>
                          <div className={`text-xs mt-0.5 ${busStatus === stage.key ? 'opacity-80' : 'text-gray-400'}`}>{stage.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ofgem reference */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Ofgem application reference</label>
                    <input
                      type="text"
                      value={ofgemRef}
                      onChange={e => setOfgemRef(e.target.value)}
                      placeholder="e.g. BUS-2024-123456"
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  {/* Grant amount */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Grant amount (£)</label>
                    <input
                      type="number"
                      value={grantAmount}
                      onChange={e => setGrantAmount(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Approval date — show when approved or redeemed */}
                  {(busStatus === 'approved' || busStatus === 'redeemed') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Approval date</label>
                      <input
                        type="date"
                        value={approvalDate}
                        onChange={e => setApprovalDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {/* Redemption date */}
                  {busStatus === 'redeemed' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Redemption date</label>
                      <input
                        type="date"
                        value={redemptionDate}
                        onChange={e => setRedemptionDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add any notes about this application..."
                      rows={2}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>

                  <button
                    onClick={saveBusUpdate}
                    disabled={saving}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
                  >
                    {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save changes'}
                  </button>
                </div>

                {/* Audit log for this job */}
                {auditLog.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="text-xs font-medium text-gray-600 mb-3">Activity log</div>
                    <div className="space-y-2.5 max-h-48 overflow-y-auto">
                      {auditLog.map((log: any) => (
                        <div key={log.id} className="text-xs">
                          <div className="flex justify-between gap-2">
                            <span className={`font-medium ${
                              log.action.includes('bus') ? 'text-emerald-700' :
                              log.action.includes('approved') ? 'text-blue-700' : 'text-gray-600'
                            }`}>
                              {log.action.replace(/_/g, ' ')}
                            </span>
                            <span className="text-gray-400 flex-shrink-0">{new Date(log.created_at).toLocaleDateString('en-GB')}</span>
                          </div>
                          <div className="text-gray-500 mt-0.5">{log.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-center h-48">
                <p className="text-xs text-gray-400">Select a job to manage its BUS application</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}