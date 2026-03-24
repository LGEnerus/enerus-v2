'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const BUS_STAGES = [
  { key: 'not_started',  label: 'Not started',       color: 'bg-gray-100 text-gray-500' },
  { key: 'eligible',     label: 'Eligibility confirmed', color: 'bg-blue-100 text-blue-700' },
  { key: 'submitted',    label: 'Application submitted', color: 'bg-amber-100 text-amber-700' },
  { key: 'approved',     label: 'Approved by Ofgem',  color: 'bg-emerald-100 text-emerald-700' },
  { key: 'rejected',     label: 'Rejected',           color: 'bg-red-100 text-red-700' },
  { key: 'redeemed',     label: 'Grant redeemed',     color: 'bg-emerald-700 text-white' },
]

const ELIGIBILITY_CHECKS = [
  { key: 'epc_confirmed', label: 'Valid EPC confirmed (Band A–D)', required: true },
  { key: 'no_insulation_rec', label: 'No outstanding loft or cavity wall insulation recommendations on EPC', required: true },
  { key: 'owner_occupied', label: 'Owner-occupied or private landlord', required: true },
  { key: 'england_wales', label: 'Property in England or Wales', required: true },
  { key: 'no_prev_bus', label: 'No previous BUS grant received for this property', required: true },
  { key: 'mcs_installer', label: 'Installer holds valid MCS accreditation', required: true },
  { key: 'acceptance_received', label: 'Customer acceptance received', required: true },
]

