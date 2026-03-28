'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7) // 7am - 7pm

const TRADE_COLOURS: Record<string, string> = {
  plumbing: 'bg-blue-900/70 border-blue-600/50 text-blue-200',
  heating: 'bg-orange-900/70 border-orange-600/50 text-orange-200',
  electrical: 'bg-yellow-900/70 border-yellow-600/50 text-yellow-200',
  gas: 'bg-red-900/70 border-red-600/50 text-red-200',
  building: 'bg-stone-800/70 border-stone-600/50 text-stone-200',
  renewables: 'bg-emerald-900/70 border-emerald-600/50 text-emerald-200',
  general: 'bg-purple-900/70 border-purple-600/50 text-purple-200',
  other: 'bg-gray-800/70 border-gray-600/50 text-gray-200',
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function isToday(date: Date): boolean {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

export default function CalendarPage() {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [works, setWorks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'week' | 'month'>('week')

  useEffect(() => { load() }, [weekStart])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const weekEnd = addDays(weekStart, 7)

    const { data } = await (supabase as any)
      .from('works')
      .select('id, reference, trade_type, status, scheduled_start, scheduled_end, customers(first_name, last_name, company_name, is_company, address_line1)')
      .not('scheduled_start', 'is', null)
      .gte('scheduled_start', weekStart.toISOString())
      .lt('scheduled_start', weekEnd.toISOString())
      .order('scheduled_start')

    setWorks(data || [])
    setLoading(false)
  }

  function prevWeek() { setWeekStart(d => addDays(d, -7)) }
  function nextWeek() { setWeekStart(d => addDays(d, 7)) }
  function goToday() { setWeekStart(startOfWeek(new Date())) }

  function getJobsForDay(dayIndex: number): any[] {
    const day = addDays(weekStart, dayIndex)
    return works.filter(w => {
      if (!w.scheduled_start) return false
      const d = new Date(w.scheduled_start)
      return d.toDateString() === day.toDateString()
    })
  }

  function getJobTop(work: any): number {
    const start = new Date(work.scheduled_start)
    const hour = start.getHours() + start.getMinutes() / 60
    return Math.max(0, (hour - 7) * 60) // 60px per hour, starts at 7am
  }

  function getJobHeight(work: any): number {
    if (!work.scheduled_end) return 60
    const start = new Date(work.scheduled_start)
    const end = new Date(work.scheduled_end)
    const mins = (end.getTime() - start.getTime()) / 60000
    return Math.max(30, mins)
  }

  function customerName(w: any): string {
    const c = w.customers
    if (!c) return '—'
    if (c.is_company && c.company_name) return c.company_name
    return `${c.first_name} ${c.last_name}`
  }

  const weekLabel = `${formatDay(weekStart)} — ${formatDay(addDays(weekStart, 6))}`
  const totalThisWeek = works.length

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-sm text-gray-600">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20 flex-shrink-0">
        <h1 className="text-sm font-semibold text-white">Calendar</h1>
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg">
          <button onClick={prevWeek} className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-sm">‹</button>
          <span className="text-xs font-medium text-gray-300 px-2">{weekLabel}</span>
          <button onClick={nextWeek} className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-sm">›</button>
        </div>
        <button onClick={goToday} className="text-xs text-gray-500 border border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors">
          Today
        </button>
        <span className="text-xs text-gray-600">{totalThisWeek} job{totalThisWeek !== 1 ? 's' : ''} this week</span>
        <div className="ml-auto">
          <a href="/works/new?type=job" className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            + Schedule job
          </a>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-8 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <div className="border-r border-gray-800 p-3"/>
        {DAYS.map((day, i) => {
          const date = addDays(weekStart, i)
          const today = isToday(date)
          const dayJobs = getJobsForDay(i)
          return (
            <div key={day} className={`border-r border-gray-800 p-3 text-center ${i === 6 ? '' : ''}`}>
              <div className={`text-xs font-medium ${today ? 'text-amber-400' : 'text-gray-500'}`}>{day}</div>
              <div className={`text-lg font-bold mt-0.5 ${today ? 'text-amber-400' : 'text-gray-300'}`}>
                {date.getDate()}
              </div>
              {dayJobs.length > 0 && (
                <div className={`text-xs mt-0.5 ${today ? 'text-amber-500' : 'text-gray-600'}`}>
                  {dayJobs.length} job{dayJobs.length > 1 ? 's' : ''}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-8 relative" style={{ minHeight: `${HOURS.length * 60}px` }}>
          {/* Hour labels */}
          <div className="border-r border-gray-800">
            {HOURS.map(h => (
              <div key={h} className="h-[60px] flex items-start pt-1 px-2 border-b border-gray-800/50">
                <span className="text-xs text-gray-700">{h}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((day, dayIndex) => {
            const date = addDays(weekStart, dayIndex)
            const today = isToday(date)
            const dayJobs = getJobsForDay(dayIndex)

            return (
              <div key={day} className={`border-r border-gray-800 relative ${today ? 'bg-amber-500/3' : ''}`}>
                {/* Hour grid lines */}
                {HOURS.map(h => (
                  <div key={h} className="h-[60px] border-b border-gray-800/30"/>
                ))}

                {/* Jobs */}
                {dayJobs.map(work => {
                  const top = getJobTop(work)
                  const height = getJobHeight(work)
                  const colour = TRADE_COLOURS[work.trade_type] || TRADE_COLOURS.other
                  const startTime = new Date(work.scheduled_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <div key={work.id}
                      onClick={() => router.push(`/works/${work.id}`)}
                      className={`absolute left-1 right-1 rounded-lg border px-2 py-1 cursor-pointer hover:brightness-110 transition-all overflow-hidden ${colour}`}
                      style={{ top: `${top}px`, height: `${height}px`, minHeight: '28px' }}>
                      <div className="text-xs font-semibold truncate">{customerName(work)}</div>
                      {height > 40 && (
                        <div className="text-xs opacity-70 truncate mt-0.5">{startTime} · {work.reference}</div>
                      )}
                      {height > 56 && (
                        <div className="text-xs opacity-60 truncate capitalize">{work.trade_type}</div>
                      )}
                    </div>
                  )
                })}

                {/* Current time indicator */}
                {today && (() => {
                  const now = new Date()
                  const top = (now.getHours() + now.getMinutes() / 60 - 7) * 60
                  if (top < 0 || top > HOURS.length * 60) return null
                  return (
                    <div className="absolute left-0 right-0 flex items-center z-10 pointer-events-none"
                      style={{ top: `${top}px` }}>
                      <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"/>
                      <div className="flex-1 h-px bg-amber-500"/>
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>

      {/* Unscheduled jobs banner */}
      {works.filter(w => !w.scheduled_start && (w.status === 'job_scheduled' || w.status === 'job_in_progress')).length > 0 && (
        <div className="bg-gray-900 border-t border-gray-800 px-6 py-3 flex items-center gap-3 flex-shrink-0">
          <div className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0"/>
          <span className="text-xs text-gray-400">
            Some active jobs have no scheduled date — <a href="/works" className="text-amber-400 hover:text-amber-300">view all work →</a>
          </span>
        </div>
      )}
    </div>
  )
}