'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate } from '@/lib/supabase'

const STATUS_CONFIG: Record<string, { label: string; colour: string }> = {
  draft:     { label: 'Draft',     colour: 'text-gray-400 bg-gray-800' },
  sent:      { label: 'Sent',      colour: 'text-blue-300 bg-blue-900/50' },
  viewed:    { label: 'Viewed',    colour: 'text-blue-200 bg-blue-800/50' },
  approved:  { label: 'Approved',  colour: 'text-emerald-300 bg-emerald-900/50' },
  declined:  { label: 'Declined',  colour: 'text-red-400 bg-red-900/30' },
  cancelled: { label: 'Cancelled', colour: 'text-gray-600 bg-gray-800' },
  converted: { label: 'Converted', colour: 'text-amber-300 bg-amber-900/30' },
  archived:  { label: 'Archived',  colour: 'text-gray-700 bg-gray-900' },
}

const FILTERS = ['all', 'draft', 'sent', 'viewed', 'approved', 'declined', 'converted', 'cancelled'] as const
type Filter = typeof FILTERS[number]

export default function QuotesListPage() {
  const router = useRouter()
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data } = await (supabase as any)
      .from('quotes')
      .select('*, customers(first_name, last_name, company_name, is_company)')
      .order('created_at', { ascending: false })
    setQuotes(data || [])
    setLoading(false)
  }

  function customerName(q: any) {
    const c = q.customers
    if (!c) return '—'
    if (c.is_company && c.company_name) return c.company_name
    return `${c.first_name} ${c.last_name}`
  }

  const filtered = quotes.filter(q => {
    if (filter !== 'all' && q.status !== filter) return false
    if (search) {
      const s = `${customerName(q)} ${q.reference || ''} ${q.title || ''}`.toLowerCase()
      if (!s.includes(search.toLowerCase())) return false
    }
    return true
  })

  const counts: Record<Filter, number> = {
    all: quotes.length,
    draft: quotes.filter(q => q.status === 'draft').length,
    sent: quotes.filter(q => q.status === 'sent').length,
    viewed: quotes.filter(q => q.status === 'viewed').length,
    approved: quotes.filter(q => q.status === 'approved').length,
    declined: quotes.filter(q => q.status === 'declined').length,
    converted: quotes.filter(q => q.status === 'converted').length,
    cancelled: quotes.filter(q => q.status === 'cancelled').length,
  }

  const totalValue = filtered.filter(q => !['declined','cancelled','archived'].includes(q.status)).reduce((s: number, q: any) => s + (q.total_gross || 0), 0)
  const approvedValue = filtered.filter(q => q.status === 'approved').reduce((s: number, q: any) => s + (q.total_gross || 0), 0)

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-white">Quotes</h1>
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 overflow-x-auto">
            {(['all','draft','sent','viewed','approved','declined','converted'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors capitalize font-medium whitespace-nowrap ${filter === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {f} {counts[f] > 0 && <span className={`ml-1 ${filter === f ? 'text-amber-400' : 'text-gray-600'}`}>{counts[f]}</span>}
              </button>
            ))}
          </div>
        </div>
        <a href="/quotes/new" className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg">+ New quote</a>
      </div>

      <div className="flex-1 px-6 py-5 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total value</div>
            <div className="text-xl font-bold text-blue-400">{formatCurrency(totalValue)}</div>
            <div className="text-xs text-gray-500 mt-1">{filtered.length} quotes</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Approved</div>
            <div className="text-xl font-bold text-emerald-400">{formatCurrency(approvedValue)}</div>
            <div className="text-xs text-gray-500 mt-1">{counts.approved} awaiting conversion</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Converted</div>
            <div className="text-xl font-bold text-amber-400">{counts.converted}</div>
            <div className="text-xs text-gray-500 mt-1">Became jobs</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/></svg>
          <input type="text" placeholder="Search customer or reference…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500"/>
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-3xl mb-3 opacity-20">📄</div>
              <div className="text-sm text-gray-600 mb-1">{search || filter !== 'all' ? 'No results' : 'No quotes yet'}</div>
              {!search && filter === 'all' && <a href="/quotes/new" className="mt-4 inline-block text-xs bg-amber-500 text-gray-950 font-bold px-4 py-2 rounded-xl hover:bg-amber-400">Create your first quote →</a>}
            </div>
          ) : (
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-gray-800">
                <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Quote</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Customer</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3 hidden md:table-cell">Date</th>
                <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Value</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-800/50">
                {filtered.map(q => (
                  <tr key={q.id} onClick={() => router.push(`/quotes/${q.id}`)} className="hover:bg-gray-800/40 cursor-pointer transition-colors group">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-gray-200 group-hover:text-white truncate max-w-48">{q.title || '—'}</div>
                      <div className="text-xs font-mono text-gray-600">{q.reference}</div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-400">{customerName(q)}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CONFIG[q.status]?.colour || 'text-gray-500 bg-gray-800'}`}>
                        {STATUS_CONFIG[q.status]?.label || q.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-xs text-gray-500">{formatDate(q.quote_date || q.created_at)}</td>
                    <td className="px-5 py-3 text-right text-sm font-semibold text-gray-200">{formatCurrency(q.total_gross || 0)}</td>
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