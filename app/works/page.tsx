'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, STATUS_LABEL, STATUS_COLOUR, formatCurrency, formatDate, isQuote, isJob, isInvoice, type Work, type WorkStatus } from '@/lib/supabase'

type ViewFilter = 'all' | 'quotes' | 'jobs' | 'invoices'

const STATUS_GROUPS: Record<ViewFilter, WorkStatus[]> = {
  all: [],
  quotes: ['draft','quote_sent','quote_viewed','quote_accepted','quote_declined'],
  jobs: ['job_scheduled','job_in_progress','job_complete'],
  invoices: ['invoice_sent','invoice_viewed','invoice_partially_paid','invoice_paid','invoice_overdue'],
}

export default function WorksPage() {
  const router = useRouter()
  const [works, setWorks] = useState<Work[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewFilter>('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data } = await (supabase as any)
      .from('works')
      .select('*, customers(first_name, last_name, company_name, is_company, postcode)')
      .order('updated_at', { ascending: false })

    setWorks(data || [])
    setLoading(false)
  }

  // Derived stats for tab counts
  const counts = {
    all: works.length,
    quotes: works.filter(w => isQuote(w.status)).length,
    jobs: works.filter(w => isJob(w.status)).length,
    invoices: works.filter(w => isInvoice(w.status)).length,
  }

  // Financial summary for current view
  const viewWorks = works.filter(w => {
    if (view !== 'all' && STATUS_GROUPS[view].length > 0 && !STATUS_GROUPS[view].includes(w.status)) return false
    if (statusFilter && w.status !== statusFilter) return false
    if (search) {
      const c = w.customers as any
      const name = `${c?.first_name || ''} ${c?.last_name || ''} ${c?.company_name || ''} ${w.reference || ''}`.toLowerCase()
      if (!name.includes(search.toLowerCase())) return false
    }
    return true
  })

  const totalValue = viewWorks.reduce((s, w) => s + (w.total_gross || 0), 0)
  const totalOutstanding = viewWorks.filter(w => w.status === 'invoice_overdue' || w.status === 'invoice_sent' || w.status === 'invoice_viewed').reduce((s, w) => s + (w.amount_due || 0), 0)
  const totalPaid = viewWorks.filter(w => w.status === 'invoice_paid').reduce((s, w) => s + (w.total_gross || 0), 0)

  // Status options for the current view filter
  const statusOptions = view === 'all'
    ? Object.keys(STATUS_LABEL) as WorkStatus[]
    : STATUS_GROUPS[view]

  function customerName(w: Work): string {
    const c = w.customers as any
    if (!c) return '—'
    if (c.is_company && c.company_name) return c.company_name
    return `${c.first_name} ${c.last_name}`
  }

  // Overdue alert
  const overdueCount = works.filter(w => w.status === 'invoice_overdue').length
  const overdueValue = works.filter(w => w.status === 'invoice_overdue').reduce((s, w) => s + (w.amount_due || 0), 0)

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-sm text-gray-500">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-white">Work</h1>
          {/* View tabs */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
            {(['all','quotes','jobs','invoices'] as ViewFilter[]).map(v => (
              <button key={v} onClick={() => { setView(v); setStatusFilter('') }}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors capitalize font-medium ${view === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {v} {counts[v] > 0 && <span className={`ml-1 text-xs ${view === v ? 'text-amber-400' : 'text-gray-600'}`}>{counts[v]}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/works/new')}
            className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            + New
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-5 space-y-4">

        {/* Overdue alert */}
        {overdueCount > 0 && (
          <div className="bg-red-500/8 border border-red-500/20 rounded-xl px-5 py-3 flex items-center gap-3">
            <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"/>
            <div className="flex-1 text-sm text-red-300">
              {overdueCount} invoice{overdueCount > 1 ? 's' : ''} overdue — {formatCurrency(overdueValue)} outstanding
            </div>
            <button onClick={() => { setView('invoices'); setStatusFilter('invoice_overdue') }}
              className="text-xs text-red-400 font-medium hover:text-red-300">
              View →
            </button>
          </div>
        )}

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {view === 'all' ? 'Total value' : view === 'quotes' ? 'Quote value' : view === 'jobs' ? 'Jobs value' : 'Invoice value'}
            </div>
            <div className="text-xl font-bold text-white">{formatCurrency(totalValue)}</div>
            <div className="text-xs text-gray-600 mt-1">{viewWorks.length} records</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Outstanding</div>
            <div className={`text-xl font-bold ${totalOutstanding > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
              {formatCurrency(totalOutstanding)}
            </div>
            <div className="text-xs text-gray-600 mt-1">Sent + overdue</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Collected</div>
            <div className="text-xl font-bold text-emerald-400">{formatCurrency(totalPaid)}</div>
            <div className="text-xs text-gray-600 mt-1">Paid invoices</div>
          </div>
        </div>

        {/* Search + filter */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/>
            </svg>
            <input type="text" placeholder="Search customer or reference…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500"/>
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-amber-500">
            <option value="">All statuses</option>
            {statusOptions.map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>

        {/* Works table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {viewWorks.length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-3xl mb-3 opacity-20">📋</div>
              <div className="text-sm font-medium text-gray-500 mb-1">
                {search || statusFilter ? 'No results' : `No ${view === 'all' ? 'work' : view} yet`}
              </div>
              {!search && !statusFilter && (
                <button onClick={() => router.push('/works/new')}
                  className="mt-4 text-xs bg-amber-500 text-gray-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-400">
                  Create your first {view === 'invoices' ? 'invoice' : view === 'quotes' ? 'quote' : 'job'} →
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs font-medium text-gray-600 px-4 py-3">Reference</th>
                    <th className="text-left text-xs font-medium text-gray-600 px-4 py-3">Customer</th>
                    <th className="text-left text-xs font-medium text-gray-600 px-4 py-3 hidden md:table-cell">Trade</th>
                    <th className="text-left text-xs font-medium text-gray-600 px-4 py-3">Status</th>
                    <th className="text-right text-xs font-medium text-gray-600 px-4 py-3">Value</th>
                    <th className="text-right text-xs font-medium text-gray-600 px-4 py-3 hidden lg:table-cell">Date</th>
                    <th className="text-right text-xs font-medium text-gray-600 px-4 py-3 hidden lg:table-cell">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {viewWorks.map(work => {
                    const isOverdue = work.status === 'invoice_overdue'
                    const hasBeenViewed = work.view_count > 0
                    return (
                      <tr key={work.id}
                        onClick={() => router.push(`/works/${work.id}`)}
                        className="hover:bg-gray-800/50 cursor-pointer transition-colors group">
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-gray-400 group-hover:text-amber-400 transition-colors">
                            {work.reference || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-200">{customerName(work)}</div>
                          <div className="text-xs text-gray-600">{(work.customers as any)?.postcode}</div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs text-gray-500 capitalize">{work.trade_type}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLOUR[work.status]}`}>
                              {STATUS_LABEL[work.status]}
                            </span>
                            {hasBeenViewed && (isQuote(work.status) || isInvoice(work.status)) && (
                              <span className="text-xs text-blue-400" title={`Viewed ${work.view_count} time${work.view_count > 1 ? 's' : ''}`}>
                                👁 {work.view_count}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className={`text-sm font-semibold ${isOverdue ? 'text-red-400' : 'text-gray-200'}`}>
                            {formatCurrency(work.total_gross)}
                          </div>
                          {work.amount_due > 0 && work.amount_due < work.total_gross && (
                            <div className="text-xs text-amber-400">{formatCurrency(work.amount_due)} due</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <span className="text-xs text-gray-600">
                            {formatDate(work.invoice_date || work.quote_date || work.created_at)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <span className={`text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-gray-600'}`}>
                            {work.invoice_due_date ? formatDate(work.invoice_due_date) : '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}