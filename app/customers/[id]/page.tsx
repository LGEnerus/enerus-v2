'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate } from '@/lib/supabase'

// ─── Status config ─────────────────────────────────────────────────────────────

const QUOTE_STATUS: Record<string, { label: string; colour: string }> = {
  draft:     { label: 'Draft',     colour: 'text-gray-400 bg-gray-800' },
  sent:      { label: 'Sent',      colour: 'text-blue-300 bg-blue-900/50' },
  viewed:    { label: 'Viewed',    colour: 'text-blue-200 bg-blue-800/50' },
  approved:  { label: 'Approved',  colour: 'text-emerald-300 bg-emerald-900/50' },
  declined:  { label: 'Declined',  colour: 'text-red-400 bg-red-900/30' },
  cancelled: { label: 'Cancelled', colour: 'text-gray-600 bg-gray-800' },
  converted: { label: 'Converted to job', colour: 'text-amber-300 bg-amber-900/30' },
  archived:  { label: 'Archived',  colour: 'text-gray-700 bg-gray-900' },
}

const JOB_STATUS: Record<string, { label: string; colour: string }> = {
  created:     { label: 'Created',     colour: 'text-gray-400 bg-gray-800' },
  assigned:    { label: 'Assigned',    colour: 'text-purple-300 bg-purple-900/50' },
  scheduled:   { label: 'Scheduled',   colour: 'text-blue-300 bg-blue-900/50' },
  in_progress: { label: 'In progress', colour: 'text-amber-300 bg-amber-900/50' },
  on_hold:     { label: 'On hold',     colour: 'text-orange-300 bg-orange-900/30' },
  complete:    { label: 'Complete',    colour: 'text-emerald-300 bg-emerald-900/50' },
  cancelled:   { label: 'Cancelled',   colour: 'text-gray-600 bg-gray-800' },
  archived:    { label: 'Archived',    colour: 'text-gray-700 bg-gray-900' },
}

const INVOICE_STATUS: Record<string, { label: string; colour: string }> = {
  draft:           { label: 'Draft',        colour: 'text-gray-400 bg-gray-800' },
  sent:            { label: 'Sent',         colour: 'text-blue-300 bg-blue-900/50' },
  viewed:          { label: 'Viewed',       colour: 'text-blue-200 bg-blue-800/50' },
  partially_paid:  { label: 'Part paid',    colour: 'text-amber-300 bg-amber-900/50' },
  paid:            { label: 'Paid',         colour: 'text-emerald-300 bg-emerald-900/50' },
  overdue:         { label: 'Overdue',      colour: 'text-red-300 bg-red-900/50' },
  cancelled:       { label: 'Cancelled',    colour: 'text-gray-600 bg-gray-800' },
  archived:        { label: 'Archived',     colour: 'text-gray-700 bg-gray-900' },
}

const INVOICE_TYPE_LABEL: Record<string, string> = {
  deposit: '🔖 Deposit', interim: '📑 Interim', final: '📄 Final',
  standalone: '📋 Standalone', credit_note: '↩ Credit note',
}

type Tab = 'overview' | 'quotes' | 'jobs' | 'invoices' | 'sites'

