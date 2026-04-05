'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, formatDate } from '@/lib/supabase'

const STATUS_CONFIG: Record<string, { label: string; colour: string }> = {
  created:     { label: 'Created',     colour: 'text-gray-400 bg-gray-800' },
  assigned:    { label: 'Assigned',    colour: 'text-purple-300 bg-purple-900/50' },
  scheduled:   { label: 'Scheduled',   colour: 'text-blue-300 bg-blue-900/50' },
  in_progress: { label: 'In progress', colour: 'text-amber-300 bg-amber-900/50' },
  on_hold:     { label: 'On hold',     colour: 'text-orange-300 bg-orange-900/30' },
  complete:    { label: 'Complete',    colour: 'text-emerald-300 bg-emerald-900/50' },
  cancelled:   { label: 'Cancelled',   colour: 'text-gray-600 bg-gray-800' },
}

const FILTERS = ['all', 'created', 'assigned', 'scheduled', 'in_progress', 'on_hold', 'complete', 'cancelled'] as const
type Filter = typeof FILTERS[number]

export default function JobsListPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data } = await (supabase as any)
      .from('jobs')
      .select('*, customers(first_name, last_name, company_name, is_company), invoices(id, status, total_gross, invoice_type)')
      .order('created_at', { ascending: false })
    setJobs(data || [])
    setLoading(false)
  }

  function customerName(j: any) {
    const c = j.customers
    if (!c) return '—'
    if (c.is_company && c.company_name) return c.company_name
    return `${c.first_name} ${c.last_name}`
  }

  const filtered = jobs.filter(j => {
    if (filter !== 'all' && j.status !== filter) return false
    if (search) {
      const s = `${customerName(j)} ${j.reference || ''} ${j.title || ''}`.toLowerCase()
      if (!s.includes(search.toLowerCase())) return false
    }
    return true
  })

  const counts: Record<Filter, number> = {
    all: jobs.length,
    created: jobs.filter(j => j.status === 'created').length,
    assigned: jobs.filter(j => j.status === 'assigned').length,
    scheduled: jobs.filter(j => j.status === 'scheduled').length,
    in_progress: jobs.filter(j => j.status === 'in_progress').length,
    on_hold: jobs.filter(j => j.status === 'on_hold').length,
    complete: jobs.filter(j => j.status === 'complete').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  }

  const activeCount = jobs.filter(j => ['created','assigned','scheduled','in_progress'].includes(j.status)).length

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-white">Jobs</h1>
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 overflow-x-auto">
            {(['all','created','assigned','scheduled','in_progress','on_hold','complete'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors font-medium whitespace-nowrap ${filter === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {f === 'in_progress' ? 'In progress' : f === 'on_hold' ? 'On hold' : f.charAt(0).toUpperCase() + f.slice(1)}
                {counts[f] > 0 && <span className={`ml-1 ${filter === f ? 'text-amber-400' : 'text-gray-600'}`}>{counts[f]}</span>}
              </button>
            ))}
          </div>
        </div>
        <a href="/jobs/new" className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg">+ New job</a>
      </div>

      <div className="flex-1 px-6 py-5 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active', value: activeCount, sub: 'In progress + scheduled', colour: 'text-amber-400' },
            { label: 'Scheduled', value: counts.scheduled, sub: 'Booked in', colour: 'text-blue-400' },
            { label: 'In progress', value: counts.in_progress, sub: 'On site now', colour: 'text-amber-300' },
            { label: 'Complete', value: counts.complete, sub: 'This month', colour: 'text-emerald-400' },
          ].map(m => (
            <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{m.label}</div>
              <div className={`text-2xl font-bold ${m.colour}`}>{m.value}</div>
              <div className="text-xs text-gray-500 mt-1">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/></svg>
          <input placeholder="Search customer or reference…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500"/>
        </div>

        {/* List */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl py-20 text-center">
              <div className="text-3xl mb-3 opacity-20">🔧</div>
              <div className="text-sm text-gray-600 mb-1">{search || filter !== 'all' ? 'No results' : 'No jobs yet'}</div>
              {!search && filter === 'all' && <a href="/jobs/new" className="mt-4 inline-block text-xs bg-amber-500 text-gray-950 font-bold px-4 py-2 rounded-xl hover:bg-amber-400">Create your first job →</a>}
            </div>
          ) : filtered.map(j => {
            const invs = j.invoices || []
            const totalInvoiced = invs.reduce((s: number, i: any) => s + (i.total_gross || 0), 0)
            const totalPaid = invs.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + (i.total_gross || 0), 0)
            return (
              <div key={j.id} onClick={() => router.push(`/jobs/${j.id}`)}
                className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl px-5 py-4 cursor-pointer transition-colors group flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="text-sm font-semibold text-gray-200 group-hover:text-white truncate">{j.title || j.reference || '—'}</div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_CONFIG[j.status]?.colour || 'text-gray-500 bg-gray-800'}`}>{STATUS_CONFIG[j.status]?.label || j.status}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{customerName(j)}</span>
                    <span className="font-mono">{j.reference}</span>
                    {j.scheduled_start && <span>📅 {new Date(j.scheduled_start).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</span>}
                    {j.quote_id && <span className="text-blue-400">From quote</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-right">
                  {invs.length > 0 ? (
                    <div>
                      <div className="text-xs text-gray-500">{invs.length} invoice{invs.length !== 1 ? 's' : ''}</div>
                      {totalInvoiced > 0 && <div className="text-xs text-emerald-400">{totalPaid > 0 ? `£${totalPaid.toFixed(0)} paid` : `£${totalInvoiced.toFixed(0)} invoiced`}</div>}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-700">No invoices</div>
                  )}
                  <svg className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}