'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate } from '@/lib/supabase'

const JOB_STATUSES = [
  { key: 'created',     label: 'Created',     colour: 'text-gray-400 bg-gray-800' },
  { key: 'assigned',    label: 'Assigned',    colour: 'text-purple-300 bg-purple-900/50' },
  { key: 'scheduled',   label: 'Scheduled',   colour: 'text-blue-300 bg-blue-900/50' },
  { key: 'in_progress', label: 'In progress', colour: 'text-amber-300 bg-amber-900/50' },
  { key: 'on_hold',     label: 'On hold',     colour: 'text-orange-300 bg-orange-900/30' },
  { key: 'complete',    label: 'Complete',    colour: 'text-emerald-300 bg-emerald-900/50' },
  { key: 'cancelled',   label: 'Cancelled',   colour: 'text-gray-600 bg-gray-800' },
]

const INVOICE_STATUS: Record<string, { label: string; colour: string }> = {
  draft:          { label: 'Draft',       colour: 'text-gray-400 bg-gray-800' },
  sent:           { label: 'Sent',        colour: 'text-blue-300 bg-blue-900/50' },
  viewed:         { label: 'Viewed',      colour: 'text-blue-200 bg-blue-800/50' },
  partially_paid: { label: 'Part paid',   colour: 'text-amber-300 bg-amber-900/50' },
  paid:           { label: 'Paid',        colour: 'text-emerald-300 bg-emerald-900/50' },
  overdue:        { label: 'Overdue',     colour: 'text-red-300 bg-red-900/50' },
  cancelled:      { label: 'Cancelled',   colour: 'text-gray-600 bg-gray-800' },
}

const INVOICE_TYPE_LABEL: Record<string, string> = {
  deposit: 'Deposit', interim: 'Interim', final: 'Final', standalone: 'Standalone',
}

