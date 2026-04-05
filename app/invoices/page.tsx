'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate } from '@/lib/supabase'

const STATUS_CONFIG: Record<string, { label: string; colour: string }> = {
  draft:          { label: 'Draft',       colour: 'text-gray-400 bg-gray-800' },
  sent:           { label: 'Sent',        colour: 'text-blue-300 bg-blue-900/50' },
  viewed:         { label: 'Viewed',      colour: 'text-blue-200 bg-blue-800/50' },
  partially_paid: { label: 'Part paid',   colour: 'text-amber-300 bg-amber-900/50' },
  paid:           { label: 'Paid',        colour: 'text-emerald-300 bg-emerald-900/50' },
  overdue:        { label: 'Overdue',     colour: 'text-red-300 bg-red-900/50' },
  cancelled:      { label: 'Cancelled',   colour: 'text-gray-600 bg-gray-800' },
}

const TYPE_LABEL: Record<string, string> = {
  deposit: 'Deposit', interim: 'Interim', final: 'Final',
  standalone: 'Standalone', credit_note: 'Credit note',
}

const FILTERS = ['all', 'draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled'] as const
type Filter = typeof FILTERS[number]

export default function InvoicesListPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data } = await (supabase as any)
      .from('invoices')
      .select('*, customers(first_name, last_name, company_name, is_company)')
      .order('created_at', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  function customerName(inv: any) {
    const c = inv.customers
    if (!c) return '—'
    if (c.is_company && c.company_name) return c.company_name
    return `${c.first_name} ${c.last_name}`
  }

  const filtered = invoices.filter(inv => {
    if (filter !== 'all' && inv.status !== filter) return false
    if (search) {
      const s = `${customerName(inv)} ${inv.reference || ''} ${inv.title || ''}`.toLowerCase()
      if (!s.includes(search.toLowerCase())) return false
    }
    return true
  })

  const counts: Record<Filter, number> = {
    all: invoices.length,
    draft: invoices.filter(i => i.status === 'draft').length,
    sent: invoices.filter(i => i.status === 'sent').length,
    viewed: invoices.filter(i => i.status === 'viewed').length,
    partially_paid: invoices.filter(i => i.status === 'partially_paid').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
    cancelled: invoices.filter(i => i.status === 'cancelled').length,
  }

  const totalOutstanding = invoices.filter(i => ['sent','viewed','partially_paid','overdue'].includes(i.status)).reduce((s: number, i: any) => s + (i.amount_due || 0), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s: number, i: any) => s + (i.total_gross || 0), 0)
  const totalOverdue = invoices.filter(i => i.status === 'overdue').reduce((s: number, i: any) => s + (i.amount_due || 0), 0)

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-white">Invoices</h1>
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 overflow-x-auto">
            {(['all','draft','sent','viewed','partially_paid','paid','overdue'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors font-medium whitespace-nowrap ${filter === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {f === 'partially_paid' ? 'Part paid' : f.charAt(0).toUpperCase() + f.slice(1)}
                {counts[f] > 0 && <span className={`ml-1 ${filter === f ? 'text-amber-400' : f === 'overdue' ? 'text-red-500' : 'text-gray-600'}`}>{counts[f]}</span>}
              </button>
            ))}
          </div>
        </div>
        <a href="/invoices/new" className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg">+ New invoice</a>
      </div>

      <div className="flex-1 px-6 py-5 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Outstanding</div>
            <div className="text-xl font-bold text-amber-400">{formatCurrency(totalOutstanding)}</div>
            <div className="text-xs text-gray-500 mt-1">{counts.sent + counts.viewed + counts.partially_paid} invoices</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Collected</div>
            <div className="text-xl font-bold text-emerald-400">{formatCurrency(totalPaid)}</div>
            <div className="text-xs text-gray-500 mt-1">{counts.paid} paid invoices</div>
          </div>
          {totalOverdue > 0 ? (
            <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4">
              <div className="text-xs text-red-500 uppercase tracking-wide mb-1">Overdue ⚠</div>
              <div className="text-xl font-bold text-red-400">{formatCurrency(totalOverdue)}</div>
              <div className="text-xs text-red-600 mt-1">{counts.overdue} invoice{counts.overdue !== 1 ? 's' : ''} past due</div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Overdue</div>
              <div className="text-xl font-bold text-gray-700">£0</div>
              <div className="text-xs text-gray-600 mt-1">All clear</div>
            </div>
          )}
        </div>

        {/* Overdue alert */}
        {counts.overdue > 0 && (
          <div className="bg-red-500/8 border border-red-500/20 rounded-xl px-5 py-3 flex items-center gap-3">
            <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"/>
            <div className="flex-1 text-sm text-red-300">{counts.overdue} invoice{counts.overdue !== 1 ? 's are' : ' is'} overdue — {formatCurrency(totalOverdue)} outstanding</div>
            <button onClick={() => setFilter('overdue')} className="text-xs text-red-400 font-medium hover:text-red-300 flex-shrink-0">View →</button>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/></svg>
          <input placeholder="Search customer or reference…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500"/>
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-3xl mb-3 opacity-20">💰</div>
              <div className="text-sm text-gray-600 mb-1">{search || filter !== 'all' ? 'No results' : 'No invoices yet'}</div>
              {!search && filter === 'all' && <a href="/invoices/new" className="mt-4 inline-block text-xs bg-amber-500 text-gray-950 font-bold px-4 py-2 rounded-xl hover:bg-amber-400">Create your first invoice →</a>}
            </div>
          ) : (
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-gray-800">
                <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Invoice</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Customer</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Type</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3 hidden md:table-cell">Due</th>
                <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Amount</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-800/50">
                {filtered.map(inv => (
                  <tr key={inv.id} onClick={() => router.push(`/invoices/${inv.id}`)} className="hover:bg-gray-800/40 cursor-pointer transition-colors group">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-gray-200 group-hover:text-white truncate max-w-40">{inv.title || '—'}</div>
                      <div className="text-xs font-mono text-gray-600">{inv.reference}</div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-400">{customerName(inv)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{TYPE_LABEL[inv.invoice_type] || inv.invoice_type}</td>
                    <td className="px-3 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CONFIG[inv.status]?.colour || 'text-gray-500 bg-gray-800'}`}>{STATUS_CONFIG[inv.status]?.label || inv.status}</span></td>
                    <td className="px-3 py-3 hidden md:table-cell text-xs text-gray-500">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <div className={`text-sm font-semibold ${inv.status === 'paid' ? 'text-emerald-400' : inv.status === 'overdue' ? 'text-red-400' : 'text-gray-200'}`}>{formatCurrency(inv.total_gross || 0)}</div>
                      {inv.amount_due > 0 && inv.status !== 'paid' && <div className="text-xs text-amber-400">{formatCurrency(inv.amount_due)} due</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}