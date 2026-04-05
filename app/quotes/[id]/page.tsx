'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate, VAT_RATE_PCT, type VatRate } from '@/lib/supabase'

const STATUSES: Record<string, { label: string; colour: string }> = {
  draft:     { label: 'Draft',     colour: 'text-gray-400 bg-gray-800' },
  sent:      { label: 'Sent',      colour: 'text-blue-300 bg-blue-900/50' },
  viewed:    { label: 'Viewed',    colour: 'text-blue-200 bg-blue-800/50' },
  approved:  { label: 'Approved',  colour: 'text-emerald-300 bg-emerald-900/50' },
  declined:  { label: 'Declined',  colour: 'text-red-400 bg-red-900/30' },
  cancelled: { label: 'Cancelled', colour: 'text-gray-600 bg-gray-800' },
  converted: { label: 'Converted to job', colour: 'text-amber-300 bg-amber-900/30' },
}

// All valid transitions — can go backwards too
const TRANSITIONS: Record<string, string[]> = {
  draft:     ['sent', 'cancelled'],
  sent:      ['draft', 'viewed', 'approved', 'declined', 'cancelled'],
  viewed:    ['sent', 'approved', 'declined', 'cancelled'],
  approved:  ['sent', 'declined', 'cancelled'],
  declined:  ['draft', 'sent'],
  cancelled: ['draft'],
  converted: [],
}

