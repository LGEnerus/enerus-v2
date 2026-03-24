'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AcceptanceClient({ acceptance, token }: { acceptance: any; token: string }) {
  const [step, setStep] = useState<'view' | 'sign' | 'accepted' | 'declined'>
    (acceptance.accepted_at ? 'accepted' : acceptance.declined_at ? 'declined' : 'view')
  const [customerName, setCustomerName] = useState(acceptance.customer_name || '')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const job = acceptance.jobs
  const customer = job?.customers
  const proposal = acceptance.proposal_snapshot || {}

  async function accept() {
    setSubmitting(true); setError('')
    try {
      const { error: e } = await supabase.from('customer_acceptances').update({
        accepted_at: new Date().toISOString(),
        customer_name: customerName,
        notes,
        customer_ip: 'captured-server-side',
      }).eq('acceptance_token', token)
      if (e) throw e
      // Mark acceptance stage complete on job
      await supabase.from('job_stages').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('job_id', job.id).eq('stage', 'acceptance')
      setStep('accepted')
    } catch (e: any) { setError(e.message) }
    setSubmitting(false)
  }

  async function decline() {
    setSubmitting(true); setError('')
    try {
      await supabase.from('customer_acceptances').update({
        declined_at: new Date().toISOString(),
        customer_name: customerName,
        notes,
      }).eq('acceptance_token', token)
      setStep('declined')
    } catch (e: any) { setError(e.message) }
    setSubmitting(false)
  }

  const primaryColor = proposal.installerPrimaryColour || '#059669'
  const installerName = proposal.installerName || 'Your installer'
  const logoUrl = proposal.installerLogoUrl

  if (step === 'accepted') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Proposal accepted</h1>
        <p className="text-sm text-gray-500 mb-6">Thank you{customerName ? `, ${customerName}` : ''}. Your acceptance has been recorded and {installerName} will be in touch to confirm the installation date.</p>
        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-400">
          Accepted on {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </div>
  )

  if (step === 'declined') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">📋</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Feedback recorded</h1>
        <p className="text-sm text-gray-500">Thank you for letting us know. {installerName} will be in touch to discuss your requirements.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Branded header */}
      <div className="bg-white border-b px-4 py-4" style={{ borderBottomColor: primaryColor, borderBottomWidth: 3 }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl
              ? <img src={logoUrl} alt={installerName} className="h-10 object-contain"/>
              : <div className="text-lg font-bold" style={{ color: primaryColor }}>{installerName}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Heat pump proposal for</div>
            <div className="text-sm font-bold text-gray-900">{customer?.first_name} {customer?.last_name}</div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Status banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-xl">📄</span>
          <div>
            <div className="text-sm font-semibold text-blue-900">Your heat pump proposal</div>
            <div className="text-xs text-blue-700 mt-0.5">Please review the details below. Once you're happy, sign to accept and {installerName} will book your installation.</div>
          </div>
        </div>

        {/* Proposal summary */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div className="text-sm font-semibold text-gray-900">System summary</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-400">Property</div>
              <div className="font-medium text-gray-900">{customer?.address_line1}</div>
              <div className="text-xs text-gray-500">{customer?.postcode}</div>
            </div>
            {proposal.hpModel && (
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400">Heat pump</div>
                <div className="font-medium text-gray-900">{proposal.hpModel}</div>
              </div>
            )}
            {proposal.cylinderModel && (
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400">Hot water cylinder</div>
                <div className="font-medium text-gray-900">{proposal.cylinderModel}</div>
              </div>
            )}
            {proposal.totalHeatLossKw && (
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400">Calculated heat loss</div>
                <div className="font-medium text-gray-900">{proposal.totalHeatLossKw} kW</div>
              </div>
            )}
            {proposal.spf && (
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400">Est. seasonal performance</div>
                <div className="font-medium text-gray-900">{proposal.spf} SPF</div>
              </div>
            )}
            {proposal.busGrant && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="text-xs text-amber-600">BUS grant applied</div>
                <div className="font-bold text-amber-700 text-lg">-£{proposal.busGrant.toLocaleString()}</div>
              </div>
            )}
          </div>

          {/* MCS 031 disclosure */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600">
            <div className="font-semibold mb-1">MCS 031 mandatory disclosure</div>
            This is not a detailed system design. It offers a reasonable estimate of likely performance based on the heat loss calculation above. Estimated annual electricity consumption: <strong>{proposal.annualElecKwh?.toLocaleString() || '—'} kWh/year</strong>. Details may change following the full survey. This estimate has been provided to you before any contract is signed, in accordance with MCS 031 Issue 4.0.
          </div>
        </div>

        {/* Full proposal link */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Full proposal document</div>
            <div className="text-xs text-gray-400 mt-0.5">View the complete heat loss calculation, room breakdown and system specification</div>
          </div>
          <a href={`/api/proposal/${job?.id}`} target="_blank"
            className="text-xs font-medium px-4 py-2 rounded-xl border-2 transition-colors"
            style={{ borderColor: primaryColor, color: primaryColor }}>
            View proposal →
          </a>
        </div>

        {/* Acceptance form */}
        {step === 'view' && (
          <div className="bg-white border-2 border-emerald-400 rounded-2xl p-5 space-y-4">
            <div className="text-sm font-semibold text-gray-900">Accept this proposal</div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Your full name (to confirm identity)</label>
              <input type="text" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500"
                value={customerName} onChange={e => setCustomerName(e.target.value)}
                placeholder={`${customer?.first_name} ${customer?.last_name}`}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Any questions or notes (optional)</label>
              <textarea className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 h-20 resize-none"
                value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any questions for your installer..."/>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
              By clicking Accept, you confirm that you have read and understood the proposal, including the MCS 031 performance estimate disclosure above. This does not commit you to a specific price — your installer will confirm final pricing before work begins.
            </div>
            {error && <div className="text-xs text-red-600">{error}</div>}
            <div className="flex gap-3">
              <button onClick={accept} disabled={submitting || !customerName.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: primaryColor }}>
                {submitting ? 'Processing...' : '✓ Accept proposal'}
              </button>
              <button onClick={() => setStep('sign')} disabled={submitting}
                className="px-6 py-3 rounded-xl text-sm font-medium border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                Not right now
              </button>
            </div>
          </div>
        )}

        {step === 'sign' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            <div className="text-sm font-semibold text-gray-900">Let us know</div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Your name</label>
              <input type="text" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none"
                value={customerName} onChange={e => setCustomerName(e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reason or feedback (optional)</label>
              <textarea className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none h-24 resize-none"
                value={notes} onChange={e => setNotes(e.target.value)} placeholder="What would make this proposal better for you?"/>
            </div>
            <div className="flex gap-3">
              <button onClick={decline} disabled={submitting}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                {submitting ? '...' : 'Submit feedback'}
              </button>
              <button onClick={() => setStep('view')} className="px-5 py-3 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}