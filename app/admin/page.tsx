'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, formatCurrency } from '@/lib/supabase'

type Tab = 'overview' | 'accounts' | 'activity' | 'feedback'

export default function AdminDashboard() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<any[]>([])
  const [recentViews, setRecentViews] = useState<any[]>([])
  const [feedback, setFeedback] = useState<any[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: u } = await (supabase as any)
      .from('users').select('role').eq('id', session.user.id).single()
    if (u?.role !== 'admin') { router.push('/dashboard'); return }

    const [{ data: accs }, { data: views }, { data: fb }] = await Promise.all([
      (supabase as any).from('accounts').select(`*, users(id, email, full_name, last_seen_at), works(id, total_gross, status, created_at)`).order('created_at', { ascending: false }),
      (supabase as any).from('page_views').select(`*, users(email, full_name), accounts(business_name)`).order('created_at', { ascending: false }).limit(200),
      (supabase as any).from('feedback').select(`*, users(email, full_name), accounts(business_name)`).order('created_at', { ascending: false }),
    ])

    setAccounts(accs || [])
    setRecentViews(views || [])
    setFeedback(fb || [])
    setLoading(false)
  }

  const totalAccounts = accounts.length
  const activeAccounts = accounts.filter(a => a.status === 'active').length
  const trialAccounts = accounts.filter(a => a.status === 'trial').length
  const premiumAccounts = accounts.filter(a => a.plan === 'business' && a.status === 'active').length
  const basicAccounts = accounts.filter(a => a.plan === 'solo' && a.status === 'active').length
  const mrr = (premiumAccounts * 30) + (basicAccounts * 15)
  const totalRevenue = accounts.reduce((s, a) => s + (a.works || []).reduce((ws: number, w: any) => ws + (w.total_gross || 0), 0), 0)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const activeThisWeek = accounts.filter(a => (a.users || []).some((u: any) => u.last_seen_at && u.last_seen_at > sevenDaysAgo)).length
  const avgRating = feedback.length > 0 ? feedback.reduce((s, f) => s + (f.rating || 0), 0) / feedback.length : 0

  const pageCounts = recentViews.reduce((acc: any, v) => { acc[v.path] = (acc[v.path] || 0) + 1; return acc }, {})
  const topPages = Object.entries(pageCounts).sort(([,a]: any, [,b]: any) => b - a).slice(0, 10)

  const filtered = accounts.filter(a => {
    if (!search) return true
    const s = search.toLowerCase()
    return a.business_name?.toLowerCase().includes(s) || (a.users || []).some((u: any) => u.email?.toLowerCase().includes(s))
  })

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <span className="text-xs bg-red-900/50 text-red-300 border border-red-700/30 px-2 py-0.5 rounded-full font-medium">ADMIN</span>
          <h1 className="text-sm font-semibold text-white">Platform overview</h1>
        </div>
        <a href="/dashboard" className="text-xs text-gray-500 hover:text-gray-300">← My account</a>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total accounts', value: totalAccounts, sub: `${trialAccounts} on trial`, colour: 'text-white' },
            { label: 'Active subscribers', value: activeAccounts, sub: `${premiumAccounts} premium · ${basicAccounts} basic`, colour: 'text-emerald-400' },
            { label: 'MRR', value: `£${mrr.toLocaleString()}`, sub: `£${(mrr * 12).toLocaleString()} ARR`, colour: 'text-amber-400' },
            { label: 'Active this week', value: activeThisWeek, sub: `${totalAccounts > 0 ? Math.round((activeThisWeek/totalAccounts)*100) : 0}% engagement`, colour: 'text-blue-400' },
          ].map(k => (
            <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">{k.label}</div>
              <div className={`text-2xl font-bold ${k.colour}`}>{k.value}</div>
              <div className="text-xs text-gray-600 mt-1">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total jobs tracked', value: accounts.reduce((s,a) => s+(a.works||[]).length,0), colour: 'text-white' },
            { label: 'Revenue through platform', value: formatCurrency(totalRevenue), colour: 'text-amber-400' },
            { label: 'Page views logged', value: recentViews.length, colour: 'text-white' },
            { label: 'Avg usability rating', value: avgRating > 0 ? `${avgRating.toFixed(1)} ★` : '—', colour: avgRating >= 4 ? 'text-emerald-400' : avgRating >= 3 ? 'text-amber-400' : 'text-red-400' },
          ].map(k => (
            <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">{k.label}</div>
              <div className={`text-2xl font-bold ${k.colour}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {(['overview','accounts','activity','feedback'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs px-4 py-2 rounded-lg capitalize font-medium transition-colors ${tab===t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {t==='accounts' ? `Accounts (${totalAccounts})` : t==='feedback' ? `Feedback (${feedback.length})` : t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-white mb-4">Plan breakdown</div>
              {[
                { label: 'Premium active', count: premiumAccounts, colour: 'bg-amber-500' },
                { label: 'Basic active', count: basicAccounts, colour: 'bg-blue-500' },
                { label: 'Trial', count: trialAccounts, colour: 'bg-purple-500' },
                { label: 'Cancelled', count: accounts.filter(a=>a.status==='cancelled').length, colour: 'bg-gray-600' },
                { label: 'Past due', count: accounts.filter(a=>a.status==='past_due').length, colour: 'bg-red-500' },
              ].map(p => (
                <div key={p.label} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{p.label}</span>
                    <span className="text-gray-200 font-medium">{p.count}</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div className={`${p.colour} h-1.5 rounded-full`} style={{ width: totalAccounts > 0 ? `${(p.count/totalAccounts)*100}%` : '0%' }}/>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-white mb-4">Most visited pages</div>
              {topPages.length === 0
                ? <div className="text-xs text-gray-600">No page view data yet</div>
                : topPages.map(([path, count]: any) => (
                  <div key={path} className="flex items-center gap-3 mb-2">
                    <div className="flex-1 text-xs text-gray-400 font-mono truncate">{path}</div>
                    <div className="text-xs text-gray-200 font-semibold w-8 text-right">{count}</div>
                    <div className="w-20 bg-gray-800 rounded-full h-1">
                      <div className="bg-amber-500 h-1 rounded-full" style={{ width: `${(count/(topPages[0][1] as number))*100}%` }}/>
                    </div>
                  </div>
                ))}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-white mb-4">Top accounts by revenue tracked</div>
              {[...accounts].map(a => ({ ...a, rev: (a.works||[]).reduce((s:number,w:any)=>s+(w.total_gross||0),0) }))
                .sort((a,b)=>b.rev-a.rev).slice(0,8).map(a => (
                <div key={a.id} className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-400 truncate flex-1">{a.business_name}</span>
                  <span className="text-amber-400 font-semibold ml-4">{formatCurrency(a.rev)}</span>
                </div>
              ))}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-white mb-4">Recent signups</div>
              {accounts.slice(0,8).map(a => (
                <div key={a.id} className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold flex-shrink-0">
                    {(a.business_name||'?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 truncate">{a.business_name}</div>
                    <div className="text-xs text-gray-600">{(a.users||[])[0]?.email||'—'}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status==='active'?'bg-emerald-900/50 text-emerald-300':a.status==='trial'?'bg-amber-900/50 text-amber-300':'bg-gray-800 text-gray-500'}`}>
                    {a.plan}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'accounts' && (
          <div className="space-y-3">
            <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 w-64"/>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-gray-800">
                  {['Business','Owner','Plan','Jobs','Revenue','Last active','Joined'].map(h=>(
                    <th key={h} className={`text-xs font-medium text-gray-600 px-4 py-3 ${h==='Business'||h==='Owner'?'text-left':'text-right'}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filtered.map(a => {
                    const rev = (a.works||[]).reduce((s:number,w:any)=>s+(w.total_gross||0),0)
                    const owner = (a.users||[])[0]
                    const lastSeen = (a.users||[]).reduce((l:string,u:any)=>u.last_seen_at>l?u.last_seen_at:l,'')
                    const recent = lastSeen && new Date(lastSeen) > new Date(Date.now()-7*86400000)
                    return (
                      <tr key={a.id} className="hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {recent && <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"/>}
                            <div className="text-sm text-gray-200">{a.business_name}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-400">{owner?.full_name||'—'}</div>
                          <div className="text-xs text-gray-600">{owner?.email||'—'}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status==='active'&&a.plan==='business'?'bg-amber-900/50 text-amber-300':a.status==='active'?'bg-emerald-900/50 text-emerald-300':a.status==='trial'?'bg-purple-900/50 text-purple-300':'bg-gray-800 text-gray-500'}`}>
                            {a.plan} · {a.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-400">{(a.works||[]).length}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-amber-400">{formatCurrency(rev)}</td>
                        <td className="px-4 py-3 text-right text-xs text-gray-600">{lastSeen?new Date(lastSeen).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'—'}</td>
                        <td className="px-4 py-3 text-right text-xs text-gray-600">{a.created_at?new Date(a.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-600 uppercase tracking-wide">Recent page views</div>
            {recentViews.length===0
              ? <div className="py-12 text-center text-sm text-gray-600">No data yet — page tracking activates once users are using the platform</div>
              : <table className="w-full">
                <thead><tr className="border-b border-gray-800">
                  {['User','Account','Page','Time'].map(h=>(
                    <th key={h} className={`text-xs font-medium text-gray-600 px-4 py-2.5 ${h==='Time'?'text-right':'text-left'}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-800/50">
                  {recentViews.map(v=>(
                    <tr key={v.id}>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{v.users?.email||'—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{v.accounts?.business_name||'—'}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-gray-400">{v.path}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-600">{new Date(v.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>
        )}

        {tab === 'feedback' && (
          <div className="space-y-3">
            {feedback.length===0
              ? <div className="bg-gray-900 border border-gray-800 rounded-2xl py-16 text-center">
                  <div className="text-3xl mb-3 opacity-20">💬</div>
                  <div className="text-sm text-gray-600">No feedback submitted yet</div>
                </div>
              : feedback.map(f=>(
                <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-gray-200">{f.users?.full_name||f.users?.email}</div>
                      <div className="text-xs text-gray-500">{f.accounts?.business_name} · {f.page}</div>
                    </div>
                    <div className="flex">{[1,2,3,4,5].map(n=><span key={n} className={n<=(f.rating||0)?'text-amber-400':'text-gray-700'}>★</span>)}</div>
                  </div>
                  {f.message&&<div className="text-sm text-gray-400 bg-gray-800 rounded-lg p-3">{f.message}</div>}
                  <div className="text-xs text-gray-700 mt-2">{new Date(f.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}