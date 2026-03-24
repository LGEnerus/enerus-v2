'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AcceptancePage() {
  const params = useParams()
  const token = params.token as string
  const [acceptance, setAcceptance] = useState<any>(null)
  const [step, setStep] = useState<'loading' | 'view' | 'sign' | 'accepted' | 'declined'>('loading')
  const [customerName, setCustomerName] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [token])

  async function load() {
    const { data } = await supabase
      .from('customer_acceptances')
      .select('*')
      .eq('acceptance_token', token)
      .single()
    if (!data) { setStep('view'); return }
    setAcceptance(data)
    setCustomerName(data.customer_name || '')
    if (data.accepted_at) setStep('accepted')
    else if (data.declined_at) setStep('declined')
    else setStep('view')
    // Mark viewed
    if (!data.viewed_at) {
      await supabase.from('customer_acceptances').update({ viewed_at: new Date().toISOString() }).eq('acceptance_token', token)
    }
  }

  async function accept() {
    setSubmitting(true); setError('')
    try {
      const { error: e } = await supabase.from('customer_acceptances').update({
        accepted_at: new Date().toISOString(),
        customer_name: customerName,
        notes,
      }).eq('acceptance_token', token)
      if (e) throw e
      if (acceptance?.job_id) {
        await supabase.from('job_stages').update({ status: 'complete', completed_at: new Date().toISOString() })
          .eq('job_id', acceptance.job_id).eq('stage', 'acceptance')
      }
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

  const proposal = acceptance?.proposal_snapshot || {}
  const primaryColor = proposal.installerPrimaryColour || '#059669'
  const installerName = proposal.installerName || 'Your installer'
  const logoUrl = proposal.installerLogoUrl

  if (step === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  )

  if (step === 'accepted') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Proposal accepted</h1>
        <p className="text-sm text-gray-500 mb-6">
          Thank you{customerName ? `, ${customerName}` : ''}. Your acceptance has been recorded and {installerName} will be in touch to confirm the installation date.
        </p>
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
            <div className="text-sm font-bold text-gray-900">{acceptance?.customer_name || 'Customer'}</div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
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
                <div className="text-xs text-gray-400">Heat loss</div>
                <div className="font-medium text-gray-900">{proposal.totalHeatLossKw} kW</div>
              </div>
            )}
            {proposal.spf && (
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400">Seasonal performance</div>
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
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600">
            <div className="font-semibold mb-1">MCS 031 mandatory disclosure</div>
            This is not a detailed system design. Estimated annual electricity: <strong>{proposal.annualElecKwh?.toLocaleString() || '—'} kWh/year</strong>. Details may change following full survey. Provided before contract signing per MCS 031 Issue 4.0.
          </div>
        </div>

        {/* Acceptance form */}
        {step === 'view' && (
          <div className="bg-white border-2 border-emerald-400 rounded-2xl p-5 space-y-4">
            <div className="text-sm font-semibold text-gray-900">Accept this proposal</div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Your full name</label>
              <input type="text" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500"
                value={customerName} onChange={e => setCustomerName(e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Questions or notes (optional)</label>
              <textarea className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none h-20 resize-none"
                value={notes} onChange={e => setNotes(e.target.value)}/>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
              By clicking Accept, you confirm you have read and understood the proposal and MCS 031 performance estimate disclosure above.
            </div>
            {error && <div className="text-xs text-red-600">{error}</div>}
            <div className="flex gap-3">
              <button onClick={accept} disabled={submitting || !customerName.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: primaryColor }}>
                {submitting ? 'Processing...' : '✓ Accept proposal'}
              </button>
              <button onClick={() => setStep('sign')} className="px-6 py-3 rounded-xl text-sm border-2 border-gray-200 text-gray-600 hover:bg-gray-50">
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
              <input type="text" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl"
                value={customerName} onChange={e => setCustomerName(e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reason or feedback</label>
              <textarea className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl h-24 resize-none"
                value={notes} onChange={e => setNotes(e.target.value)}/>
            </div>
            <div className="flex gap-3">
              <button onClick={decline} disabled={submitting}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
                {submitting ? '...' : 'Submit feedback'}
              </button>
              <button onClick={() => setStep('view')} className="px-5 py-3 rounded-xl text-sm text-gray-500 hover:bg-gray-50">Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}