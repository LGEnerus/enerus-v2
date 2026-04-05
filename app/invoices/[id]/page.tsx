'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate, VAT_RATE_PCT, type VatRate } from '@/lib/supabase'

const STATUSES: Record<string, { label: string; colour: string }> = {
  draft:          { label: 'Draft',       colour: 'text-gray-400 bg-gray-800' },
  sent:           { label: 'Sent',        colour: 'text-blue-300 bg-blue-900/50' },
  viewed:         { label: 'Viewed',      colour: 'text-blue-200 bg-blue-800/50' },
  partially_paid: { label: 'Part paid',   colour: 'text-amber-300 bg-amber-900/50' },
  paid:           { label: 'Paid',        colour: 'text-emerald-300 bg-emerald-900/50' },
  overdue:        { label: 'Overdue',     colour: 'text-red-300 bg-red-900/50' },
  cancelled:      { label: 'Cancelled',   colour: 'text-gray-600 bg-gray-800' },
}

const TRANSITIONS: Record<string, string[]> = {
  draft:          ['sent', 'cancelled'],
  sent:           ['draft', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled'],
  viewed:         ['sent', 'partially_paid', 'paid', 'overdue', 'cancelled'],
  partially_paid: ['paid', 'overdue'],
  paid:           ['partially_paid'],
  overdue:        ['sent', 'partially_paid', 'paid', 'cancelled'],
  cancelled:      ['draft'],
}

const INVOICE_TYPE_LABEL: Record<string, string> = {
  deposit: '🔖 Deposit', interim: '📑 Interim', final: '📄 Final',
  standalone: '📋 Standalone', credit_note: '↩ Credit note',
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string

  const [invoice, setInvoice] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [job, setJob] = useState<any>(null)
  const [lineItems, setLineItems] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [paymentRef, setPaymentRef] = useState('')
  const [vatOverride, setVatOverride] = useState<VatRate | ''>('')

  useEffect(() => { load() }, [invoiceId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)
    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)

    const [{ data: inv }, { data: items }, { data: pays }] = await Promise.all([
      (supabase as any).from('invoices').select('*, customers(*), jobs(reference, title)').eq('id', invoiceId).single(),
      (supabase as any).from('line_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
      (supabase as any).from('payments').select('*').eq('invoice_id', invoiceId).order('paid_at', { ascending: false }),
    ])

    if (!inv) { router.push('/customers'); return }
    setInvoice(inv); setCustomer(inv.customers); setJob(inv.jobs)
    setLineItems(items || [])
    setPayments(pays || [])
    setPaymentAmount(((inv.amount_due || 0)).toFixed(2))
    setLoading(false)
  }

  async function changeStatus(newStatus: string) {
    setSaving(true); setError(''); setShowStatusMenu(false)
    try {
      const updates: any = { status: newStatus, updated_at: new Date().toISOString() }
      if (newStatus === 'sent' && !invoice.sent_at) updates.sent_at = new Date().toISOString()
      await (supabase as any).from('invoices').update(updates).eq('id', invoiceId)
      await (supabase as any).from('activity_log').insert({
        account_id: accountId, entity_type: 'invoice', entity_id: invoiceId,
        event: 'status_changed', summary: `Invoice ${STATUSES[newStatus]?.label}`,
        user_id: userId,
      })
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function logPayment() {
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    try {
      await (supabase as any).from('payments').insert({
        invoice_id: invoiceId, account_id: accountId,
        amount, method: paymentMethod, reference: paymentRef || null, created_by: userId,
      })
      const newPaid = (invoice.amount_paid || 0) + amount
      const newDue = Math.max(0, (invoice.total_gross || 0) - newPaid)
      const newStatus = newDue <= 0.01 ? 'paid' : 'partially_paid'
      await (supabase as any).from('invoices').update({
        amount_paid: newPaid, amount_due: newDue, status: newStatus,
        paid_at: newDue <= 0.01 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', invoiceId)

      // Update job totals if linked
      if (invoice.job_id) {
        const { data: jobInvs } = await (supabase as any).from('invoices').select('total_gross, amount_paid').eq('job_id', invoice.job_id)
        const totalInvoiced = (jobInvs || []).reduce((s: number, i: any) => s + (i.total_gross || 0), 0)
        const totalPaid = (jobInvs || []).reduce((s: number, i: any) => s + (i.amount_paid || 0), 0) + amount
        await (supabase as any).from('jobs').update({ total_invoiced: totalInvoiced, total_paid: totalPaid, total_outstanding: totalInvoiced - totalPaid }).eq('id', invoice.job_id)
      }

      await (supabase as any).from('activity_log').insert({
        account_id: accountId, entity_type: 'invoice', entity_id: invoiceId,
        event: 'payment_received', summary: `Payment of ${formatCurrency(amount)} received`,
        user_id: userId,
      })
      setShowPayment(false); setPaymentRef('')
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
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
      await (supabase as any).from('invoices').update({ subtotal_net: subtotalNet, total_vat: totalVat, total_gross: totalGross, amount_due: totalGross - (invoice.amount_paid || 0), updated_at: new Date().toISOString() }).eq('id', invoiceId)
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

  const currentStatus = STATUSES[invoice?.status]
  const transitions = TRANSITIONS[invoice?.status] || []
  const isPaid = invoice?.status === 'paid'
  const canPay = ['sent','viewed','partially_paid','overdue'].includes(invoice?.status)

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors"

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <a href={`/customers/${invoice.customer_id}`} className="text-gray-600 hover:text-gray-400 text-sm">← {customerName()}</a>
        <span className="text-gray-800">/</span>
        <span className="text-xs font-mono text-gray-500">{invoice.reference}</span>
        {invoice.invoice_type && <span className="text-xs text-gray-600">{INVOICE_TYPE_LABEL[invoice.invoice_type]}</span>}
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}

          <div className="relative">
            <button onClick={() => setShowStatusMenu(p => !p)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 ${currentStatus?.colour || 'text-gray-400 bg-gray-800'}`}>
              {currentStatus?.label || invoice.status}
              {transitions.length > 0 && <span className="opacity-60">▾</span>}
            </button>
            {showStatusMenu && transitions.length > 0 && (
              <div className="absolute right-0 top-9 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 py-1 min-w-48">
                <div className="text-xs text-gray-600 px-3 py-2 font-medium border-b border-gray-700">Change status</div>
                {transitions.map(s => (
                  <button key={s} onClick={() => changeStatus(s)} disabled={saving}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${STATUSES[s]?.colour.split(' ')[0].replace('text-', 'bg-')}`}/>
                    {STATUSES[s]?.label || s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {canPay && (
            <button onClick={() => setShowPayment(true)}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg transition-colors">
              Log payment →
            </button>
          )}

          {invoice.status === 'draft' && (
            <button onClick={() => changeStatus('sent')} disabled={saving}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-lg transition-colors">
              {saving ? 'Saving…' : 'Send invoice →'}
            </button>
          )}

          {!isPaid && <a href={`/invoices/${invoiceId}/edit`} className="text-xs text-gray-500 border border-gray-700 px-3 py-2 rounded-lg hover:bg-gray-800">Edit</a>}
        </div>
      </div>

      {isPaid && (
        <div className="bg-emerald-500/8 border-b border-emerald-500/20 px-6 py-3 flex items-center gap-3">
          <span className="text-emerald-400 text-sm font-medium">✓ Invoice paid in full</span>
          <span className="text-emerald-600 text-xs">{invoice.paid_at ? `· ${formatDate(invoice.paid_at)}` : ''}</span>
        </div>
      )}
      {invoice.status === 'overdue' && (
        <div className="bg-red-500/8 border-b border-red-500/20 px-6 py-3 flex items-center gap-3">
          <span className="text-red-400 text-sm font-medium">⚠ Payment overdue</span>
          {invoice.due_date && <span className="text-red-600 text-xs">· Was due {formatDate(invoice.due_date)}</span>}
        </div>
      )}

      <div className="px-6 py-5 max-w-screen-xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">

            {/* Invoice details */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-base font-bold text-white">{invoice.title || invoice.reference}</h1>
                  <div className="text-xs font-mono text-gray-600 mt-0.5">{invoice.reference} · {INVOICE_TYPE_LABEL[invoice.invoice_type]}</div>
                </div>
                {!isPaid && <a href={`/invoices/${invoiceId}/edit`} className="text-xs text-amber-400 hover:text-amber-300">Edit →</a>}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><div className="text-xs text-gray-600 mb-1">Customer</div><a href={`/customers/${invoice.customer_id}`} className="text-amber-400 hover:text-amber-300">{customerName()}</a>{customer?.email && <div className="text-xs text-gray-500">{customer.email}</div>}</div>
                {job && <div><div className="text-xs text-gray-600 mb-1">Job</div><a href={`/jobs/${invoice.job_id}`} className="text-blue-400 hover:text-blue-300">{job.title || job.reference}</a></div>}
                <div><div className="text-xs text-gray-600 mb-1">Invoice date</div><div className="text-gray-200">{formatDate(invoice.invoice_date || invoice.created_at)}</div></div>
                {invoice.due_date && <div><div className="text-xs text-gray-600 mb-1">Due date</div><div className={invoice.status === 'overdue' ? 'text-red-400 font-semibold' : 'text-gray-200'}>{formatDate(invoice.due_date)}</div></div>}
              </div>
              {invoice.customer_notes && <div className="mt-4 pt-4 border-t border-gray-800"><div className="text-xs text-gray-600 mb-1">Notes</div><div className="text-sm text-gray-300">{invoice.customer_notes}</div></div>}
            </div>

            {/* Line items */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Line items</div>
                {!isPaid && <a href={`/invoices/${invoiceId}/edit`} className="text-xs text-amber-400 hover:text-amber-300">Edit →</a>}
              </div>
              {lineItems.length === 0 ? (
                <div className="py-10 text-center"><div className="text-sm text-gray-600 mb-3">No line items yet</div><a href={`/invoices/${invoiceId}/edit`} className="text-xs text-amber-400 hover:text-amber-300">Add line items →</a></div>
              ) : (
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
                    <tr><td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500">Subtotal</td><td className="px-5 py-2 text-right text-sm text-gray-300">{formatCurrency(invoice.subtotal_net || 0)}</td></tr>
                    <tr><td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500">VAT</td><td className="px-5 py-2 text-right text-sm text-gray-300">{formatCurrency(invoice.total_vat || 0)}</td></tr>
                    <tr className="bg-gray-800/30"><td colSpan={4} className="px-5 py-3 text-right text-sm font-semibold text-white">Total</td><td className="px-5 py-3 text-right text-base font-bold text-amber-400">{formatCurrency(invoice.total_gross || 0)}</td></tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Payment history */}
            {payments.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-800 text-sm font-semibold text-white">Payment history</div>
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

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">Invoice total</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="text-gray-200">{formatCurrency(invoice.subtotal_net || 0)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span className="text-gray-200">{formatCurrency(invoice.total_vat || 0)}</span></div>
                <div className="border-t border-gray-800 pt-2 flex justify-between">
                  <span className="text-sm font-semibold text-white">Total</span>
                  <span className="text-xl font-bold text-amber-400">{formatCurrency(invoice.total_gross || 0)}</span>
                </div>
                {(invoice.amount_paid || 0) > 0 && <>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Paid</span><span className="text-emerald-400">−{formatCurrency(invoice.amount_paid)}</span></div>
                  <div className="flex justify-between text-sm font-semibold"><span className="text-gray-400">Balance due</span><span className={invoice.amount_due > 0.01 ? 'text-red-400' : 'text-emerald-400'}>{formatCurrency(invoice.amount_due || 0)}</span></div>
                </>}
              </div>
            </div>

            {/* VAT override */}
            {lineItems.length > 0 && !isPaid && (
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
                {vatOverride && <button onClick={() => applyVatOverride(vatOverride as VatRate)} disabled={saving} className="mt-3 w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 text-xs font-bold py-2.5 rounded-xl">{saving ? 'Applying…' : 'Apply to all items'}</button>}
              </div>
            )}

            {/* Log payment */}
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
                <div><label className="text-xs text-gray-500 mb-1 block">Reference (optional)</label><input value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="Transaction ID…" className={inp}/></div>
                <div className="flex gap-2">
                  <button onClick={logPayment} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white font-bold py-2.5 rounded-xl text-sm">{saving ? 'Saving…' : 'Log payment'}</button>
                  <button onClick={() => setShowPayment(false)} className="px-4 bg-gray-800 text-gray-400 rounded-xl hover:bg-gray-700 text-sm">Cancel</button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Actions</div>
              <div className="space-y-2">
                {canPay && <button onClick={() => setShowPayment(true)} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-sm text-emerald-300 font-medium transition-colors"><span>💰</span> Log payment</button>}
                {!isPaid && <a href={`/invoices/${invoiceId}/edit`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>✏️</span> Edit invoice</a>}
                <a href={`/api/pdf/invoice/${invoiceId}`} target="_blank" className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>📄</span> Download PDF</a>
                <a href={`/customers/${invoice.customer_id}`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>👤</span> View customer</a>
                {invoice.job_id && <a href={`/jobs/${invoice.job_id}`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>🔧</span> View job</a>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showStatusMenu && <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)}/>}
    </div>
  )
}