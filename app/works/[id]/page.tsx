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

// Valid next statuses for each current status
const NEXT_STATUSES: Record<string, string[]> = {
  draft: ['quote_sent', 'job_scheduled', 'cancelled'],
  quote_sent: ['quote_viewed', 'quote_accepted', 'quote_declined', 'cancelled'],
  quote_viewed: ['quote_accepted', 'quote_declined', 'quote_sent'],
  quote_accepted: ['job_scheduled', 'invoice_sent'],
  quote_declined: ['draft', 'archived'],
  job_scheduled: ['job_in_progress', 'cancelled'],
  job_in_progress: ['job_complete', 'cancelled'],
  job_complete: ['invoice_sent'],
  invoice_sent: ['invoice_viewed', 'invoice_paid', 'invoice_overdue', 'invoice_partially_paid'],
  invoice_viewed: ['invoice_paid', 'invoice_overdue', 'invoice_partially_paid'],
  invoice_partially_paid: ['invoice_paid', 'invoice_overdue'],
  invoice_paid: ['archived'],
  invoice_overdue: ['invoice_paid', 'invoice_partially_paid', 'cancelled'],
}

type Tab = 'details' | 'items' | 'payments' | 'activity'

export default function WorkDetailPage() {
  const params = useParams()
  const router = useRouter()
  const workId = params.id as string

  const [work, setWork] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [lineItems, setLineItems] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('details')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')

  // Payment form
  const [showPayment, setShowPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [paymentRef, setPaymentRef] = useState('')

  // Status change
  const [showStatusMenu, setShowStatusMenu] = useState(false)

  useEffect(() => { load() }, [workId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)

    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)

    const [{ data: w }, { data: items }, { data: pays }, { data: acts }] = await Promise.all([
      (supabase as any).from('works').select('*, customers(*)').eq('id', workId).single(),
      (supabase as any).from('line_items').select('*').eq('work_id', workId).order('sort_order'),
      (supabase as any).from('payments').select('*').eq('work_id', workId).order('paid_at', { ascending: false }),
      (supabase as any).from('activity_log').select('*').eq('entity_id', workId).order('created_at', { ascending: false }),
    ])

    if (!w) { router.push('/works'); return }
    setWork(w)
    setCustomer(w.customers)
    setLineItems(items || [])
    setPayments(pays || [])
    setActivity(acts || [])
    setLoading(false)
  }

  async function changeStatus(newStatus: string) {
    setSaving(true); setError('')
    setShowStatusMenu(false)
    try {
      const updates: any = { status: newStatus, updated_at: new Date().toISOString() }
      if (newStatus === 'invoice_sent') updates.invoice_date = new Date().toISOString().split('T')[0]
      if (newStatus === 'quote_sent') updates.quote_date = new Date().toISOString().split('T')[0]

      await (supabase as any).from('works').update(updates).eq('id', workId)

      await (supabase as any).from('activity_log').insert({
        account_id: accountId,
        entity_type: 'work',
        entity_id: workId,
        event: 'status_changed',
        summary: `Status changed to ${STATUS_LABEL[newStatus]}`,
        user_id: userId,
        metadata: { from: work.status, to: newStatus },
      })

      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function logPayment() {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) return
    setSaving(true)
    try {
      const amount = parseFloat(paymentAmount)
      await (supabase as any).from('payments').insert({
        work_id: workId,
        account_id: accountId,
        amount,
        method: paymentMethod,
        reference: paymentRef || null,
        created_by: userId,
      })

      // Update work totals
      const newPaid = (work.amount_paid || 0) + amount
      const newDue = (work.total_gross || 0) - newPaid
      const newStatus = newDue <= 0 ? 'invoice_paid' : 'invoice_partially_paid'

      await (supabase as any).from('works').update({
        amount_paid: newPaid,
        amount_due: Math.max(0, newDue),
        status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', workId)

      await (supabase as any).from('activity_log').insert({
        account_id: accountId,
        entity_type: 'work',
        entity_id: workId,
        event: 'payment_received',
        summary: `Payment of ${formatCurrency(amount)} received via ${paymentMethod.replace('_', ' ')}`,
        user_id: userId,
        metadata: { amount, method: paymentMethod, reference: paymentRef },
      })

      setShowPayment(false)
      setPaymentAmount('')
      setPaymentRef('')
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  function lineGross(item: any): number {
    const net = item.quantity * item.unit_price
    return net * (1 + (VAT_RATE_PCT[item.vat_rate as VatRate] || 20) / 100)
  }

  function customerName() {
    if (!customer) return '—'
    if (customer.is_company && customer.company_name) return customer.company_name
    return `${customer.first_name} ${customer.last_name}`
  }

  const nextStatuses = NEXT_STATUSES[work?.status] || []
  const type = work ? (isQuote(work.status) ? 'Quote' : isJob(work.status) ? 'Job' : isInvoice(work.status) ? 'Invoice' : 'Work') : ''

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-sm text-gray-600">Loading…</div>
    </div>
  )

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"

  return (
    <div className="min-h-screen bg-gray-950">

      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <a href="/works" className="text-gray-600 hover:text-gray-400 text-sm transition-colors">← Work</a>
        <span className="text-gray-800">/</span>
        <span className="text-xs font-mono text-gray-500">{work.reference || '—'}</span>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-medium text-gray-300 truncate">{customerName()}</span>

        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}

          {/* Status badge + change */}
          <div className="relative">
            <button onClick={() => setShowStatusMenu(p => !p)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 ${STATUS_COLOUR[work.status] || 'text-gray-400 bg-gray-800'}`}>
              {STATUS_LABEL[work.status] || work.status}
              {nextStatuses.length > 0 && <span className="opacity-60">▾</span>}
            </button>
            {showStatusMenu && nextStatuses.length > 0 && (
              <div className="absolute right-0 top-9 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 py-1 min-w-44">
                <div className="text-xs text-gray-600 px-3 py-1.5">Change status to</div>
                {nextStatuses.map(s => (
                  <button key={s} onClick={() => changeStatus(s)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                    {STATUS_LABEL[s] || s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Primary action based on status */}
          {work.status === 'draft' && (
            <button onClick={() => changeStatus('quote_sent')}
              className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
              Send quote →
            </button>
          )}
          {work.status === 'job_complete' && (
            <button onClick={() => changeStatus('invoice_sent')}
              className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
              Create invoice →
            </button>
          )}
          {(work.status === 'invoice_sent' || work.status === 'invoice_viewed' || work.status === 'invoice_overdue' || work.status === 'invoice_partially_paid') && (
            <button onClick={() => setShowPayment(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
              Log payment →
            </button>
          )}
          {work.status === 'quote_accepted' && (
            <button onClick={() => changeStatus('job_scheduled')}
              className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
              Schedule job →
            </button>
          )}

          <a href={`/works/${workId}/edit`}
            className="text-xs text-gray-500 border border-gray-700 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            Edit
          </a>
        </div>
      </div>

      <div className="px-6 py-5 max-w-screen-xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* LEFT: Main content */}
          <div className="xl:col-span-2 space-y-4">

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
              {(['details', 'items', 'payments', 'activity'] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`text-xs px-4 py-2 rounded-lg capitalize font-medium transition-colors ${
                    tab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}>
                  {t}
                  {t === 'payments' && payments.length > 0 && (
                    <span className="ml-1.5 text-amber-400">{payments.length}</span>
                  )}
                  {t === 'activity' && activity.length > 0 && (
                    <span className="ml-1.5 text-gray-600">{activity.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Details tab */}
            {tab === 'details' && (
              <div className="space-y-4">
                {/* Customer */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Customer</div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">{customerName()}</div>
                      {customer?.email && <div className="text-sm text-gray-400 mt-0.5">{customer.email}</div>}
                      {customer?.phone && <div className="text-sm text-gray-400">{customer.phone}</div>}
                      {customer?.address_line1 && (
                        <div className="text-sm text-gray-500 mt-1">
                          {customer.address_line1}{customer.postcode ? `, ${customer.postcode}` : ''}
                        </div>
                      )}
                    </div>
                    <a href={`/customers/${customer?.id}`}
                      className="text-xs text-amber-400 hover:text-amber-300">
                      View customer →
                    </a>
                  </div>
                </div>

                {/* Job details */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Job details</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600 text-xs mb-0.5">Type</div>
                      <div className="text-gray-200 capitalize">{work.trade_type}</div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-xs mb-0.5">Site</div>
                      <div className="text-gray-200">{work.site_address_line1 || customer?.address_line1 || '—'}</div>
                    </div>
                    {work.scheduled_start && (
                      <div>
                        <div className="text-gray-600 text-xs mb-0.5">Scheduled start</div>
                        <div className="text-gray-200">{new Date(work.scheduled_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    )}
                    {work.scheduled_end && (
                      <div>
                        <div className="text-gray-600 text-xs mb-0.5">Scheduled end</div>
                        <div className="text-gray-200">{new Date(work.scheduled_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    )}
                    {work.quote_date && (
                      <div>
                        <div className="text-gray-600 text-xs mb-0.5">Quote date</div>
                        <div className="text-gray-200">{formatDate(work.quote_date)}</div>
                      </div>
                    )}
                    {work.invoice_date && (
                      <div>
                        <div className="text-gray-600 text-xs mb-0.5">Invoice date</div>
                        <div className="text-gray-200">{formatDate(work.invoice_date)}</div>
                      </div>
                    )}
                    {work.invoice_due_date && (
                      <div>
                        <div className="text-gray-600 text-xs mb-0.5">Due date</div>
                        <div className={`font-medium ${work.status === 'invoice_overdue' ? 'text-red-400' : 'text-gray-200'}`}>
                          {formatDate(work.invoice_due_date)}
                        </div>
                      </div>
                    )}
                  </div>
                  {work.customer_notes && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <div className="text-gray-600 text-xs mb-1">Customer notes</div>
                      <div className="text-sm text-gray-300">{work.customer_notes}</div>
                    </div>
                  )}
                  {work.internal_notes && (
                    <div className="mt-3">
                      <div className="text-gray-600 text-xs mb-1">Internal notes</div>
                      <div className="text-sm text-gray-400 bg-gray-800 rounded-lg p-3">{work.internal_notes}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Line items tab */}
            {tab === 'items' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">Line items</div>
                  <a href={`/works/${workId}/edit`} className="text-xs text-amber-400 hover:text-amber-300">Edit →</a>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-xs font-medium text-gray-600 px-5 py-3">Item</th>
                      <th className="text-right text-xs font-medium text-gray-600 px-3 py-3">Qty</th>
                      <th className="text-right text-xs font-medium text-gray-600 px-3 py-3">Unit price</th>
                      <th className="text-right text-xs font-medium text-gray-600 px-3 py-3">VAT</th>
                      <th className="text-right text-xs font-medium text-gray-600 px-5 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {lineItems.map(item => (
                      <tr key={item.id}>
                        <td className="px-5 py-3">
                          <div className="text-sm text-gray-200">{item.name}</div>
                          {item.description && <div className="text-xs text-gray-600 mt-0.5">{item.description}</div>}
                          {item.is_material && <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full mt-1 inline-block">Material</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-sm text-gray-400">{item.quantity} {item.unit}</td>
                        <td className="px-3 py-3 text-right text-sm text-gray-400">{formatCurrency(item.unit_price)}</td>
                        <td className="px-3 py-3 text-right text-xs text-gray-600">{VAT_RATE_PCT[item.vat_rate as VatRate]}%</td>
                        <td className="px-5 py-3 text-right text-sm font-medium text-gray-200">{formatCurrency(lineGross(item))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payments tab */}
            {tab === 'payments' && (
              <div className="space-y-3">
                {payments.length === 0 ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl py-12 text-center">
                    <div className="text-3xl mb-3 opacity-20">💰</div>
                    <div className="text-sm text-gray-600">No payments recorded yet</div>
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left text-xs font-medium text-gray-600 px-5 py-3">Date</th>
                          <th className="text-left text-xs font-medium text-gray-600 px-3 py-3">Method</th>
                          <th className="text-left text-xs font-medium text-gray-600 px-3 py-3">Reference</th>
                          <th className="text-right text-xs font-medium text-gray-600 px-5 py-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {payments.map(p => (
                          <tr key={p.id}>
                            <td className="px-5 py-3 text-sm text-gray-300">{formatDate(p.paid_at)}</td>
                            <td className="px-3 py-3 text-sm text-gray-400 capitalize">{p.method.replace('_', ' ')}</td>
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

            {/* Activity tab */}
            {tab === 'activity' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl divide-y divide-gray-800/50">
                {activity.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="text-sm text-gray-600">No activity yet</div>
                  </div>
                ) : activity.map((a, i) => {
                  const isLast = i === activity.length - 1
                  const eventColour: Record<string, string> = {
                    created: 'bg-purple-900/50 text-purple-300',
                    status_changed: 'bg-amber-900/50 text-amber-300',
                    payment_received: 'bg-emerald-900/50 text-emerald-300',
                    email_sent: 'bg-blue-900/50 text-blue-300',
                    email_opened: 'bg-blue-800/50 text-blue-200',
                    note_added: 'bg-gray-800 text-gray-400',
                  }
                  return (
                    <div key={a.id} className="flex gap-4 px-5 py-4">
                      <div className="flex flex-col items-center flex-shrink-0 mt-1">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          a.event === 'payment_received' ? 'bg-emerald-400' :
                          a.event === 'created' ? 'bg-purple-400' :
                          a.event.includes('email') ? 'bg-blue-400' :
                          'bg-amber-400'
                        }`}/>
                        {!isLast && <div className="w-px flex-1 bg-gray-800 mt-2 min-h-4"/>}
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm text-gray-300">{a.summary}</div>
                          <div className="text-xs text-gray-700 flex-shrink-0">
                            {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            {' · '}
                            {new Date(a.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        {a.user_name && (
                          <div className="text-xs text-gray-600 mt-0.5">by {a.user_name}</div>
                        )}
                        {a.client_device && (
                          <div className="text-xs text-gray-700 mt-0.5">{a.client_device}{a.client_location ? ` · ${a.client_location}` : ''}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* RIGHT: Summary sidebar */}
          <div className="space-y-4">

            {/* Financial summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">{type} summary</div>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-200">{formatCurrency(work.subtotal_net || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">VAT</span>
                  <span className="text-gray-200">{formatCurrency(work.total_vat || 0)}</span>
                </div>
                <div className="border-t border-gray-800 pt-2.5 flex justify-between">
                  <span className="text-sm font-semibold text-white">Total</span>
                  <span className="text-lg font-bold text-amber-400">{formatCurrency(work.total_gross || 0)}</span>
                </div>
                {(work.amount_paid || 0) > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Paid</span>
                      <span className="text-emerald-400">− {formatCurrency(work.amount_paid)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold">
                      <span className="text-gray-400">Balance due</span>
                      <span className={work.amount_due > 0 ? 'text-red-400' : 'text-emerald-400'}>
                        {formatCurrency(work.amount_due || 0)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Margin (if costs exist) */}
              {(work.total_cost || 0) > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-2">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Margin</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Cost</span>
                    <span className="text-gray-400">{formatCurrency(work.total_cost)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Gross profit</span>
                    <span className="text-emerald-400">{formatCurrency(work.gross_margin || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-gray-400">Margin</span>
                    <span className={`${(work.margin_pct || 0) < 20 ? 'text-red-400' : (work.margin_pct || 0) < 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {(work.margin_pct || 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Log payment form */}
            {showPayment && (
              <div className="bg-gray-900 border border-amber-500/20 rounded-2xl p-5">
                <div className="text-sm font-semibold text-white mb-4">Log payment</div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Amount (£)</label>
                    <input type="number" step="0.01" min="0"
                      value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                      placeholder={formatCurrency(work.amount_due || 0).replace('£', '')}
                      className={inp}/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Method</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inp}>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="card">Card</option>
                      <option value="cash">Cash</option>
                      <option value="cheque">Cheque</option>
                      <option value="stripe">Stripe</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Reference (optional)</label>
                    <input type="text" value={paymentRef} onChange={e => setPaymentRef(e.target.value)}
                      placeholder="Transaction ref, cheque number…" className={inp}/>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={logPayment} disabled={saving}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
                      {saving ? 'Saving…' : 'Log payment'}
                    </button>
                    <button onClick={() => setShowPayment(false)}
                      className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Actions</div>
              <div className="space-y-2">
                <a href={`/works/${workId}/edit`}
                  className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors">
                  <span className="text-base">✏️</span> Edit {type.toLowerCase()}
                </a>
                <a href={`/works/new?duplicate=${workId}`}
                  className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors">
                  <span className="text-base">📋</span> Duplicate
                </a>
                {isInvoice(work.status as WorkStatus) && (
                  <a href={`/works/${workId}/pdf`}
                    className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors">
                    <span className="text-base">📄</span> Download PDF
                  </a>
                )}
                {isQuote(work.status as WorkStatus) && (
                  <a href={`/works/${workId}/pdf`}
                    className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors">
                    <span className="text-base">📄</span> Download PDF
                  </a>
                )}
                <button onClick={() => changeStatus('cancelled')}
                  className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-red-900/30 text-sm text-gray-500 hover:text-red-400 transition-colors">
                  <span className="text-base">✕</span> Cancel {type.toLowerCase()}
                </button>
              </div>
            </div>

            {/* Email tracking */}
            {(work.view_count > 0 || work.last_sent_at) && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Email tracking</div>
                <div className="space-y-2 text-sm">
                  {work.last_sent_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last sent</span>
                      <span className="text-gray-300">{formatDate(work.last_sent_at)}</span>
                    </div>
                  )}
                  {work.last_viewed_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last viewed</span>
                      <span className="text-gray-300">{formatDate(work.last_viewed_at)}</span>
                    </div>
                  )}
                  {work.view_count > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">View count</span>
                      <span className="text-amber-400 font-medium">{work.view_count} time{work.view_count !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}