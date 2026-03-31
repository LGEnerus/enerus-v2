'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate, isQuote, isJob, isInvoice, VAT_RATE_PCT, type VatRate, type WorkStatus } from '@/lib/supabase'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', quote_sent: 'Quote sent', quote_viewed: 'Quote viewed',
  quote_accepted: 'Accepted', quote_declined: 'Declined',
  job_scheduled: 'Scheduled', job_in_progress: 'In progress', job_complete: 'Complete',
  invoice_sent: 'Invoice sent', invoice_viewed: 'Invoice viewed',
  invoice_partially_paid: 'Part paid', invoice_paid: 'Paid',
  invoice_overdue: 'Overdue', cancelled: 'Cancelled', archived: 'Archived',
}

const STATUS_COLOUR: Record<string, string> = {
  draft: 'text-gray-400 bg-gray-800',
  quote_sent: 'text-blue-300 bg-blue-900/50',
  quote_viewed: 'text-blue-200 bg-blue-800/50',
  quote_accepted: 'text-amber-300 bg-amber-900/50',
  quote_declined: 'text-gray-500 bg-gray-800',
  job_scheduled: 'text-purple-300 bg-purple-900/50',
  job_in_progress: 'text-amber-300 bg-amber-900/50',
  job_complete: 'text-emerald-300 bg-emerald-900/50',
  invoice_sent: 'text-blue-300 bg-blue-900/50',
  invoice_viewed: 'text-blue-200 bg-blue-800/50',
  invoice_partially_paid: 'text-amber-300 bg-amber-900/50',
  invoice_paid: 'text-emerald-300 bg-emerald-900/50',
  invoice_overdue: 'text-red-300 bg-red-900/50',
  cancelled: 'text-gray-600 bg-gray-800',
}

// Workflow stages with descriptions
const STAGES = [
  { key: 'quote', label: 'Quote', statuses: ['draft','quote_sent','quote_viewed','quote_accepted','quote_declined'] },
  { key: 'job', label: 'Job', statuses: ['job_scheduled','job_in_progress','job_complete'] },
  { key: 'invoice', label: 'Invoice', statuses: ['invoice_sent','invoice_viewed','invoice_partially_paid','invoice_paid','invoice_overdue'] },
]

