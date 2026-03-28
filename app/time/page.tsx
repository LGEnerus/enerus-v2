'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, formatCurrency } from '@/lib/supabase'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function startOfWeek(d: Date): Date {
  const day = new Date(d)
  const dow = day.getDay()
  day.setDate(day.getDate() - (dow === 0 ? 6 : dow - 1))
  day.setHours(0, 0, 0, 0)
  return day
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
function dateKey(d: Date): string {
  return d.toISOString().split('T')[0]
}

export default function TimeTrackingPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<any[]>([])
  const [works, setWorks] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')

  const [form, setForm] = useState({
    work_id: '',
    user_id: '',
    started_at: new Date().toISOString().slice(0, 16),
    ended_at: '',
    duration_minutes: '',
    billable: true,
    description: '',
    hourly_rate: '',
  })

  useEffect(() => { load() }, [weekStart])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setCurrentUserId(session.user.id)

    const { data: u } = await (supabase as any).from('users').select('account_id, hourly_rate').eq('id', session.user.id).single()
    if (!u?.account_id) return
    setAccountId(u.account_id)

    const weekEnd = addDays(weekStart, 7)

    const [{ data: ents }, { data: ws }, { data: us }] = await Promise.all([
      (supabase as any).from('time_entries').select('*, works(reference, customers(first_name, last_name, company_name, is_company)), users(full_name)')
        .gte('started_at', weekStart.toISOString())
        .lt('started_at', weekEnd.toISOString())
        .order('started_at'),
      (supabase as any).from('works').select('id, reference, customers(first_name, last_name, company_name, is_company)')
        .in('status', ['job_scheduled', 'job_in_progress', 'job_complete'])
        .order('updated_at', { ascending: false })
        .limit(50),
      (supabase as any).from('users').select('id, full_name, hourly_rate').order('full_name'),
    ])

    setEntries(ents || [])
    setWorks(ws || [])
    setUsers(us || [])
    setForm(p => ({ ...p, user_id: session.user.id, hourly_rate: u?.hourly_rate?.toString() || '' }))
    setLoading(false)
  }

  async function saveEntry() {
    setSaving(true); setError('')
    try {
      const startDt = new Date(form.started_at)
      let durationMins = 0
      let endDt: Date | null = null

      if (form.ended_at) {
        endDt = new Date(form.ended_at)
        durationMins = Math.round((endDt.getTime() - startDt.getTime()) / 60000)
      } else if (form.duration_minutes) {
        durationMins = parseInt(form.duration_minutes)
        endDt = new Date(startDt.getTime() + durationMins * 60000)
      }

      const { error: err } = await (supabase as any).from('time_entries').insert({
        account_id: accountId,
        work_id: form.work_id || null,
        user_id: form.user_id,
        started_at: startDt.toISOString(),
        ended_at: endDt?.toISOString() || null,
        duration_minutes: durationMins,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        billable: form.billable,
        description: form.description || null,
      })
      if (err) throw err

      setShowNew(false)
      setForm(p => ({ ...p, work_id: '', started_at: new Date().toISOString().slice(0, 16), ended_at: '', duration_minutes: '', description: '' }))
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  // Group entries by day for the week grid
  const byDay = useMemo(() => {
    const groups: Record<string, any[]> = {}
    for (let i = 0; i < 7; i++) {
      groups[dateKey(addDays(weekStart, i))] = []
    }
    entries.forEach(e => {
      const k = dateKey(new Date(e.started_at))
      if (groups[k]) groups[k].push(e)
    })
    return groups
  }, [entries, weekStart])

  const weekTotal = entries.reduce((s, e) => s + (e.duration_minutes || 0), 0)
  const weekBillable = entries.filter(e => e.billable).reduce((s, e) => s + (e.duration_minutes || 0), 0)
  const weekValue = entries.filter(e => e.billable && e.hourly_rate).reduce((s, e) => s + ((e.duration_minutes / 60) * e.hourly_rate), 0)

  function workLabel(w: any): string {
    if (!w) return '—'
    const c = w.customers
    const name = c?.is_company ? c.company_name : `${c?.first_name || ''} ${c?.last_name || ''}`.trim()
    return `${w.reference || '—'} · ${name}`
  }

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-500 mb-1.5"
  const today = dateKey(new Date())

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-white">Time tracking</h1>
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg">
            <button onClick={() => setWeekStart(d => addDays(d, -7))} className="px-2.5 py-1.5 text-gray-500 hover:text-gray-300 text-sm">‹</button>
            <span className="text-xs font-medium text-gray-300 px-1">
              {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {addDays(weekStart, 6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
            <button onClick={() => setWeekStart(d => addDays(d, 7))} className="px-2.5 py-1.5 text-gray-500 hover:text-gray-300 text-sm">›</button>
          </div>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="text-xs text-gray-500 border border-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-800">This week</button>
        </div>
        <button onClick={() => setShowNew(true)} className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg">
          + Log time
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Total hours</div>
            <div className="text-2xl font-bold text-white">{fmtMins(weekTotal)}</div>
            <div className="text-xs text-gray-600 mt-1">{entries.length} entries</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Billable hours</div>
            <div className="text-2xl font-bold text-amber-400">{fmtMins(weekBillable)}</div>
            <div className="text-xs text-gray-600 mt-1">{weekTotal > 0 ? Math.round((weekBillable / weekTotal) * 100) : 0}% of total</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Billable value</div>
            <div className="text-2xl font-bold text-emerald-400">{formatCurrency(weekValue)}</div>
            <div className="text-xs text-gray-600 mt-1">Based on hourly rates</div>
          </div>
        </div>

        {/* Week grid */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-800">
            {DAYS.map((day, i) => {
              const d = addDays(weekStart, i)
              const dk = dateKey(d)
              const isToday = dk === today
              const dayMins = (byDay[dk] || []).reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0)
              return (
                <div key={day} className={`p-3 text-center border-r border-gray-800 last:border-r-0 ${isToday ? 'bg-amber-500/5' : ''}`}>
                  <div className={`text-xs font-medium ${isToday ? 'text-amber-400' : 'text-gray-500'}`}>{day}</div>
                  <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-amber-400' : 'text-gray-300'}`}>{d.getDate()}</div>
                  {dayMins > 0 && <div className="text-xs text-gray-600 mt-0.5">{fmtMins(dayMins)}</div>}
                </div>
              )
            })}
          </div>

          {/* Entries per day */}
          <div className="grid grid-cols-7 min-h-32">
            {DAYS.map((day, i) => {
              const dk = dateKey(addDays(weekStart, i))
              const dayEntries = byDay[dk] || []
              const isToday = dk === today
              return (
                <div key={day} className={`p-2 border-r border-gray-800/50 last:border-r-0 ${isToday ? 'bg-amber-500/3' : ''}`}>
                  {dayEntries.map((e: any) => (
                    <div key={e.id} className={`mb-1 px-2 py-1.5 rounded-lg text-xs ${e.billable ? 'bg-amber-900/40 border border-amber-700/30' : 'bg-gray-800 border border-gray-700'}`}>
                      <div className={`font-medium truncate ${e.billable ? 'text-amber-300' : 'text-gray-400'}`}>
                        {e.duration_minutes ? fmtMins(e.duration_minutes) : '—'}
                      </div>
                      <div className="text-gray-600 truncate mt-0.5">
                        {e.works?.reference || 'No job'}
                      </div>
                      {e.description && <div className="text-gray-700 truncate">{e.description}</div>}
                    </div>
                  ))}
                  <button onClick={() => { setShowNew(true); setForm(p => ({ ...p, started_at: addDays(weekStart, i).toISOString().slice(0,10) + 'T08:00' })) }}
                    className="w-full mt-1 py-1 text-xs text-gray-700 hover:text-amber-400 hover:bg-amber-500/5 rounded transition-colors">
                    +
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* All entries table */}
        {entries.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-600 uppercase tracking-wide">All entries this week</div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-600 px-5 py-2.5">Staff</th>
                  <th className="text-left text-xs font-medium text-gray-600 px-3 py-2.5">Job</th>
                  <th className="text-left text-xs font-medium text-gray-600 px-3 py-2.5 hidden md:table-cell">Description</th>
                  <th className="text-right text-xs font-medium text-gray-600 px-3 py-2.5">Duration</th>
                  <th className="text-right text-xs font-medium text-gray-600 px-5 py-2.5">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-gray-800/30">
                    <td className="px-5 py-3">
                      <div className="text-sm text-gray-200">{e.users?.full_name || '—'}</div>
                      <div className="text-xs text-gray-600">{new Date(e.started_at).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}</div>
                    </td>
                    <td className="px-3 py-3">
                      {e.works ? (
                        <a href={`/works/${e.work_id}`} className="text-xs text-amber-400 hover:text-amber-300">{e.works.reference}</a>
                      ) : <span className="text-xs text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span className="text-xs text-gray-500">{e.description || '—'}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`text-sm font-medium ${e.billable ? 'text-amber-400' : 'text-gray-500'}`}>
                        {e.duration_minutes ? fmtMins(e.duration_minutes) : '—'}
                      </span>
                      {!e.billable && <div className="text-xs text-gray-700">non-billable</div>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm text-gray-300">
                        {e.billable && e.hourly_rate && e.duration_minutes
                          ? formatCurrency((e.duration_minutes / 60) * e.hourly_rate)
                          : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New entry modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowNew(false) }}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <div className="text-base font-bold text-white">Log time</div>
              <button onClick={() => setShowNew(false)} className="text-gray-600 hover:text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Staff member</label>
                <select className={inp} value={form.user_id} onChange={e => {
                  const u = users.find(x => x.id === e.target.value)
                  setForm(p => ({ ...p, user_id: e.target.value, hourly_rate: u?.hourly_rate?.toString() || p.hourly_rate }))
                }}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Job (optional)</label>
                <select className={inp} value={form.work_id} onChange={e => setForm(p => ({ ...p, work_id: e.target.value }))}>
                  <option value="">No job / general</option>
                  {works.map(w => <option key={w.id} value={w.id}>{workLabel(w)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Start time</label>
                  <input type="datetime-local" className={inp} value={form.started_at} onChange={e => setForm(p => ({ ...p, started_at: e.target.value }))}/>
                </div>
                <div>
                  <label className={lbl}>End time</label>
                  <input type="datetime-local" className={inp} value={form.ended_at} onChange={e => setForm(p => ({ ...p, ended_at: e.target.value }))}/>
                </div>
              </div>
              <div>
                <label className={lbl}>Or enter duration (minutes)</label>
                <input type="number" min="0" step="15" className={inp} value={form.duration_minutes}
                  onChange={e => setForm(p => ({ ...p, duration_minutes: e.target.value }))}
                  placeholder="e.g. 90"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Hourly rate (£)</label>
                  <input type="number" step="0.5" min="0" className={inp} value={form.hourly_rate}
                    onChange={e => setForm(p => ({ ...p, hourly_rate: e.target.value }))}/>
                </div>
                <div className="flex items-end pb-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setForm(p => ({ ...p, billable: !p.billable }))}
                      className={`w-9 h-5 rounded-full transition-colors relative ${form.billable ? 'bg-amber-500' : 'bg-gray-700'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.billable ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                    </button>
                    <span className="text-sm text-gray-300">Billable</span>
                  </div>
                </div>
              </div>
              <div>
                <label className={lbl}>Description</label>
                <input className={inp} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="What was done…"/>
              </div>
              {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
              <div className="flex gap-3 pt-1">
                <button onClick={saveEntry} disabled={saving}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold text-sm py-3 rounded-xl">
                  {saving ? 'Saving…' : 'Log time'}
                </button>
                <button onClick={() => setShowNew(false)} className="px-5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}