export default function BUSTrackerPage() {
  const params = useParams()
  const jobId = params.id as string
  const [job, setJob] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sendingAcceptance, setSendingAcceptance] = useState(false)
  const [acceptanceUrl, setAcceptanceUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { load() }, [jobId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }
    setJob(jd)
    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)
    // Load existing acceptance link
    const { data: acc } = await (supabase as any).from('customer_acceptances').select('acceptance_token,accepted_at').eq('job_id', jobId).single()
    if (acc?.acceptance_token) {
      setAcceptanceUrl(`${window.location.origin}/accept/${acc.acceptance_token}`)
      if (acc.accepted_at) setChecks(p => ({ ...p, acceptance_received: true }))
    }
    setLoading(false)
  }

  function updJob(updates: any) { setJob((p: any) => ({ ...p, ...updates })) }
  function toggle(key: string) { setChecks(p => ({ ...p, [key]: !p[key] })) }

  const allEligible = ELIGIBILITY_CHECKS.filter(c => c.required).every(c => checks[c.key])
  const currentStatus = job?.bus_status || 'not_started'

  async function sendAcceptanceLink() {
    setSendingAcceptance(true); setError('')
    try {
      const res = await fetch(`/api/acceptance/${jobId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAcceptanceUrl(data.url)
    } catch (e: any) { setError(e.message) }
    setSendingAcceptance(false)
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const { error: e } = await (supabase as any).from('jobs').update({
        bus_status: job.bus_status,
        bus_eligible: allEligible,
        bus_application_date: job.bus_application_date,
        bus_ofgem_reference: job.bus_ofgem_reference,
        bus_amount_confirmed: job.bus_amount_confirmed,
        bus_payment_received_at: job.bus_payment_received_at,
        bus_rejection_reason: job.bus_rejection_reason,
        bus_notes: job.bus_notes,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId)
      if (e) throw e
      // Update bus stage
      const stageStatus = job.bus_status === 'redeemed' ? 'complete' : job.bus_status === 'not_started' ? 'locked' : 'in_progress'
      await (supabase as any).from('job_stages').update({ status: stageStatus }).eq('job_id', jobId).eq('stage', 'bus_application')
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  const inp = "w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"
  const statusInfo = BUS_STAGES.find(s => s.key === currentStatus)

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-sm text-gray-400">Loading...</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">BUS Grant Tracker</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.address_line1}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">← Job</a>
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button onClick={save} disabled={saving}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Grant summary */}
        <div className="bg-amber-700 text-white rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-amber-200">Boiler Upgrade Scheme</div>
              <div className="text-2xl font-bold mt-0.5">£7,500</div>
              <div className="text-xs text-amber-200 mt-1">Air source heat pump grant</div>
            </div>
            <div className="text-right">
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${statusInfo?.color}`}>
                {statusInfo?.label}
              </span>
              {job.bus_ofgem_reference && (
                <div className="text-xs text-amber-200 mt-1">Ofgem ref: {job.bus_ofgem_reference}</div>
              )}
            </div>
          </div>
        </div>

        {/* Status pipeline */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-900 mb-4">Application status</div>
          <div className="flex items-center gap-1">
            {BUS_STAGES.filter(s => s.key !== 'rejected').map((stage, i, arr) => {
              const stageIdx = arr.findIndex(s => s.key === currentStatus)
              const thisIdx = i
              const isPast = thisIdx <= stageIdx
              const isCurrent = stage.key === currentStatus
              return (
                <div key={stage.key} className="flex-1 flex flex-col items-center">
                  <div className={`w-full h-1.5 rounded-full transition-colors ${isPast ? 'bg-emerald-500' : 'bg-gray-200'}`}/>
                  <button onClick={() => updJob({ bus_status: stage.key })}
                    className={`mt-1.5 text-xs text-center px-1 py-0.5 rounded-lg transition-colors ${isCurrent ? 'font-bold text-emerald-700' : isPast ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {stage.label}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Customer acceptance */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-900 mb-3">Customer acceptance</div>
          {acceptanceUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 truncate font-mono">
                  {acceptanceUrl}
                </div>
                <button onClick={() => { navigator.clipboard.writeText(acceptanceUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className={`text-xs px-3 py-2 rounded-xl border transition-colors ${copied ? 'bg-emerald-700 text-white border-emerald-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {copied ? '✓ Copied' : 'Copy link'}
                </button>
              </div>
              {checks.acceptance_received && (
                <div className="text-xs text-emerald-700 font-medium">✓ Customer has accepted the proposal</div>
              )}
              {!checks.acceptance_received && (
                <div className="text-xs text-amber-600">⏳ Waiting for customer acceptance</div>
              )}
            </div>
          ) : (
            <button onClick={sendAcceptanceLink} disabled={sendingAcceptance}
              className="text-sm bg-emerald-700 text-white px-5 py-2.5 rounded-xl hover:bg-emerald-800 disabled:opacity-50">
              {sendingAcceptance ? 'Generating...' : 'Generate acceptance link'}
            </button>
          )}
        </div>

        {/* Eligibility checklist */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Eligibility checks</div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${allEligible ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {ELIGIBILITY_CHECKS.filter(c => checks[c.key]).length}/{ELIGIBILITY_CHECKS.length} confirmed
            </span>
          </div>
          <div className="p-5 space-y-2.5">
            {ELIGIBILITY_CHECKS.map(check => (
              <label key={check.key} className="flex items-start gap-3 cursor-pointer group">
                <div onClick={() => toggle(check.key)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${checks[check.key] ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 group-hover:border-emerald-400'}`}>
                  {checks[check.key] && <svg width="12" height="9" viewBox="0 0 12 9" fill="white"><path d="M1 4l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className={`text-sm ${checks[check.key] ? 'text-gray-900' : 'text-gray-600'}`}>{check.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Application details */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-900 mb-4">Application details</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Application submission date</label>
              <input type="date" className={inp} value={job.bus_application_date || ''} onChange={e => updJob({ bus_application_date: e.target.value })}/>
            </div>
            <div>
              <label className={lbl}>Ofgem reference number</label>
              <input type="text" className={inp} value={job.bus_ofgem_reference || ''} onChange={e => updJob({ bus_ofgem_reference: e.target.value })} placeholder="BUS-XXXXXXXX"/>
            </div>
            <div>
              <label className={lbl}>Grant amount confirmed (£)</label>
              <input type="number" className={inp} value={job.bus_amount_confirmed || ''} onChange={e => updJob({ bus_amount_confirmed: e.target.value })} placeholder="7500"/>
            </div>
            <div>
              <label className={lbl}>Payment received date</label>
              <input type="date" className={inp} value={job.bus_payment_received_at ? job.bus_payment_received_at.split('T')[0] : ''} onChange={e => updJob({ bus_payment_received_at: e.target.value })}/>
            </div>
          </div>
          {currentStatus === 'rejected' && (
            <div className="mt-3">
              <label className={lbl}>Rejection reason</label>
              <textarea className={`${inp} h-20 resize-none`} value={job.bus_rejection_reason || ''} onChange={e => updJob({ bus_rejection_reason: e.target.value })}/>
            </div>
          )}
          <div className="mt-3">
            <label className={lbl}>Notes</label>
            <textarea className={`${inp} h-20 resize-none`} value={job.bus_notes || ''} onChange={e => updJob({ bus_notes: e.target.value })} placeholder="Any notes about the BUS application..."/>
          </div>
        </div>
      </div>
    </div>
  )
}