// All valid transitions — can go forward OR backward
const TRANSITIONS: Record<string, string[]> = {
  created:     ['assigned', 'scheduled', 'in_progress', 'cancelled'],
  assigned:    ['created', 'scheduled', 'in_progress', 'on_hold', 'cancelled'],
  scheduled:   ['assigned', 'created', 'in_progress', 'on_hold', 'cancelled'],
  in_progress: ['scheduled', 'on_hold', 'complete', 'cancelled'],
  on_hold:     ['scheduled', 'in_progress', 'cancelled'],
  complete:    ['in_progress'],
  cancelled:   ['created'],
}

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.id as string

  const [job, setJob] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [site, setSite] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showAddInvoice, setShowAddInvoice] = useState(false)
  const [invoiceType, setInvoiceType] = useState<'deposit'|'interim'|'final'>('final')

  useEffect(() => { load() }, [jobId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)
    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)

    const [{ data: j }, { data: inv }] = await Promise.all([
      (supabase as any).from('jobs').select('*, customers(*), sites(*)').eq('id', jobId).single(),
      (supabase as any).from('invoices').select('*').eq('job_id', jobId).order('created_at'),
    ])

    if (!j) { router.push('/customers'); return }
    setJob(j); setCustomer(j.customers); setSite(j.sites)
    setInvoices(inv || [])
    setLoading(false)
  }

  async function changeStatus(newStatus: string) {
    setSaving(true); setError(''); setShowStatusMenu(false)
    try {
      const updates: any = { status: newStatus, updated_at: new Date().toISOString() }
      if (newStatus === 'in_progress' && !job.actual_start) updates.actual_start = new Date().toISOString()
      if (newStatus === 'complete') updates.actual_end = new Date().toISOString()
      if (newStatus === 'in_progress' && job.status === 'complete') updates.actual_end = null // going back

      await (supabase as any).from('jobs').update(updates).eq('id', jobId)
      await (supabase as any).from('activity_log').insert({
        account_id: accountId, entity_type: 'job', entity_id: jobId,
        event: 'status_changed', summary: `Job status changed to "${JOB_STATUSES.find(s => s.key === newStatus)?.label}"`,
        user_id: userId, metadata: { from: job.status, to: newStatus },
      })
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function createInvoice() {
    setSaving(true); setError(''); setShowAddInvoice(false)
    try {
      // Get reference
      const { data: refData } = await (supabase as any).rpc('generate_invoice_reference', { p_account_id: accountId })

      // Create invoice linked to this job
      const due = new Date(); due.setDate(due.getDate() + 30)
      const { data: inv, error: invErr } = await (supabase as any).from('invoices').insert({
        account_id: accountId,
        customer_id: job.customer_id,
        site_id: job.site_id,
        job_id: jobId,
        reference: refData,
        status: 'draft',
        invoice_type: invoiceType,
        trade_type: job.trade_type,
        title: job.title,
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: due.toISOString().split('T')[0],
        created_by: userId,
      }).select().single()

      if (invErr) throw invErr

      // Navigate to invoice edit page
      router.push(`/invoices/${inv.id}/edit`)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  function customerName() {
    if (!customer) return '—'
    if (customer.is_company && customer.company_name) return customer.company_name
    return `${customer.first_name} ${customer.last_name}`
  }

  const currentStatus = JOB_STATUSES.find(s => s.key === job?.status)
  const availableTransitions = TRANSITIONS[job?.status] || []
  const totalInvoiced = invoices.reduce((s, i) => s + (i.total_gross || 0), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total_gross || 0), 0)

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors"

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <a href={`/customers/${job.customer_id}`} className="text-gray-600 hover:text-gray-400 text-sm">← {customerName()}</a>
        <span className="text-gray-800">/</span>
        <span className="text-xs font-mono text-gray-500">{job.reference || 'Job'}</span>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}

          {/* Status control — full dropdown with all transitions */}
          <div className="relative">
            <button onClick={() => setShowStatusMenu(p => !p)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 ${currentStatus?.colour || 'text-gray-400 bg-gray-800'}`}>
              {currentStatus?.label || job.status}
              <span className="opacity-60">▾</span>
            </button>
            {showStatusMenu && (
              <div className="absolute right-0 top-9 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 py-1 min-w-52">
                <div className="text-xs text-gray-600 px-3 py-2 font-medium border-b border-gray-700">Change status</div>
                {JOB_STATUSES.filter(s => availableTransitions.includes(s.key)).map(s => (
                  <button key={s.key} onClick={() => changeStatus(s.key)} disabled={saving}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.colour.split(' ')[0].replace('text-', 'bg-')}`}/>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setShowAddInvoice(true)}
            className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-4 py-2 rounded-lg transition-colors">
            + Add invoice
          </button>

          <a href={`/jobs/${jobId}/edit`}
            className="text-xs text-gray-500 border border-gray-700 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            Edit
          </a>
        </div>
      </div>

      {/* Status pipeline */}
      <div className="bg-gray-900/50 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {JOB_STATUSES.filter(s => s.key !== 'cancelled').map((s, i, arr) => {
            const isCurrent = job.status === s.key
            const statusOrder = arr.map(x => x.key)
            const currentIdx = statusOrder.indexOf(job.status)
            const thisIdx = statusOrder.indexOf(s.key)
            const isPast = thisIdx < currentIdx && job.status !== 'cancelled'
            return (
              <div key={s.key} className="flex items-center flex-shrink-0">
                <button
                  onClick={() => availableTransitions.includes(s.key) ? changeStatus(s.key) : null}
                  disabled={saving || (!availableTransitions.includes(s.key) && !isCurrent)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isCurrent ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                    isPast ? 'text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer' :
                    availableTransitions.includes(s.key) ? 'text-gray-600 hover:text-gray-300 hover:bg-gray-800 cursor-pointer' :
                    'text-gray-700 cursor-default'
                  }`}>
                  {isPast && <span className="text-emerald-400">✓</span>}
                  {isCurrent && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"/>}
                  {s.label}
                </button>
                {i < arr.length - 2 && <span className="text-gray-800 mx-1">›</span>}
              </div>
            )
          })}
          {/* Cancelled separately */}
          {job.status !== 'cancelled' && (
            <button onClick={() => changeStatus('cancelled')} disabled={saving}
              className="ml-3 pl-3 border-l border-gray-800 text-xs text-gray-700 hover:text-red-400 transition-colors flex-shrink-0">
              Cancel job
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-5 max-w-screen-xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* LEFT: Job details */}
          <div className="xl:col-span-2 space-y-4">

            {/* Job info card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-base font-bold text-white">{job.title || job.reference}</h1>
                  {job.description && <p className="text-sm text-gray-400 mt-1">{job.description}</p>}
                </div>
                <a href={`/jobs/${jobId}/edit`} className="text-xs text-amber-400 hover:text-amber-300 flex-shrink-0">Edit →</a>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Customer</div>
                  <a href={`/customers/${job.customer_id}`} className="text-amber-400 hover:text-amber-300">{customerName()}</a>
                  {customer?.phone && <div className="text-xs text-gray-500 mt-0.5">{customer.phone}</div>}
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Site</div>
                  {site ? (
                    <><div className="text-gray-200">{site.name}</div><div className="text-xs text-gray-500">{site.address_line1}{site.postcode ? `, ${site.postcode}` : ''}</div></>
                  ) : <div className="text-gray-400">{job.site_address_line1 || customer?.address_line1 || '—'}</div>}
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Trade</div>
                  <div className="text-gray-200 capitalize">{job.trade_type || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Reference</div>
                  <div className="text-gray-200 font-mono">{job.reference || '—'}</div>
                </div>
                {job.scheduled_start && (
                  <div className="col-span-2">
                    <div className="text-xs text-gray-600 mb-1">Scheduled</div>
                    <div className="text-gray-200">
                      {new Date(job.scheduled_start).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                      {job.scheduled_end && ` → ${new Date(job.scheduled_end).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}`}
                    </div>
                  </div>
                )}
                {job.quote_id && (
                  <div>
                    <div className="text-xs text-gray-600 mb-1">From quote</div>
                    <a href={`/quotes/${job.quote_id}`} className="text-xs text-blue-400 hover:text-blue-300">View original quote →</a>
                  </div>
                )}
              </div>

              {job.customer_notes && <div className="mt-4 pt-4 border-t border-gray-800"><div className="text-xs text-gray-600 mb-1">Customer notes</div><div className="text-sm text-gray-300">{job.customer_notes}</div></div>}
              {job.internal_notes && <div className="mt-3"><div className="text-xs text-gray-600 mb-1">Internal notes</div><div className="text-sm text-gray-500 bg-gray-800 rounded-lg p-3">{job.internal_notes}</div></div>}
            </div>

            {/* Invoices linked to this job */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Invoices</div>
                <button onClick={() => setShowAddInvoice(true)} className="text-xs text-amber-400 hover:text-amber-300">+ Add invoice</button>
              </div>

              {invoices.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-2xl mb-2 opacity-20">📄</div>
                  <div className="text-sm text-gray-600 mb-3">No invoices yet</div>
                  <div className="text-xs text-gray-700 mb-4">You can add a deposit invoice before work starts,<br/>or a final invoice when complete</div>
                  <button onClick={() => setShowAddInvoice(true)}
                    className="text-xs bg-amber-500 text-gray-950 font-bold px-4 py-2 rounded-xl hover:bg-amber-400">
                    Add first invoice →
                  </button>
                </div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-gray-800">
                    <th className="text-left text-xs font-medium text-gray-600 px-5 py-3">Invoice</th>
                    <th className="text-left text-xs font-medium text-gray-600 px-3 py-3">Type</th>
                    <th className="text-left text-xs font-medium text-gray-600 px-3 py-3">Status</th>
                    <th className="text-right text-xs font-medium text-gray-600 px-3 py-3">Due</th>
                    <th className="text-right text-xs font-medium text-gray-600 px-5 py-3">Amount</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {invoices.map(inv => (
                      <tr key={inv.id} onClick={() => router.push(`/invoices/${inv.id}`)} className="hover:bg-gray-800/40 cursor-pointer transition-colors group">
                        <td className="px-5 py-3">
                          <div className="text-sm font-medium text-gray-200 group-hover:text-white">{inv.title || inv.reference}</div>
                          <div className="text-xs font-mono text-gray-600">{inv.reference}</div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500">{INVOICE_TYPE_LABEL[inv.invoice_type] || inv.invoice_type}</td>
                        <td className="px-3 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${INVOICE_STATUS[inv.status]?.colour || 'text-gray-500 bg-gray-800'}`}>{INVOICE_STATUS[inv.status]?.label || inv.status}</span></td>
                        <td className="px-3 py-3 text-right text-xs text-gray-500">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                        <td className="px-5 py-3 text-right">
                          <div className={`text-sm font-semibold ${inv.status === 'paid' ? 'text-emerald-400' : inv.status === 'overdue' ? 'text-red-400' : 'text-gray-200'}`}>{formatCurrency(inv.total_gross || 0)}</div>
                          {inv.amount_due > 0 && inv.status !== 'paid' && <div className="text-xs text-amber-400">{formatCurrency(inv.amount_due)} due</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-700">
                    <tr>
                      <td colSpan={4} className="px-5 py-3 text-right text-xs text-gray-500">Total invoiced</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-gray-200">{formatCurrency(totalInvoiced)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500">Collected</td>
                      <td className="px-5 py-2 text-right text-sm font-semibold text-emerald-400">{formatCurrency(totalPaid)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          {/* RIGHT: Summary + actions */}
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">Job summary</div>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Status</span><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${currentStatus?.colour || 'text-gray-400 bg-gray-800'}`}>{currentStatus?.label}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Invoices</span><span className="text-gray-200">{invoices.length}</span></div>
                {totalInvoiced > 0 && <>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Total invoiced</span><span className="text-gray-200">{formatCurrency(totalInvoiced)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Collected</span><span className="text-emerald-400">{formatCurrency(totalPaid)}</span></div>
                  {totalInvoiced > totalPaid && <div className="flex justify-between text-sm"><span className="text-gray-500">Outstanding</span><span className="text-red-400">{formatCurrency(totalInvoiced - totalPaid)}</span></div>}
                </>}
                {job.actual_start && <div className="flex justify-between text-sm"><span className="text-gray-500">Started</span><span className="text-gray-300">{formatDate(job.actual_start)}</span></div>}
                {job.actual_end && <div className="flex justify-between text-sm"><span className="text-gray-500">Completed</span><span className="text-gray-300">{formatDate(job.actual_end)}</span></div>}
              </div>
            </div>

            {/* Actions */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Actions</div>
              <div className="space-y-2">
                <button onClick={() => setShowAddInvoice(true)}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-sm text-amber-300 transition-colors font-medium">
                  <span>📄</span> Add invoice to this job
                </button>
                <a href={`/jobs/${jobId}/edit`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>✏️</span> Edit job</a>
                <a href={`/customers/${job.customer_id}`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>👤</span> View customer</a>
                {job.quote_id && <a href={`/quotes/${job.quote_id}`} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"><span>📋</span> Original quote</a>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add invoice modal */}
      {showAddInvoice && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowAddInvoice(false) }}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <div className="text-base font-bold text-white mb-2">Add invoice</div>
            <div className="text-sm text-gray-500 mb-5">What type of invoice do you want to create for this job?</div>
            <div className="space-y-2 mb-5">
              {[
                { key: 'deposit', label: 'Deposit invoice', desc: 'Charge a deposit before work starts' },
                { key: 'interim', label: 'Interim invoice', desc: 'Stage payment during the job' },
                { key: 'final',   label: 'Final invoice',   desc: 'Full or remaining balance when complete' },
              ].map(t => (
                <button key={t.key} onClick={() => setInvoiceType(t.key as any)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${invoiceType === t.key ? 'border-amber-500 bg-amber-500/10' : 'border-gray-700 hover:border-gray-500'}`}>
                  <div className={`text-sm font-medium ${invoiceType === t.key ? 'text-amber-300' : 'text-gray-200'}`}>{t.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={createInvoice} disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold py-3 rounded-xl text-sm">
                {saving ? 'Creating…' : 'Create invoice →'}
              </button>
              <button onClick={() => setShowAddInvoice(false)} className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-xl">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showStatusMenu && <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)}/>}
    </div>
  )
}