// Primary CTA for each status — what the main button does
const PRIMARY_ACTION: Record<string, { label: string; next?: string; action?: string; colour: string }> = {
  draft:                { label: 'Send quote →',       next: 'quote_sent',      colour: 'bg-blue-600 hover:bg-blue-500 text-white' },
  quote_sent:           { label: 'Mark as accepted →', next: 'quote_accepted',  colour: 'bg-amber-500 hover:bg-amber-400 text-gray-950' },
  quote_accepted:       { label: 'Convert to job →',   action: 'convert_to_job', colour: 'bg-purple-600 hover:bg-purple-500 text-white' },
  job_scheduled:        { label: 'Start job →',        next: 'job_in_progress', colour: 'bg-amber-500 hover:bg-amber-400 text-gray-950' },
  job_in_progress:      { label: 'Mark complete →',    next: 'job_complete',    colour: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  job_complete:         { label: 'Create invoice →',   action: 'create_invoice', colour: 'bg-amber-500 hover:bg-amber-400 text-gray-950' },
  invoice_sent:         { label: 'Log payment →',      action: 'payment',       colour: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  invoice_viewed:       { label: 'Log payment →',      action: 'payment',       colour: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  invoice_overdue:      { label: 'Log payment →',      action: 'payment',       colour: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  invoice_partially_paid: { label: 'Log payment →',   action: 'payment',       colour: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
}

// All possible manual status changes per status
const MANUAL_TRANSITIONS: Record<string, string[]> = {
  draft: ['quote_sent','job_scheduled','cancelled'],
  quote_sent: ['quote_viewed','quote_accepted','quote_declined'],
  quote_viewed: ['quote_accepted','quote_declined','quote_sent'],
  quote_accepted: ['job_scheduled'],
  quote_declined: ['draft','archived'],
  job_scheduled: ['job_in_progress','job_complete','cancelled'],
  job_in_progress: ['job_complete','job_scheduled','cancelled'],
  job_complete: ['invoice_sent','job_in_progress'],
  invoice_sent: ['invoice_viewed','invoice_paid','invoice_overdue','invoice_partially_paid'],
  invoice_viewed: ['invoice_paid','invoice_overdue','invoice_partially_paid'],
  invoice_partially_paid: ['invoice_paid','invoice_overdue'],
  invoice_paid: ['archived'],
  invoice_overdue: ['invoice_paid','invoice_partially_paid'],
  cancelled: ['draft','archived'],
}

type Tab = 'overview' | 'items' | 'payments' | 'activity'

export default function WorkDetailPage() {
  const params = useParams()
  const router = useRouter()
  const workId = params.id as string

  const [work, setWork] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [site, setSite] = useState<any>(null)
  const [lineItems, setLineItems] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')

  // Modals / overlays
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [paymentRef, setPaymentRef] = useState('')

  // VAT override
  const [vatOverride, setVatOverride] = useState<VatRate | ''>('')

  useEffect(() => { load() }, [workId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)
    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)

    const [{ data: w }, { data: items }, { data: pays }, { data: acts }] = await Promise.all([
      (supabase as any).from('works').select('*, customers(*), sites(*)').eq('id', workId).single(),
      (supabase as any).from('line_items').select('*').eq('work_id', workId).order('sort_order'),
      (supabase as any).from('payments').select('*').eq('work_id', workId).order('paid_at', { ascending: false }),
      (supabase as any).from('activity_log').select('*').eq('entity_id', workId).order('created_at', { ascending: false }).limit(50),
    ])

    if (!w) { router.push('/works'); return }
    setWork(w); setCustomer(w.customers); setSite(w.sites)
    setLineItems(items || [])
    setPayments(pays || [])
    setActivity(acts || [])
    setPaymentAmount(((w.amount_due || 0)).toFixed(2))
    setLoading(false)
  }

  async function changeStatus(newStatus: string) {
    setSaving(true); setError(''); setShowStatusMenu(false)
    try {
      const updates: any = { status: newStatus, updated_at: new Date().toISOString() }
      if (newStatus === 'quote_sent') updates.quote_date = new Date().toISOString().split('T')[0]
      if (newStatus === 'invoice_sent') {
        updates.invoice_date = new Date().toISOString().split('T')[0]
        const due = new Date(); due.setDate(due.getDate() + 30)
        updates.invoice_due_date = due.toISOString().split('T')[0]
      }
      if (newStatus === 'job_in_progress') updates.actual_start = new Date().toISOString()
      if (newStatus === 'job_complete') updates.actual_end = new Date().toISOString()

      await (supabase as any).from('works').update(updates).eq('id', workId)
      await logActivity(`Status changed to "${STATUS_LABEL[newStatus]}"`, 'status_changed', { from: work.status, to: newStatus })
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function handlePrimaryAction() {
    const action = PRIMARY_ACTION[work?.status]
    if (!action) return
    if (action.next) { await changeStatus(action.next); return }
    if (action.action === 'payment') { setShowPayment(true); return }
    if (action.action === 'convert_to_job') { await convertToJob(); return }
    if (action.action === 'create_invoice') { setShowInvoicePrompt(true); return }
  }

  async function convertToJob() {
    setSaving(true); setError('')
    try {
      await (supabase as any).from('works').update({
        status: 'job_scheduled',
        updated_at: new Date().toISOString(),
      }).eq('id', workId)
      await logActivity('Quote converted to job', 'status_changed', { from: work.status, to: 'job_scheduled' })
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function createInvoice(importLines: boolean) {
    setSaving(true); setError(''); setShowInvoicePrompt(false)
    try {
      const due = new Date(); due.setDate(due.getDate() + 30)
      const updates: any = {
        status: 'invoice_sent',
        invoice_date: new Date().toISOString().split('T')[0],
        invoice_due_date: due.toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      }

      if (!importLines) {
        // Clear line items and totals for a blank invoice
        updates.subtotal_net = 0
        updates.total_vat = 0
        updates.total_gross = 0
        updates.amount_due = 0
        await (supabase as any).from('line_items').delete().eq('work_id', workId)
      }

      await (supabase as any).from('works').update(updates).eq('id', workId)
      await logActivity('Invoice created from completed job', 'status_changed', { from: work.status, to: 'invoice_sent' })
      await load()

      if (!importLines) {
        // Go straight to edit so they can add invoice lines
        router.push(`/works/${workId}/edit`)
      }
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function logPayment() {
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    try {
      await (supabase as any).from('payments').insert({
        work_id: workId, account_id: accountId,
        amount, method: paymentMethod, reference: paymentRef || null, created_by: userId,
      })
      const newPaid = (work.amount_paid || 0) + amount
      const newDue = Math.max(0, (work.total_gross || 0) - newPaid)
      const newStatus = newDue <= 0.01 ? 'invoice_paid' : 'invoice_partially_paid'
      await (supabase as any).from('works').update({
        amount_paid: newPaid, amount_due: newDue, status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', workId)
      await logActivity(`Payment of ${formatCurrency(amount)} received`, 'payment_received', { amount, method: paymentMethod })
      setShowPayment(false); setPaymentRef('')
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function applyVatOverride(rate: VatRate) {
    if (!lineItems.length) return
    setSaving(true)
    try {
      for (const item of lineItems) {
        const net = item.quantity * item.unit_price
        const vatPct = VAT_RATE_PCT[rate] / 100
        await (supabase as any).from('line_items').update({
          vat_rate: rate,
          line_vat: net * vatPct,
          line_gross: net * (1 + vatPct),
        }).eq('id', item.id)
      }
      // Recalculate work totals
      const subtotalNet = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const totalVat = lineItems.reduce((s, i) => s + (i.quantity * i.unit_price * (VAT_RATE_PCT[rate] / 100)), 0)
      const totalGross = subtotalNet + totalVat
      await (supabase as any).from('works').update({
        subtotal_net: subtotalNet, total_vat: totalVat,
        total_gross: totalGross, amount_due: totalGross - (work.amount_paid || 0),
        updated_at: new Date().toISOString(),
      }).eq('id', workId)
      setVatOverride('')
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function logActivity(summary: string, event: string, metadata?: any) {
    try {
      await (supabase as any).from('activity_log').insert({
        account_id: accountId, entity_type: 'work', entity_id: workId,
        event, summary, user_id: userId, metadata,
      })
    } catch { /* silent */ }
  }

  function customerName() {
    if (!customer) return '—'
    if (customer.is_company && customer.company_name) return customer.company_name
    return `${customer.first_name} ${customer.last_name}`
  }

  function lineGross(item: any): number {
    const net = item.quantity * item.unit_price
    return net * (1 + (VAT_RATE_PCT[item.vat_rate as VatRate] || 0) / 100)
  }

  function getStageIndex(status: string): number {
    return STAGES.findIndex(s => s.statuses.includes(status))
  }

  const primaryAction = work ? PRIMARY_ACTION[work.status] : null
  const manualTransitions = work ? (MANUAL_TRANSITIONS[work.status] || []).filter(s => s !== primaryAction?.next) : []
  const currentStageIndex = work ? getStageIndex(work.status) : -1
  const type = work ? (isQuote(work.status as WorkStatus) ? 'Quote' : isJob(work.status as WorkStatus) ? 'Job' : isInvoice(work.status as WorkStatus) ? 'Invoice' : 'Work') : ''

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950">

      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <a href="/works" className="text-gray-600 hover:text-gray-400 text-sm">← Work</a>
        <span className="text-gray-800">/</span>
        <span className="text-xs font-mono text-gray-500">{work.reference || '—'}</span>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-medium text-gray-300 truncate">{customerName()}</span>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}

          {/* Status badge + manual override */}
          <div className="relative">
            <button onClick={() => setShowStatusMenu(p => !p)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 ${STATUS_COLOUR[work.status] || 'text-gray-400 bg-gray-800'}`}>
              {STATUS_LABEL[work.status] || work.status}
              {manualTransitions.length > 0 && <span className="opacity-60 text-xs">▾</span>}
            </button>
            {showStatusMenu && manualTransitions.length > 0 && (
              <div className="absolute right-0 top-9 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 py-1 min-w-48">
                <div className="text-xs text-gray-600 px-3 py-2 font-medium border-b border-gray-700 mb-1">Override status</div>
                {manualTransitions.map(s => (
                  <button key={s} onClick={() => changeStatus(s)} disabled={saving}
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Primary action */}
          {primaryAction && (
            <button onClick={handlePrimaryAction} disabled={saving}
              className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors flex-shrink-0 ${primaryAction.colour} ${saving ? 'opacity-50' : ''}`}>
              {saving ? 'Saving…' : primaryAction.label}
            </button>
          )}

          <a href={`/works/${workId}/edit`}
            className="text-xs text-gray-500 border border-gray-700 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0">
            Edit
          </a>
        </div>
      </div>

      {/* Workflow progress bar */}
      <div className="bg-gray-900/50 border-b border-gray-800 px-6 py-3">
        <div className="flex items-center gap-0 max-w-lg">
          {STAGES.map((stage, i) => {
            const isPast = i < currentStageIndex
            const isCurrent = i === currentStageIndex
            const isFuture = i > currentStageIndex
            return (
              <div key={stage.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    isPast ? 'bg-amber-500 border-amber-500 text-gray-950' :
                    isCurrent ? 'bg-gray-900 border-amber-500 text-amber-400' :
                    'bg-gray-900 border-gray-700 text-gray-600'
                  }`}>
                    {isPast ? '✓' : i + 1}
                  </div>
                  <div className={`text-xs mt-1 font-medium ${isCurrent ? 'text-amber-400' : isPast ? 'text-gray-400' : 'text-gray-700'}`}>
                    {stage.label}
                  </div>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-4 rounded-full ${isPast ? 'bg-amber-500' : 'bg-gray-800'}`}/>
                )}
              </div>
            )
          })}
        </div>
        {/* Current status detail */}
        <div className="text-xs text-gray-600 mt-1">
          Current: <span className="text-gray-400">{STATUS_LABEL[work.status]}</span>
          {primaryAction && <span className="text-gray-600"> · Next step: <span className="text-amber-500">{primaryAction.label}</span></span>}
        </div>
      </div>

      <div className="px-6 py-5 max-w-screen-xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* LEFT: Main content */}
          <div className="xl:col-span-2 space-y-4">

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
              {(['overview','items','payments','activity'] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`text-xs px-4 py-2 rounded-lg font-medium transition-colors capitalize ${tab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  {t === 'items' ? `Items (${lineItems.length})` : t === 'payments' && payments.length > 0 ? `Payments (${payments.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* OVERVIEW TAB */}
            {tab === 'overview' && (
              <div className="space-y-4">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Details</div>
                    <a href={`/customers/${customer?.id}`} className="text-xs text-amber-400 hover:text-amber-300">View customer →</a>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><div className="text-xs text-gray-600 mb-0.5">Customer</div><div className="text-gray-200 font-medium">{customerName()}</div>{customer?.email && <div className="text-xs text-gray-500">{customer.email}</div>}{customer?.phone && <div className="text-xs text-gray-500">{customer.phone}</div>}</div>
                    <div><div className="text-xs text-gray-600 mb-0.5">Site</div>{site ? <><div className="text-gray-200">{site.name}</div><div className="text-xs text-gray-500">{site.address_line1}{site.postcode ? `, ${site.postcode}` : ''}</div></> : <div className="text-gray-400">{work.site_address_line1 || customer?.address_line1 || '—'}</div>}</div>
                    <div><div className="text-xs text-gray-600 mb-0.5">Trade</div><div className="text-gray-200 capitalize">{work.trade_type}</div></div>
                    <div><div className="text-xs text-gray-600 mb-0.5">Reference</div><div className="text-gray-200 font-mono text-sm">{work.reference || '—'}</div></div>
                    {work.quote_date && <div><div className="text-xs text-gray-600 mb-0.5">Quote date</div><div className="text-gray-200">{formatDate(work.quote_date)}</div></div>}
                    {work.scheduled_start && <div><div className="text-xs text-gray-600 mb-0.5">Scheduled</div><div className="text-gray-200">{new Date(work.scheduled_start).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</div></div>}
                    {work.invoice_date && <div><div className="text-xs text-gray-600 mb-0.5">Invoice date</div><div className="text-gray-200">{formatDate(work.invoice_date)}</div></div>}
                    {work.invoice_due_date && <div><div className="text-xs text-gray-600 mb-0.5">Due date</div><div className={work.status === 'invoice_overdue' ? 'text-red-400 font-semibold' : 'text-gray-200'}>{formatDate(work.invoice_due_date)}</div></div>}
                  </div>
                  {work.customer_notes && <div className="mt-4 pt-4 border-t border-gray-800"><div className="text-xs text-gray-600 mb-1">Notes for customer</div><div className="text-sm text-gray-300 whitespace-pre-wrap">{work.customer_notes}</div></div>}
                  {work.internal_notes && <div className="mt-3"><div className="text-xs text-gray-600 mb-1">Internal notes</div><div className="text-sm text-gray-500 bg-gray-800 rounded-lg p-3 whitespace-pre-wrap">{work.internal_notes}</div></div>}
                </div>

                {/* Line items preview */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Line items</div>
                    <a href={`/works/${workId}/edit`} className="text-xs text-amber-400 hover:text-amber-300">Edit →</a>
                  </div>
                  <table className="w-full">
                    <tbody className="divide-y divide-gray-800/50">
                      {lineItems.map(item => (
                        <tr key={item.id} className="hover:bg-gray-800/20">
                          <td className="px-5 py-2.5"><div className="text-sm text-gray-200">{item.name}</div>{item.description && <div className="text-xs text-gray-600">{item.description}</div>}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap">{item.quantity} {item.unit} × {formatCurrency(item.unit_price)}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-gray-600">{VAT_RATE_PCT[item.vat_rate as VatRate]}% VAT</td>
                          <td className="px-5 py-2.5 text-right text-sm font-medium text-gray-200">{formatCurrency(lineGross(item))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lineItems.length === 0 && <div className="py-8 text-center text-sm text-gray-700">No line items yet — <a href={`/works/${workId}/edit`} className="text-amber-400 hover:text-amber-300">add some</a></div>}
                </div>
              </div>
            )}

            {/* ITEMS TAB */}
            {tab === 'items' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">Line items</div>
                  <a href={`/works/${workId}/edit`} className="text-xs text-amber-400 hover:text-amber-300">Edit items →</a>
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
                        <td className="px-5 py-3"><div className="text-sm text-gray-200">{item.name}</div>{item.description && <div className="text-xs text-gray-600">{item.description}</div>}{item.is_material && <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full mt-0.5 inline-block">Material</span>}</td>
                        <td className="px-3 py-3 text-right text-sm text-gray-400">{item.quantity} {item.unit}</td>
                        <td className="px-3 py-3 text-right text-sm text-gray-400">{formatCurrency(item.unit_price)}</td>
                        <td className="px-3 py-3 text-right text-xs text-gray-500">{VAT_RATE_PCT[item.vat_rate as VatRate]}%</td>
                        <td className="px-5 py-3 text-right text-sm font-medium text-gray-200">{formatCurrency(lineGross(item))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-700">
                    <tr><td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500">Subtotal</td><td className="px-5 py-2 text-right text-sm text-gray-300">{formatCurrency(work.subtotal_net || 0)}</td></tr>
                    <tr><td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500">VAT</td><td className="px-5 py-2 text-right text-sm text-gray-300">{formatCurrency(work.total_vat || 0)}</td></tr>
                    <tr className="bg-gray-800/30"><td colSpan={4} className="px-5 py-3 text-right text-sm font-semibold text-white">Total</td><td className="px-5 py-3 text-right text-base font-bold text-amber-400">{formatCurrency(work.total_gross || 0)}</td></tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* PAYMENTS TAB */}
            {tab === 'payments' && (
              <div className="space-y-3">
                {payments.length === 0 ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl py-14 text-center">
                    <div className="text-3xl mb-3 opacity-20">💰</div>
                    <div className="text-sm text-gray-600">No payments yet</div>
                    {isInvoice(work.status as WorkStatus) && <button onClick={() => setShowPayment(true)} className="mt-4 text-xs bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl hover:bg-emerald-500">Log payment →</button>}
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full">
                      <thead><tr className="border-b border-gray-800">
                        <th className="text-left text-xs font-medium text-gray-600 px-5 py-3">Date</th>
                        <th className="text-left text-xs font-medium text-gray-600 px-3 py-3">Method</th>
                        <th className="text-left text-xs font-medium text-gray-600 px-3 py-3">Reference</th>
                        <th className="text-right text-xs font-medium text-gray-600 px-5 py-3">Amount</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {payments.map(p => (
                          <tr key={p.id}>
                            <td className="px-5 py-3 text-sm text-gray-300">{formatDate(p.paid_at)}</td>
                            <td className="px-3 py-3 text-sm text-gray-400 capitalize">{(p.method || '').replace('_', ' ')}</td>
                            <td className="px-3 py-3 text-sm text-gray-500">{p.reference || '—'}</td>
                            <td className="px-5 py-3 text-right text-sm font-semibold text-emerald-400">{formatCurrency(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ACTIVITY TAB */}
            {tab === 'activity' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl divide-y divide-gray-800/50">
                {activity.length === 0 ? <div className="py-12 text-center text-sm text-gray-600">No activity yet</div>
                : activity.map((a, i) => (
                  <div key={a.id} className="flex gap-4 px-5 py-4">
                    <div className="flex flex-col items-center flex-shrink-0 mt-1">
                      <div className={`w-2 h-2 rounded-full ${a.event === 'payment_received' ? 'bg-emerald-400' : a.event === 'created' ? 'bg-purple-400' : 'bg-amber-400'}`}/>
                      {i < activity.length - 1 && <div className="w-px flex-1 bg-gray-800 mt-2 min-h-4"/>}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm text-gray-300">{a.summary}</div>
                        <div className="text-xs text-gray-700 flex-shrink-0">{new Date(a.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })} · {new Date(a.created_at).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Actions sidebar */}
          <div className="space-y-4">

            {/* Financial summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">{type} total</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="text-gray-200">{formatCurrency(work.subtotal_net || 0)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span className="text-gray-200">{formatCurrency(work.total_vat || 0)}</span></div>
                <div className="border-t border-gray-800 pt-2 flex justify-between">
                  <span className="text-sm font-semibold text-white">Total</span>
                  <span className="text-xl font-bold text-amber-400">{formatCurrency(work.total_gross || 0)}</span>
                </div>
                {(work.amount_paid || 0) > 0 && <>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Paid</span><span className="text-emerald-400">−{formatCurrency(work.amount_paid)}</span></div>
                  <div className="flex justify-between text-sm font-semibold"><span className="text-gray-400">Balance due</span><span className={work.amount_due > 0.01 ? 'text-red-400' : 'text-emerald-400'}>{formatCurrency(work.amount_due || 0)}</span></div>
                </>}
              </div>
              {(work.total_cost || 0) > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-1.5">
                  <div className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-2">Margin</div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Cost</span><span className="text-gray-400">{formatCurrency(work.total_cost)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Profit</span><span className="text-emerald-400">{formatCurrency((work.subtotal_net||0) - (work.total_cost||0))}</span></div>
                  <div className="flex justify-between text-sm font-semibold"><span className="text-gray-400">Margin</span><span className={`${(work.margin_pct||0) < 20 ? 'text-red-400' : (work.margin_pct||0) < 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{(work.margin_pct||0).toFixed(1)}%</span></div>
                </div>
              )}
            </div>

            {/* VAT override */}
            {lineItems.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">VAT override</div>
                <div className="text-xs text-gray-500 mb-3">Apply a single VAT rate to all line items at once</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['standard', 'reduced', 'zero', 'exempt'] as VatRate[]).map(rate => {
                    const pct = VAT_RATE_PCT[rate]
                    const label = rate === 'exempt' ? 'Exempt' : rate === 'zero' ? '0%' : rate === 'reduced' ? '5%' : '20%'
                    return (
                      <button key={rate} onClick={() => setVatOverride(rate)}
                        className={`py-2 rounded-xl border text-xs font-medium transition-colors ${vatOverride === rate ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'}`}>
                        {label}
                      </button>
                    )
                  })}
                </div>
                {vatOverride && (
                  <button onClick={() => applyVatOverride(vatOverride as VatRate)} disabled={saving}
                    className="mt-3 w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 text-xs font-bold py-2.5 rounded-xl transition-colors">
                    {saving ? 'Applying…' : `Apply ${vatOverride === 'standard' ? '20%' : vatOverride === 'reduced' ? '5%' : vatOverride === 'zero' ? '0%' : 'Exempt'} to all items`}
                  </button>
                )}
              </div>
            )}

            {/* Payment form */}
            {showPayment && (
              <div className="bg-gray-900 border border-emerald-500/20 rounded-2xl p-5 space-y-3">
                <div className="text-sm font-semibold text-white">Log payment</div>
                <div><label className="text-xs text-gray-500 mb-1 block">Amount (£)</label><input type="number" step="0.01" min="0" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className={inp}/></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Method</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inp}>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Reference (optional)</label><input type="text" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="Transaction ID, cheque no…" className={inp}/></div>
                <div className="flex gap-2 pt-1">
                  <button onClick={logPayment} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white text-sm font-bold py-2.5 rounded-xl">{saving ? 'Saving…' : 'Log payment'}</button>
                  <button onClick={() => setShowPayment(false)} className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl">Cancel</button>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Actions</div>
              <div className="space-y-2">
                <a href={`/works/${workId}/edit`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>✏️</span> Edit {type.toLowerCase()}</a>
                <a href={`/works/new?duplicate=${workId}`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>📋</span> Duplicate</a>
                <a href={`/customers/${customer?.id}`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>👤</span> View customer</a>
                <a href={`/api/pdf/${workId}`} target="_blank" className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>📄</span> Download PDF</a>
                {work.status !== 'cancelled' && work.status !== 'invoice_paid' && (
                  <button onClick={() => changeStatus('cancelled')} disabled={saving}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-red-900/30 text-sm text-gray-500 hover:text-red-400 transition-colors text-left">
                    <span>✕</span> Cancel {type.toLowerCase()}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice prompt modal */}
      {showInvoicePrompt && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowInvoicePrompt(false) }}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <div className="text-base font-bold text-white mb-2">Create invoice</div>
            <div className="text-sm text-gray-400 mb-6">This job has {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''} totalling {formatCurrency(work.total_gross || 0)}. Do you want to import them into the invoice?</div>
            <div className="space-y-3">
              <button onClick={() => createInvoice(true)} disabled={saving}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold py-3 rounded-xl transition-colors text-sm">
                {saving ? 'Creating…' : `✓ Import ${lineItems.length} line item${lineItems.length !== 1 ? 's' : ''} into invoice`}
              </button>
              <button onClick={() => createInvoice(false)} disabled={saving}
                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-3 rounded-xl transition-colors text-sm">
                Start with a blank invoice
              </button>
              <button onClick={() => setShowInvoicePrompt(false)} className="w-full text-gray-600 hover:text-gray-400 py-2 text-sm transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close status menu */}
      {showStatusMenu && <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)}/>}
    </div>
  )
}