// Primary button per status
const PRIMARY: Record<string, { label: string; next?: string; action?: string; colour: string }> = {
  draft:    { label: 'Send quote →',      next: 'sent',     colour: 'bg-blue-600 hover:bg-blue-500 text-white' },
  sent:     { label: 'Mark as approved →', next: 'approved', colour: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  viewed:   { label: 'Mark as approved →', next: 'approved', colour: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  approved: { label: 'Convert to job →',  action: 'convert',colour: 'bg-amber-500 hover:bg-amber-400 text-gray-950' },
}

export default function QuoteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const quoteId = params.id as string

  const [quote, setQuote] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [site, setSite] = useState<any>(null)
  const [lineItems, setLineItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [vatOverride, setVatOverride] = useState<VatRate | ''>('')

  useEffect(() => { load() }, [quoteId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)
    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)

    const [{ data: q }, { data: items }] = await Promise.all([
      (supabase as any).from('quotes').select('*, customers(*), sites(*)').eq('id', quoteId).single(),
      (supabase as any).from('line_items').select('*').eq('quote_id', quoteId).order('sort_order'),
    ])

    if (!q) { router.push('/customers'); return }
    setQuote(q); setCustomer(q.customers); setSite(q.sites)
    setLineItems(items || [])
    setLoading(false)
  }

  async function changeStatus(newStatus: string) {
    setSaving(true); setError(''); setShowStatusMenu(false)
    try {
      const updates: any = { status: newStatus, updated_at: new Date().toISOString() }
      if (newStatus === 'sent' && !quote.sent_at) updates.sent_at = new Date().toISOString()
      if (newStatus === 'approved') updates.approved_at = new Date().toISOString()
      await (supabase as any).from('quotes').update(updates).eq('id', quoteId)
      await (supabase as any).from('activity_log').insert({
        account_id: accountId, entity_type: 'quote', entity_id: quoteId,
        event: 'status_changed', summary: `Quote ${STATUSES[newStatus]?.label}`,
        user_id: userId, metadata: { from: quote.status, to: newStatus },
      })
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function convertToJob() {
    setSaving(true); setError(''); setShowConvertModal(false)
    try {
      const { data: refData } = await (supabase as any).rpc('generate_job_reference', { p_account_id: accountId })

      const { data: job, error: jErr } = await (supabase as any).from('jobs').insert({
        account_id: accountId, customer_id: quote.customer_id,
        site_id: quote.site_id, quote_id: quoteId,
        reference: refData, status: 'created',
        trade_type: quote.trade_type, title: quote.title,
        site_address_line1: quote.site_address_line1,
        site_postcode: quote.site_postcode,
        customer_notes: quote.customer_notes,
        internal_notes: quote.internal_notes,
        created_by: userId,
      }).select().single()

      if (jErr) throw jErr

      // Copy line items to the job (they stay on the quote too)
      const jobItems = lineItems.map((i, idx) => ({
        job_id: job.id, sort_order: idx, name: i.name,
        description: i.description || null, quantity: i.quantity,
        unit: i.unit, unit_price: i.unit_price, cost_price: i.cost_price,
        vat_rate: i.vat_rate, line_vat: i.line_vat, line_gross: i.line_gross,
        is_material: i.is_material,
      }))
      if (jobItems.length > 0) await (supabase as any).from('line_items').insert(jobItems)

      // Mark quote as converted
      await (supabase as any).from('quotes').update({
        status: 'converted', job_id: job.id,
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', quoteId)

      await (supabase as any).from('activity_log').insert({
        account_id: accountId, entity_type: 'quote', entity_id: quoteId,
        event: 'converted', summary: `Quote converted to job ${refData}`,
        user_id: userId, metadata: { job_id: job.id },
      })

      router.push(`/jobs/${job.id}`)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  async function applyVatOverride(rate: VatRate) {
    setSaving(true)
    try {
      for (const item of lineItems) {
        const net = item.quantity * item.unit_price
        const vatPct = VAT_RATE_PCT[rate] / 100
        await (supabase as any).from('line_items').update({ vat_rate: rate, line_vat: net * vatPct, line_gross: net * (1 + vatPct) }).eq('id', item.id)
      }
      const subtotalNet = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const totalVat = lineItems.reduce((s, i) => s + (i.quantity * i.unit_price * (VAT_RATE_PCT[rate] / 100)), 0)
      const totalGross = subtotalNet + totalVat
      await (supabase as any).from('quotes').update({ subtotal_net: subtotalNet, total_vat: totalVat, total_gross: totalGross, updated_at: new Date().toISOString() }).eq('id', quoteId)
      setVatOverride('')
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  function customerName() {
    if (!customer) return '—'
    if (customer.is_company && customer.company_name) return customer.company_name
    return `${customer.first_name} ${customer.last_name}`
  }

  function lineGross(item: any) { return item.quantity * item.unit_price * (1 + (VAT_RATE_PCT[item.vat_rate as VatRate] || 0) / 100) }

  const currentStatus = STATUSES[quote?.status]
  const transitions = TRANSITIONS[quote?.status] || []
  const primaryAction = quote ? PRIMARY[quote.status] : null
  const manualTransitions = transitions.filter(t => t !== primaryAction?.next)

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <a href={`/customers/${quote.customer_id}`} className="text-gray-600 hover:text-gray-400 text-sm">← {customerName()}</a>
        <span className="text-gray-800">/</span>
        <span className="text-xs font-mono text-gray-500">{quote.reference}</span>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}

          {/* Status control */}
          <div className="relative">
            <button onClick={() => setShowStatusMenu(p => !p)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 ${currentStatus?.colour || 'text-gray-400 bg-gray-800'}`}>
              {currentStatus?.label || quote.status}
              {manualTransitions.length > 0 && <span className="opacity-60">▾</span>}
            </button>
            {showStatusMenu && manualTransitions.length > 0 && (
              <div className="absolute right-0 top-9 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 py-1 min-w-48">
                <div className="text-xs text-gray-600 px-3 py-2 font-medium border-b border-gray-700">Change status</div>
                {manualTransitions.map(s => (
                  <button key={s} onClick={() => changeStatus(s)} disabled={saving}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${STATUSES[s]?.colour.split(' ')[0].replace('text-', 'bg-')}`}/>
                    {STATUSES[s]?.label || s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {primaryAction && quote.status !== 'converted' && (
            <button onClick={() => primaryAction.action === 'convert' ? setShowConvertModal(true) : changeStatus(primaryAction.next!)} disabled={saving}
              className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors ${primaryAction.colour}`}>
              {saving ? 'Saving…' : primaryAction.label}
            </button>
          )}

          {quote.status !== 'converted' && (
            <a href={`/quotes/${quoteId}/edit`} className="text-xs text-gray-500 border border-gray-700 px-3 py-2 rounded-lg hover:bg-gray-800">Edit</a>
          )}
        </div>
      </div>

      {/* Status flow bar */}
      <div className="bg-gray-900/50 border-b border-gray-800 px-6 py-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {['draft','sent','viewed','approved'].map((s, i, arr) => {
            const statusOrder = arr
            const currentIdx = statusOrder.indexOf(quote.status)
            const thisIdx = statusOrder.indexOf(s)
            const isCurrent = quote.status === s
            const isPast = thisIdx < currentIdx
            const canGo = transitions.includes(s)
            return (
              <div key={s} className="flex items-center flex-shrink-0">
                <button onClick={() => canGo ? changeStatus(s) : null} disabled={saving || isCurrent || !canGo}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isCurrent ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                    isPast ? 'text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer' :
                    canGo ? 'text-gray-600 hover:text-gray-300 hover:bg-gray-800 cursor-pointer' : 'text-gray-700 cursor-default'
                  }`}>
                  {isPast && <span className="text-emerald-400">✓</span>}
                  {isCurrent && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"/>}
                  {STATUSES[s]?.label}
                </button>
                {i < arr.length - 1 && <span className="text-gray-800 mx-1">›</span>}
              </div>
            )
          })}
          {quote.status === 'converted' && <span className="text-xs text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">✓ Converted to job → <a href={`/jobs/${quote.job_id}`} className="underline">View job</a></span>}
          {!['converted','cancelled'].includes(quote.status) && (
            <button onClick={() => changeStatus('cancelled')} disabled={saving}
              className="ml-3 pl-3 border-l border-gray-800 text-xs text-gray-700 hover:text-red-400 transition-colors flex-shrink-0">
              Cancel quote
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-5 max-w-screen-xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">

            {/* Details */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-base font-bold text-white">{quote.title || quote.reference}</h1>
                  <div className="text-xs font-mono text-gray-600 mt-0.5">{quote.reference}</div>
                </div>
                {quote.status !== 'converted' && <a href={`/quotes/${quoteId}/edit`} className="text-xs text-amber-400 hover:text-amber-300">Edit →</a>}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><div className="text-xs text-gray-600 mb-1">Customer</div><a href={`/customers/${quote.customer_id}`} className="text-amber-400 hover:text-amber-300">{customerName()}</a>{customer?.email && <div className="text-xs text-gray-500">{customer.email}</div>}</div>
                <div><div className="text-xs text-gray-600 mb-1">Site</div>{site ? <><div className="text-gray-200">{site.name}</div><div className="text-xs text-gray-500">{site.postcode}</div></> : <div className="text-gray-400">{quote.site_address_line1 || '—'}</div>}</div>
                <div><div className="text-xs text-gray-600 mb-1">Quote date</div><div className="text-gray-200">{formatDate(quote.quote_date || quote.created_at)}</div></div>
                {quote.valid_until && <div><div className="text-xs text-gray-600 mb-1">Valid until</div><div className="text-gray-200">{formatDate(quote.valid_until)}</div></div>}
                {quote.sent_at && <div><div className="text-xs text-gray-600 mb-1">Sent</div><div className="text-gray-200">{formatDate(quote.sent_at)}</div></div>}
                {quote.approved_at && <div><div className="text-xs text-gray-600 mb-1">Approved</div><div className="text-emerald-400">{formatDate(quote.approved_at)}</div></div>}
              </div>
              {quote.customer_notes && <div className="mt-4 pt-4 border-t border-gray-800"><div className="text-xs text-gray-600 mb-1">Notes for customer</div><div className="text-sm text-gray-300">{quote.customer_notes}</div></div>}
              {quote.internal_notes && <div className="mt-3"><div className="text-xs text-gray-600 mb-1">Internal notes</div><div className="text-sm text-gray-500 bg-gray-800 rounded-lg p-3">{quote.internal_notes}</div></div>}
            </div>

            {/* Line items */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Line items</div>
                {quote.status !== 'converted' && <a href={`/quotes/${quoteId}/edit`} className="text-xs text-amber-400 hover:text-amber-300">Edit →</a>}
              </div>
              <table className="w-full">
                <thead><tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-600 px-5 py-3">Description</th>
                  <th className="text-right text-xs font-medium text-gray-600 px-3 py-3">Qty</th>
                  <th className="text-right text-xs font-medium text-gray-600 px-3 py-3">Unit price</th>
                  <th className="text-right text-xs font-medium text-gray-600 px-3 py-3">VAT</th>
                  <th className="text-right text-xs font-medium text-gray-600 px-5 py-3">Total</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-800/50">
                  {lineItems.map(item => (
                    <tr key={item.id} className="hover:bg-gray-800/20">
                      <td className="px-5 py-3"><div className="text-sm text-gray-200">{item.name}</div>{item.description && <div className="text-xs text-gray-600">{item.description}</div>}</td>
                      <td className="px-3 py-3 text-right text-sm text-gray-400">{item.quantity} {item.unit}</td>
                      <td className="px-3 py-3 text-right text-sm text-gray-400">{formatCurrency(item.unit_price)}</td>
                      <td className="px-3 py-3 text-right text-xs text-gray-500">{VAT_RATE_PCT[item.vat_rate as VatRate]}%</td>
                      <td className="px-5 py-3 text-right text-sm font-medium text-gray-200">{formatCurrency(lineGross(item))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-700">
                  <tr><td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500">Subtotal</td><td className="px-5 py-2 text-right text-sm text-gray-300">{formatCurrency(quote.subtotal_net || 0)}</td></tr>
                  <tr><td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500">VAT</td><td className="px-5 py-2 text-right text-sm text-gray-300">{formatCurrency(quote.total_vat || 0)}</td></tr>
                  <tr className="bg-gray-800/30"><td colSpan={4} className="px-5 py-3 text-right text-sm font-semibold text-white">Total</td><td className="px-5 py-3 text-right text-base font-bold text-amber-400">{formatCurrency(quote.total_gross || 0)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">Quote total</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="text-gray-200">{formatCurrency(quote.subtotal_net || 0)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span className="text-gray-200">{formatCurrency(quote.total_vat || 0)}</span></div>
                <div className="border-t border-gray-800 pt-2 flex justify-between">
                  <span className="text-sm font-semibold text-white">Total</span>
                  <span className="text-xl font-bold text-amber-400">{formatCurrency(quote.total_gross || 0)}</span>
                </div>
              </div>
              {quote.total_cost > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-1.5">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Margin</span><span className={`${(quote.margin_pct||0) < 20 ? 'text-red-400' : (quote.margin_pct||0) < 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{(quote.margin_pct||0).toFixed(1)}%</span></div>
                </div>
              )}
            </div>

            {/* VAT override */}
            {lineItems.length > 0 && quote.status !== 'converted' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">VAT override</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['standard','reduced','zero','exempt'] as VatRate[]).map(rate => (
                    <button key={rate} onClick={() => setVatOverride(rate)}
                      className={`py-2 rounded-xl border text-xs font-medium transition-colors ${vatOverride === rate ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                      {rate === 'standard' ? '20%' : rate === 'reduced' ? '5%' : rate === 'zero' ? '0%' : 'Exempt'}
                    </button>
                  ))}
                </div>
                {vatOverride && (
                  <button onClick={() => applyVatOverride(vatOverride as VatRate)} disabled={saving}
                    className="mt-3 w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 text-xs font-bold py-2.5 rounded-xl">
                    {saving ? 'Applying…' : `Apply to all items`}
                  </button>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Actions</div>
              <div className="space-y-2">
                {quote.status !== 'converted' && <a href={`/quotes/${quoteId}/edit`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>✏️</span> Edit quote</a>}
                <a href={`/api/pdf/quote/${quoteId}`} target="_blank" className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>📄</span> Download PDF</a>
                <a href={`/customers/${quote.customer_id}`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>👤</span> View customer</a>
                {quote.job_id && <a href={`/jobs/${quote.job_id}`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>🔧</span> View job</a>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Convert to job modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowConvertModal(false) }}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <div className="text-base font-bold text-white mb-2">Convert to job</div>
            <div className="text-sm text-gray-400 mb-2">This will create a new job record with all the details and line items from this quote.</div>
            <div className="bg-gray-800 rounded-xl p-4 mb-5 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="text-gray-200">{customerName()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Quote value</span><span className="text-amber-400 font-semibold">{formatCurrency(quote.total_gross || 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Line items</span><span className="text-gray-200">{lineItems.length}</span></div>
            </div>
            <div className="text-xs text-gray-600 mb-5">The quote will remain in your quotes list marked as "Converted" and will link back to the new job.</div>
            <div className="flex gap-3">
              <button onClick={convertToJob} disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold py-3 rounded-xl text-sm">
                {saving ? 'Converting…' : '✓ Convert to job'}
              </button>
              <button onClick={() => setShowConvertModal(false)} className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-xl">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showStatusMenu && <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)}/>}
    </div>
  )
}