export default function CustomerHubPage() {
  const params = useParams()
  const router = useRouter()
  const customerId = params.id as string

  const [customer, setCustomer] = useState<any>(null)
  const [sites, setSites] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')

  useEffect(() => { load() }, [customerId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)

    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)

    const [{ data: c }, { data: s }, { data: q }, { data: j }, { data: inv }] = await Promise.all([
      (supabase as any).from('customers').select('*').eq('id', customerId).single(),
      (supabase as any).from('sites').select('*').eq('customer_id', customerId).order('is_default', { ascending: false }),
      (supabase as any).from('quotes').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      (supabase as any).from('jobs').select('*, invoices(id, status, total_gross, invoice_type)').eq('customer_id', customerId).order('created_at', { ascending: false }),
      (supabase as any).from('invoices').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    ])

    if (!c) { router.push('/customers'); return }
    setCustomer(c)
    setSites(s || [])
    setQuotes(q || [])
    setJobs(j || [])
    setInvoices(inv || [])
    setLoading(false)
  }

  function customerName() {
    if (!customer) return '—'
    if (customer.is_company && customer.company_name) return customer.company_name
    return `${customer.first_name} ${customer.last_name}`
  }

  // Financial summary
  const totalQuoteValue = quotes.filter(q => !['declined','cancelled','archived'].includes(q.status)).reduce((s: number, q: any) => s + (q.total_gross || 0), 0)
  const totalInvoiced = invoices.reduce((s: number, i: any) => s + (i.total_gross || 0), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s: number, i: any) => s + (i.total_gross || 0), 0)
  const totalOutstanding = invoices.filter(i => ['sent','viewed','partially_paid','overdue'].includes(i.status)).reduce((s: number, i: any) => s + (i.amount_due || 0), 0)

  const badge = (count: number) => count > 0 ? ` (${count})` : ''

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950">

      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <a href="/customers" className="text-gray-600 hover:text-gray-400 text-sm">← Customers</a>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-medium text-gray-300">{customerName()}</span>
        <div className="ml-auto flex items-center gap-2">
          {/* Quick create dropdown */}
          <div className="flex items-center gap-2">
            <a href={`/quotes/new?customer=${customerId}`}
              className="text-xs border border-gray-700 text-gray-400 hover:bg-gray-800 px-3 py-2 rounded-lg transition-colors">
              + Quote
            </a>
            <a href={`/jobs/new?customer=${customerId}`}
              className="text-xs border border-gray-700 text-gray-400 hover:bg-gray-800 px-3 py-2 rounded-lg transition-colors">
              + Job
            </a>
            <a href={`/invoices/new?customer=${customerId}`}
              className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-3 py-2 rounded-lg transition-colors">
              + Invoice
            </a>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-w-screen-xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">

          {/* LEFT: Customer card */}
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400 text-base font-bold flex-shrink-0">
                  {customerName().charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{customerName()}</div>
                  {customer.is_company && customer.first_name && <div className="text-xs text-gray-500">{customer.first_name} {customer.last_name}</div>}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {customer.email && <a href={`mailto:${customer.email}`} className="block text-amber-400 hover:text-amber-300 text-xs">{customer.email}</a>}
                {customer.phone && <div className="text-gray-400 text-xs">{customer.phone}</div>}
                {customer.address_line1 && <div className="text-gray-500 text-xs pt-1 border-t border-gray-800">{customer.address_line1}{customer.postcode ? `, ${customer.postcode}` : ''}</div>}
              </div>
              {customer.notes && <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">{customer.notes}</div>}
              <a href={`/customers/${customerId}/edit`} className="mt-3 block text-xs text-amber-400 hover:text-amber-300">Edit contact details →</a>
            </div>

            {/* Financial summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Financials</div>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Open quotes</span><span className="text-blue-400 font-medium">{formatCurrency(totalQuoteValue)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Total invoiced</span><span className="text-gray-200">{formatCurrency(totalInvoiced)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Collected</span><span className="text-emerald-400 font-medium">{formatCurrency(totalPaid)}</span></div>
                {totalOutstanding > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Outstanding</span><span className="text-red-400 font-medium">{formatCurrency(totalOutstanding)}</span></div>}
                <div className="border-t border-gray-800 pt-2 flex justify-between text-xs">
                  <span className="text-gray-600">{sites.length} site{sites.length !== 1 ? 's' : ''}</span>
                  <span className="text-gray-600">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Tabs */}
          <div className="xl:col-span-3 space-y-4">

            {/* Tab nav */}
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit flex-wrap">
              {([
                ['overview', 'Overview'],
                ['quotes', `Quotes${badge(quotes.length)}`],
                ['jobs', `Jobs${badge(jobs.length)}`],
                ['invoices', `Invoices${badge(invoices.length)}`],
                ['sites', `Sites${badge(sites.length)}`],
              ] as [Tab, string][]).map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`text-xs px-4 py-2 rounded-lg font-medium transition-colors ${tab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <div className="space-y-4">
                {/* Recent quotes */}
                {quotes.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">Recent quotes</div>
                      <button onClick={() => setTab('quotes')} className="text-xs text-amber-400 hover:text-amber-300">View all →</button>
                    </div>
                    {quotes.slice(0, 3).map(q => (
                      <a key={q.id} href={`/quotes/${q.id}`}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-gray-800/40 transition-colors border-b border-gray-800/50 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-200 truncate">{q.title || q.reference || '—'}</div>
                          <div className="text-xs text-gray-600">{q.reference} · {formatDate(q.quote_date || q.created_at)}</div>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${QUOTE_STATUS[q.status]?.colour || 'text-gray-500 bg-gray-800'}`}>{QUOTE_STATUS[q.status]?.label || q.status}</span>
                        <span className="text-sm font-semibold text-gray-200 flex-shrink-0">{formatCurrency(q.total_gross || 0)}</span>
                      </a>
                    ))}
                  </div>
                )}

                {/* Recent jobs */}
                {jobs.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">Recent jobs</div>
                      <button onClick={() => setTab('jobs')} className="text-xs text-amber-400 hover:text-amber-300">View all →</button>
                    </div>
                    {jobs.slice(0, 3).map(j => (
                      <a key={j.id} href={`/jobs/${j.id}`}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-gray-800/40 transition-colors border-b border-gray-800/50 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-200 truncate">{j.title || j.reference || '—'}</div>
                          <div className="text-xs text-gray-600">{j.reference} {j.scheduled_start ? `· ${new Date(j.scheduled_start).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}` : ''}</div>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${JOB_STATUS[j.status]?.colour || 'text-gray-500 bg-gray-800'}`}>{JOB_STATUS[j.status]?.label || j.status}</span>
                        <span className="text-xs text-gray-600 flex-shrink-0">{(j.invoices || []).length} invoice{(j.invoices || []).length !== 1 ? 's' : ''}</span>
                      </a>
                    ))}
                  </div>
                )}

                {/* Recent invoices */}
                {invoices.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">Recent invoices</div>
                      <button onClick={() => setTab('invoices')} className="text-xs text-amber-400 hover:text-amber-300">View all →</button>
                    </div>
                    {invoices.slice(0, 3).map(inv => (
                      <a key={inv.id} href={`/invoices/${inv.id}`}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-gray-800/40 transition-colors border-b border-gray-800/50 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-200 truncate">{inv.title || inv.reference || '—'}</div>
                          <div className="text-xs text-gray-600">{inv.reference} · {INVOICE_TYPE_LABEL[inv.invoice_type] || inv.invoice_type}</div>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${INVOICE_STATUS[inv.status]?.colour || 'text-gray-500 bg-gray-800'}`}>{INVOICE_STATUS[inv.status]?.label || inv.status}</span>
                        <span className={`text-sm font-semibold flex-shrink-0 ${inv.status === 'paid' ? 'text-emerald-400' : inv.status === 'overdue' ? 'text-red-400' : 'text-gray-200'}`}>{formatCurrency(inv.total_gross || 0)}</span>
                      </a>
                    ))}
                  </div>
                )}

                {quotes.length === 0 && jobs.length === 0 && invoices.length === 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl py-16 text-center">
                    <div className="text-3xl mb-3 opacity-20">📋</div>
                    <div className="text-sm text-gray-600 mb-5">Nothing here yet for this customer</div>
                    <div className="flex justify-center gap-3">
                      <a href={`/quotes/new?customer=${customerId}`} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-xl border border-gray-700">+ New quote</a>
                      <a href={`/jobs/new?customer=${customerId}`} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-xl border border-gray-700">+ New job</a>
                      <a href={`/invoices/new?customer=${customerId}`} className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-4 py-2 rounded-xl">+ New invoice</a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── QUOTES ── */}
            {tab === 'quotes' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">{quotes.length} quote{quotes.length !== 1 ? 's' : ''}</div>
                  <a href={`/quotes/new?customer=${customerId}`} className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-4 py-2 rounded-lg">+ New quote</a>
                </div>
                {quotes.length === 0 ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl py-14 text-center">
                    <div className="text-3xl mb-3 opacity-20">📄</div>
                    <div className="text-sm text-gray-600 mb-4">No quotes yet</div>
                    <a href={`/quotes/new?customer=${customerId}`} className="text-xs bg-amber-500 text-gray-950 font-bold px-4 py-2 rounded-xl hover:bg-amber-400">Create first quote →</a>
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full">
                      <thead><tr className="border-b border-gray-800">
                        <th className="text-left text-xs font-medium text-gray-600 px-5 py-3">Quote</th>
                        <th className="text-left text-xs font-medium text-gray-600 px-3 py-3">Status</th>
                        <th className="text-left text-xs font-medium text-gray-600 px-3 py-3 hidden md:table-cell">Date</th>
                        <th className="text-right text-xs font-medium text-gray-600 px-5 py-3">Value</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {quotes.map(q => (
                          <tr key={q.id} onClick={() => router.push(`/quotes/${q.id}`)} className="hover:bg-gray-800/40 cursor-pointer transition-colors group">
                            <td className="px-5 py-3">
                              <div className="text-sm font-medium text-gray-200 group-hover:text-white truncate">{q.title || '—'}</div>
                              <div className="text-xs font-mono text-gray-600">{q.reference}</div>
                              {q.job_id && <div className="text-xs text-amber-500 mt-0.5">→ Converted to job</div>}
                            </td>
                            <td className="px-3 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${QUOTE_STATUS[q.status]?.colour || 'text-gray-500 bg-gray-800'}`}>{QUOTE_STATUS[q.status]?.label || q.status}</span></td>
                            <td className="px-3 py-3 hidden md:table-cell text-xs text-gray-500">{formatDate(q.quote_date || q.created_at)}</td>
                            <td className="px-5 py-3 text-right text-sm font-semibold text-gray-200">{formatCurrency(q.total_gross || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── JOBS ── */}
            {tab === 'jobs' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</div>
                  <a href={`/jobs/new?customer=${customerId}`} className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-4 py-2 rounded-lg">+ New job</a>
                </div>
                {jobs.length === 0 ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl py-14 text-center">
                    <div className="text-3xl mb-3 opacity-20">🔧</div>
                    <div className="text-sm text-gray-600 mb-4">No jobs yet</div>
                    <a href={`/jobs/new?customer=${customerId}`} className="text-xs bg-amber-500 text-gray-950 font-bold px-4 py-2 rounded-xl hover:bg-amber-400">Create first job →</a>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {jobs.map(j => {
                      const jobInvoices = j.invoices || []
                      const totalInv = jobInvoices.reduce((s: number, i: any) => s + (i.total_gross || 0), 0)
                      const paid = jobInvoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + (i.total_gross || 0), 0)
                      return (
                        <a key={j.id} href={`/jobs/${j.id}`}
                          className="block bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 transition-colors group">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">{j.title || j.reference || '—'}</div>
                              <div className="text-xs font-mono text-gray-600 mt-0.5">{j.reference}</div>
                              {j.quote_id && <div className="text-xs text-blue-400 mt-0.5">From quote</div>}
                            </div>
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${JOB_STATUS[j.status]?.colour || 'text-gray-500 bg-gray-800'}`}>{JOB_STATUS[j.status]?.label || j.status}</span>
                          </div>
                          {j.scheduled_start && (
                            <div className="text-xs text-gray-500 mb-3">
                              📅 {new Date(j.scheduled_start).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'long', year:'numeric' })}
                              {j.scheduled_end ? ` → ${new Date(j.scheduled_end).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}` : ''}
                            </div>
                          )}
                          {/* Invoice summary */}
                          <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                            <div className="flex items-center gap-3">
                              {jobInvoices.length === 0 ? (
                                <span className="text-xs text-gray-600">No invoices yet</span>
                              ) : jobInvoices.map((inv: any) => (
                                <span key={inv.id} className={`text-xs px-2 py-0.5 rounded-full ${INVOICE_STATUS[inv.status]?.colour || 'text-gray-500 bg-gray-800'}`}>
                                  {INVOICE_TYPE_LABEL[inv.invoice_type]?.split(' ')[1] || 'Invoice'}: {INVOICE_STATUS[inv.status]?.label}
                                </span>
                              ))}
                            </div>
                            {totalInv > 0 && (
                              <div className="text-xs text-gray-500">
                                {formatCurrency(paid)} / {formatCurrency(totalInv)} paid
                              </div>
                            )}
                          </div>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── INVOICES ── */}
            {tab === 'invoices' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</div>
                  <a href={`/invoices/new?customer=${customerId}`} className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-4 py-2 rounded-lg">+ New invoice</a>
                </div>
                {invoices.length === 0 ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl py-14 text-center">
                    <div className="text-3xl mb-3 opacity-20">💰</div>
                    <div className="text-sm text-gray-600 mb-4">No invoices yet</div>
                    <a href={`/invoices/new?customer=${customerId}`} className="text-xs bg-amber-500 text-gray-950 font-bold px-4 py-2 rounded-xl hover:bg-amber-400">Create first invoice →</a>
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
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
                              <div className="text-sm font-medium text-gray-200 group-hover:text-white truncate">{inv.title || '—'}</div>
                              <div className="text-xs font-mono text-gray-600">{inv.reference}</div>
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-500">{INVOICE_TYPE_LABEL[inv.invoice_type]}</td>
                            <td className="px-3 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${INVOICE_STATUS[inv.status]?.colour || 'text-gray-500 bg-gray-800'}`}>{INVOICE_STATUS[inv.status]?.label || inv.status}</span></td>
                            <td className="px-3 py-3 text-right text-xs text-gray-500">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                            <td className="px-5 py-3 text-right">
                              <div className={`text-sm font-semibold ${inv.status === 'paid' ? 'text-emerald-400' : inv.status === 'overdue' ? 'text-red-400' : 'text-gray-200'}`}>{formatCurrency(inv.total_gross || 0)}</div>
                              {inv.amount_due > 0 && inv.amount_due < inv.total_gross && <div className="text-xs text-amber-400">{formatCurrency(inv.amount_due)} due</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── SITES ── */}
            {tab === 'sites' && (
              <div className="space-y-3">
                {sites.map(site => (
                  <div key={site.id} className={`bg-gray-900 border rounded-2xl p-5 ${site.is_default ? 'border-amber-500/30' : 'border-gray-800'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-white">{site.name}</div>
                          {site.is_default && <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">Default</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{[site.address_line1, site.city, site.postcode].filter(Boolean).join(', ') || 'No address'}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                      {site.property_type && <div><div className="text-gray-600">Type</div><div className="text-gray-300 mt-0.5">{site.property_type}</div></div>}
                      {site.epc_rating && <div><div className="text-gray-600">EPC</div><div className={`font-semibold mt-0.5 ${site.epc_rating <= 'B' ? 'text-emerald-400' : site.epc_rating === 'C' ? 'text-amber-400' : 'text-red-400'}`}>{site.epc_rating}</div></div>}
                      {site.floor_area_m2 && <div><div className="text-gray-600">Area</div><div className="text-gray-300 mt-0.5">{site.floor_area_m2} m²</div></div>}
                    </div>
                  </div>
                ))}
                <button onClick={() => setTab('sites')}
                  className="w-full py-3 border border-dashed border-gray-700 rounded-2xl text-xs text-gray-500 hover:border-amber-500 hover:text-amber-400 transition-colors">
                  + Add site
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}