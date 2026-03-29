'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, formatCurrency, formatDate, isQuote, isJob, isInvoice, daysUntil } from '@/lib/supabase'

function DashboardInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isWelcome = searchParams.get('welcome') === '1'

  const [account, setAccount] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [works, setWorks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [compliance, setCompliance] = useState<any[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: u } = await (supabase as any)
      .from('users').select('*, accounts(*)').eq('id', session.user.id).single()

    // Only redirect to onboarding if we got a clean null — not a cache error
    if (u !== null && !u?.account_id) { router.push('/onboarding'); return }

    setUser(u)
    setAccount(u.accounts)

    const { data: w } = await (supabase as any)
      .from('works')
      .select('*, customers(first_name, last_name, company_name, is_company, postcode)')
      .order('updated_at', { ascending: false })
      .limit(50)

    setWorks(w || [])

    // Load compliance records expiring in next 60 days
    const soon = new Date()
    soon.setDate(soon.getDate() + 60)
    const { data: comp } = await (supabase as any)
      .from('compliance_records')
      .select('id, name, type, expiry_date')
      .eq('is_active', true)
      .lte('expiry_date', soon.toISOString().split('T')[0])
      .order('expiry_date', { ascending: true })
    setCompliance(comp || [])

    setLoading(false)
  }

  // Metrics
  const activeJobs = works.filter(w => w.status === 'job_in_progress' || w.status === 'job_scheduled').length
  const openQuotes = works.filter(w => isQuote(w.status) && w.status !== 'quote_declined' && w.status !== 'archived')
  const openQuoteValue = openQuotes.reduce((s, w) => s + (w.total_gross || 0), 0)
  const overdueInvoices = works.filter(w => w.status === 'invoice_overdue')
  const overdueValue = overdueInvoices.reduce((s, w) => s + (w.amount_due || 0), 0)
  const paidThisMonth = works.filter(w => {
    if (w.status !== 'invoice_paid') return false
    const d = new Date(w.updated_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((s, w) => s + (w.total_gross || 0), 0)

  // Filtered recent works
  const filtered = works.filter(w => {
    if (!search) return true
    const c = w.customers
    const name = `${c?.first_name || ''} ${c?.last_name || ''} ${c?.company_name || ''} ${w.reference || ''}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  function customerName(w: any) {
    const c = w.customers
    if (!c) return '—'
    if (c.is_company && c.company_name) return c.company_name
    return `${c.first_name} ${c.last_name}`
  }

  const statusColour: Record<string, string> = {
    draft: 'text-gray-500 bg-gray-800',
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
    archived: 'text-gray-700 bg-gray-900',
  }

  const statusLabel: Record<string, string> = {
    draft: 'Draft', quote_sent: 'Quote sent', quote_viewed: 'Viewed',
    quote_accepted: 'Accepted', quote_declined: 'Declined',
    job_scheduled: 'Scheduled', job_in_progress: 'In progress', job_complete: 'Complete',
    invoice_sent: 'Invoice sent', invoice_viewed: 'Invoice viewed',
    invoice_partially_paid: 'Part paid', invoice_paid: 'Paid',
    invoice_overdue: 'Overdue', cancelled: 'Cancelled', archived: 'Archived',
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-sm text-gray-600">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">


      <div className="px-6 py-6 space-y-5 max-w-screen-2xl mx-auto">

        {/* Welcome banner */}
        {isWelcome && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="#f59e0b">
                <path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-amber-300">Welcome to TradeStack, {user?.full_name?.split(' ')[0] || 'there'}</div>
              <div className="text-xs text-amber-500/70 mt-0.5">Your account is set up. Create your first quote or job to get started.</div>
            </div>
            <a href="/works/new" className="text-xs text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg hover:bg-amber-500/10 transition-colors flex-shrink-0">
              Create first job →
            </a>
          </div>
        )}

        {/* Overdue invoices alert */}
        {overdueInvoices.length > 0 && (
          <div className="bg-red-500/8 border border-red-500/20 rounded-2xl px-5 py-3 flex items-center gap-3">
            <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"/>
            <div className="flex-1 text-sm text-red-300">
              {overdueInvoices.length} overdue invoice{overdueInvoices.length > 1 ? 's' : ''} — {formatCurrency(overdueValue)} outstanding
            </div>
            <a href="/works" className="text-xs text-red-400 font-medium hover:text-red-300 flex-shrink-0">View →</a>
          </div>
        )}

        {/* Trial banner */}
        {account?.status === 'trial' && account?.trial_ends_at && (() => {
          const days = Math.ceil((new Date(account.trial_ends_at).getTime() - Date.now()) / 86400000)
          if (days > 14) return null
          return (
            <div className={`border rounded-2xl px-5 py-3 flex items-center gap-3 ${days <= 3 ? 'bg-red-500/8 border-red-500/20' : 'bg-amber-500/8 border-amber-500/20'}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${days <= 3 ? 'bg-red-500' : 'bg-amber-500'}`}/>
              <div className="flex-1 text-sm">
                <span className={days <= 3 ? 'text-red-300' : 'text-amber-300'}>
                  {days <= 0 ? 'Your free trial has ended' : `${days} day${days === 1 ? '' : 's'} left on your free trial`}
                </span>
              </div>
              <a href="/pricing" className={`text-xs font-bold flex-shrink-0 px-3 py-1.5 rounded-lg ${days <= 3 ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-amber-500 text-gray-950 hover:bg-amber-400'}`}>
                Upgrade →
              </a>
            </div>
          )
        })()}

        {/* Compliance expiry alerts */}
        {compliance.length > 0 && (
          <div className="space-y-2">
            {compliance.map(c => {
              const days = daysUntil(c.expiry_date)
              const expired = days !== null && days < 0
              const urgent = days !== null && days <= 14
              return (
                <div key={c.id} className={`border rounded-2xl px-5 py-3 flex items-center gap-3 ${
                  expired ? 'bg-red-500/8 border-red-500/20' :
                  urgent  ? 'bg-red-500/5 border-red-500/15' :
                            'bg-amber-500/5 border-amber-500/15'
                }`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${expired || urgent ? 'bg-red-500' : 'bg-amber-500'}`}/>
                  <div className="flex-1 text-sm">
                    <span className={expired || urgent ? 'text-red-300' : 'text-amber-300'}>
                      {expired
                        ? `${c.name} expired ${Math.abs(days!)}d ago`
                        : `${c.name} expires in ${days}d`}
                    </span>
                  </div>
                  <a href="/compliance" className={`text-xs font-medium flex-shrink-0 ${expired || urgent ? 'text-red-400 hover:text-red-300' : 'text-amber-400 hover:text-amber-300'}`}>
                    Renew →
                  </a>
                </div>
              )
            })}
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: `Revenue — ${new Date().toLocaleDateString('en-GB', { month: 'long' })}`, value: formatCurrency(paidThisMonth), sub: 'Paid invoices', colour: 'text-amber-400', positive: paidThisMonth > 0 },
            { label: 'Overdue', value: formatCurrency(overdueValue), sub: `${overdueInvoices.length} invoice${overdueInvoices.length !== 1 ? 's' : ''}`, colour: overdueValue > 0 ? 'text-red-400' : 'text-gray-500', positive: false },
            { label: 'Open quotes', value: formatCurrency(openQuoteValue), sub: `${openQuotes.length} awaiting response`, colour: 'text-blue-400', positive: openQuotes.length > 0 },
            { label: 'Active jobs', value: String(activeJobs), sub: 'In progress + scheduled', colour: 'text-emerald-400', positive: activeJobs > 0 },
          ].map(m => (
            <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{m.label}</div>
              <div className={`text-2xl font-bold ${m.colour}`}>{m.value}</div>
              <div className="text-xs text-gray-400 mt-1.5">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Works table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-white">Recent work</span>
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/>
              </svg>
              <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500"/>
            </div>
            <a href="/works" className="text-xs text-amber-400 hover:text-amber-300 ml-auto">View all →</a>
          </div>

          {filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-4xl mb-4 opacity-10">📋</div>
              <div className="text-sm font-medium text-gray-400 mb-1">No work yet</div>
              <div className="text-xs text-gray-500 mb-5">Create your first quote or job to get started</div>
              <a href="/works/new" className="text-xs bg-amber-500 text-gray-950 font-bold px-5 py-2.5 rounded-xl hover:bg-amber-400 transition-colors">
                + New job or quote
              </a>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Ref', 'Customer', 'Type', 'Status', 'Value', 'Updated'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 20).map(w => {
                    const daysAgo = Math.floor((Date.now() - new Date(w.updated_at).getTime()) / 86400000)
                    const updLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`
                    const type = isQuote(w.status) ? 'Quote' : isJob(w.status) ? 'Job' : isInvoice(w.status) ? 'Invoice' : '—'
                    return (
                      <tr key={w.id}
                        onClick={() => router.push(`/works/${w.id}`)}
                        className="border-b border-gray-800/50 hover:bg-gray-800/40 cursor-pointer transition-colors group">
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-gray-500 group-hover:text-amber-400 transition-colors">
                            {w.reference || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-200">{customerName(w)}</div>
                          <div className="text-xs text-gray-400">{w.customers?.postcode}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-400">{type}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColour[w.status] || 'text-gray-500 bg-gray-800'}`}>
                            {statusLabel[w.status] || w.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`text-sm font-semibold ${w.status === 'invoice_overdue' ? 'text-red-400' : 'text-gray-200'}`}>
                            {formatCurrency(w.total_gross || 0)}
                          </div>
                          {w.amount_due > 0 && w.amount_due < w.total_gross && (
                            <div className="text-xs text-amber-400">{formatCurrency(w.amount_due)} due</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-400">{updLabel}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length > 20 && (
                <div className="px-4 py-3 text-center border-t border-gray-800">
                  <a href="/works" className="text-xs text-amber-400 hover:text-amber-300">
                    View all {filtered.length} records →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'New quote', href: '/works/new?type=quote', icon: '📄' },
            { label: 'New job', href: '/works/new?type=job', icon: '🔧' },
            { label: 'New invoice', href: '/works/new?type=invoice', icon: '💰' },
            { label: 'All work', href: '/works', icon: '📋' },
          ].map(a => (
            <a key={a.label} href={a.href}
              className="bg-gray-900 border border-gray-800 hover:border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 transition-colors group">
              <span className="text-xl">{a.icon}</span>
              <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">{a.label}</span>
            </a>
          ))}
        </div>

      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>}>
      <DashboardInner/>
    </Suspense>
  )
}