'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, formatCurrency } from '@/lib/supabase'

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

const VAT_QUARTERS = [
  { label: 'Q1 Jan–Mar', start: '-03-01', end: '-04-01', months: [1,2,3] },
  { label: 'Q2 Apr–Jun', start: '-07-01', end: '-07-01', months: [4,5,6] },
  { label: 'Q3 Jul–Sep', start: '-07-01', end: '-10-01', months: [7,8,9] },
  { label: 'Q4 Oct–Dec', start: '-10-01', end: '-01-01', months: [10,11,12] },
]

export default function VatReturnPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [account, setAccount] = useState<any>(null)
  const [vatReturns, setVatReturns] = useState<any[]>([])
  const [selectedReturn, setSelectedReturn] = useState<any>(null)
  const [showNew, setShowNew] = useState(false)

  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [newPeriod, setNewPeriod] = useState({
    year: currentYear,
    quarter: VAT_QUARTERS.findIndex(q => q.months.includes(currentMonth)),
  })

  // Boxes state (manually editable)
  const [boxes, setBoxes] = useState({
    box1: 0, box2: 0, box3: 0, box4: 0,
    box5: 0, box6: 0, box7: 0, box8: 0, box9: 0,
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: u } = await (supabase as any).from('users').select('account_id, accounts(*)').eq('id', session.user.id).single()
    if (!u?.account_id) return
    setAccountId(u.account_id)
    setAccount(u.accounts)

    const { data: returns } = await (supabase as any)
      .from('vat_returns')
      .select('*')
      .order('period_start', { ascending: false })

    setVatReturns(returns || [])
    setLoading(false)
  }

  async function calculateBoxes(periodStart: string, periodEnd: string) {
    setCalculating(true)
    try {
      // Box 1: VAT due on sales (from invoice line items in period)
      const { data: invoiceItems } = await (supabase as any)
        .from('line_items')
        .select('line_vat, works!inner(invoice_date, status)')
        .gte('works.invoice_date', periodStart)
        .lt('works.invoice_date', periodEnd)
        .in('works.status', ['invoice_sent','invoice_viewed','invoice_paid','invoice_partially_paid','invoice_overdue'])

      const box1 = (invoiceItems || []).reduce((s: number, i: any) => s + (i.line_vat || 0), 0)

      // Box 4: VAT reclaimed on purchases (from business costs with vat_amount in period)
      const { data: costItems } = await (supabase as any)
        .from('business_costs')
        .select('vat_amount')
        .gte('cost_date', periodStart)
        .lt('cost_date', periodEnd)
        .gt('vat_amount', 0)

      const box4 = (costItems || []).reduce((s: number, c: any) => s + (c.vat_amount || 0), 0)

      // Box 6: Total net value of sales (from invoices)
      const { data: invoiceWorks } = await (supabase as any)
        .from('works')
        .select('subtotal_net')
        .gte('invoice_date', periodStart)
        .lt('invoice_date', periodEnd)
        .in('status', ['invoice_sent','invoice_viewed','invoice_paid','invoice_partially_paid','invoice_overdue'])

      const box6 = (invoiceWorks || []).reduce((s: number, w: any) => s + (w.subtotal_net || 0), 0)

      // Box 7: Total net value of purchases
      const { data: costs } = await (supabase as any)
        .from('business_costs')
        .select('amount, vat_amount')
        .gte('cost_date', periodStart)
        .lt('cost_date', periodEnd)

      const box7 = (costs || []).reduce((s: number, c: any) => s + ((c.amount || 0) - (c.vat_amount || 0)), 0)

      const box3 = box1 + 0 // box2 = 0 for domestic
      const box5 = Math.max(0, box3 - box4)

      setBoxes({
        box1: Math.round(box1 * 100) / 100,
        box2: 0,
        box3: Math.round(box3 * 100) / 100,
        box4: Math.round(box4 * 100) / 100,
        box5: Math.round(box5 * 100) / 100,
        box6: Math.round(box6 * 100) / 100,
        box7: Math.round(box7 * 100) / 100,
        box8: 0,
        box9: 0,
      })
    } catch (e: any) { setError(e.message) }
    setCalculating(false)
  }

  async function createReturn() {
    setSaving(true); setError('')
    try {
      const q = VAT_QUARTERS[newPeriod.quarter]
      const year = newPeriod.year
      const nextYear = q.months.includes(12) ? year + 1 : year

      let periodStart: string
      let periodEnd: string
      let dueDate: string

      // UK standard quarter dates
      if (newPeriod.quarter === 0) { // Jan-Mar
        periodStart = `${year}-01-01`
        periodEnd = `${year}-03-31`
        dueDate = `${year}-05-07`
      } else if (newPeriod.quarter === 1) { // Apr-Jun
        periodStart = `${year}-04-01`
        periodEnd = `${year}-06-30`
        dueDate = `${year}-08-07`
      } else if (newPeriod.quarter === 2) { // Jul-Sep
        periodStart = `${year}-07-01`
        periodEnd = `${year}-09-30`
        dueDate = `${year}-11-07`
      } else { // Oct-Dec
        periodStart = `${year}-10-01`
        periodEnd = `${year}-12-31`
        dueDate = `${nextYear}-02-07`
      }

      // Auto-calculate boxes
      await calculateBoxes(periodStart, periodEnd)

      const { data: ret, error: err } = await (supabase as any)
        .from('vat_returns')
        .insert({
          account_id: accountId,
          period_start: periodStart,
          period_end: periodEnd,
          due_date: dueDate,
          ...boxes,
          status: 'draft',
        })
        .select().single()

      if (err) throw err
      setSelectedReturn(ret)
      setShowNew(false)
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function saveBoxes() {
    if (!selectedReturn) return
    setSaving(true)
    try {
      const box3 = boxes.box1 + boxes.box2
      const box5 = Math.max(0, box3 - boxes.box4)
      const updated = { ...boxes, box3, box5 }
      setBoxes(updated)
      await (supabase as any).from('vat_returns').update({ ...updated, updated_at: new Date().toISOString() }).eq('id', selectedReturn.id)
      setSaving(false)
      await load()
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  function upd(box: string, val: string) {
    const n = parseFloat(val) || 0
    setBoxes(p => {
      const next = { ...p, [box]: n }
      next.box3 = next.box1 + next.box2
      next.box5 = Math.max(0, next.box3 - next.box4)
      return next
    })
  }

  const boxInp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 text-right font-mono focus:outline-none focus:border-amber-500 transition-colors"

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  if (!account?.vat_registered) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">📋</div>
        <div className="text-lg font-bold text-white mb-2">VAT not enabled</div>
        <div className="text-sm text-gray-500 mb-5">Your account isn't set up as VAT registered. Enable VAT in Settings to use this feature.</div>
        <a href="/settings" className="text-xs bg-amber-500 text-gray-950 font-bold px-4 py-2 rounded-xl hover:bg-amber-400">Go to Settings →</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-white">VAT returns</h1>
          <span className="text-xs text-gray-600">Making Tax Digital</span>
          {account?.vat_number && <span className="text-xs text-gray-500 font-mono">{account.vat_number}</span>}
        </div>
        <button onClick={() => setShowNew(true)} className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg">
          + New return
        </button>
      </div>

      <div className="px-6 py-5 max-w-screen-xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Returns list */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Returns</div>
            {vatReturns.length === 0 && !showNew ? (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl py-10 text-center">
                <div className="text-3xl mb-3 opacity-20">📊</div>
                <div className="text-sm text-gray-600 mb-3">No VAT returns yet</div>
                <button onClick={() => setShowNew(true)} className="text-xs text-amber-400 hover:text-amber-300">Create first return →</button>
              </div>
            ) : vatReturns.map(r => (
              <button key={r.id} onClick={() => { setSelectedReturn(r); setBoxes({ box1: r.box1_vat_due_sales, box2: r.box2_vat_due_acquisitions, box3: r.box3_total_vat_due, box4: r.box4_vat_reclaimed, box5: r.box5_net_vat_due, box6: r.box6_total_value_sales, box7: r.box7_total_value_purchases, box8: r.box8_total_value_goods_sup, box9: r.box9_total_value_goods_acq }) }}
                className={`w-full text-left bg-gray-900 border rounded-2xl p-4 transition-colors ${selectedReturn?.id === r.id ? 'border-amber-500/40 bg-amber-500/5' : 'border-gray-800 hover:border-gray-700'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold text-white">
                    {new Date(r.period_start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} –{' '}
                    {new Date(r.period_end).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${r.status === 'submitted' ? 'bg-emerald-900/50 text-emerald-300' : r.status === 'accepted' ? 'bg-emerald-700/50 text-emerald-200' : 'bg-gray-800 text-gray-400'}`}>
                    {r.status}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Box 5: {formatCurrency(r.box5_net_vat_due)}</span>
                  <span>Due: {r.due_date ? new Date(r.due_date).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '—'}</span>
                </div>
              </button>
            ))}

            {/* New return form */}
            {showNew && (
              <div className="bg-gray-900 border border-amber-500/20 rounded-2xl p-4 space-y-3">
                <div className="text-sm font-semibold text-white">New VAT return</div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Year</label>
                  <select className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                    value={newPeriod.year} onChange={e => setNewPeriod(p => ({ ...p, year: parseInt(e.target.value) }))}>
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Quarter</label>
                  <select className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                    value={newPeriod.quarter} onChange={e => setNewPeriod(p => ({ ...p, quarter: parseInt(e.target.value) }))}>
                    {VAT_QUARTERS.map((q, i) => <option key={i} value={i}>{q.label}</option>)}
                  </select>
                </div>
                {error && <div className="text-xs text-red-400">{error}</div>}
                <div className="flex gap-2">
                  <button onClick={createReturn} disabled={saving || calculating}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold text-xs py-2.5 rounded-xl">
                    {calculating ? 'Calculating…' : saving ? 'Creating…' : 'Create + auto-fill'}
                  </button>
                  <button onClick={() => setShowNew(false)} className="px-3 bg-gray-800 text-gray-400 text-xs rounded-xl">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Boxes editor */}
          {selectedReturn ? (
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {new Date(selectedReturn.period_start).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })} – {new Date(selectedReturn.period_end).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Due: {selectedReturn.due_date ? new Date(selectedReturn.due_date).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : '—'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => calculateBoxes(selectedReturn.period_start, selectedReturn.period_end)} disabled={calculating}
                    className="text-xs text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg hover:bg-amber-500/10">
                    {calculating ? 'Calculating…' : '↻ Recalculate'}
                  </button>
                  <button onClick={saveBoxes} disabled={saving}
                    className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-4 py-1.5 rounded-lg">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  VAT return boxes — submit to HMRC via MTD
                </div>
                <div className="divide-y divide-gray-800/50">
                  {[
                    { box: 'box1', num: 1, label: 'VAT due on sales and other outputs', editable: true, highlight: false },
                    { box: 'box2', num: 2, label: 'VAT due on intra-EU acquisitions', editable: true, highlight: false },
                    { box: 'box3', num: 3, label: 'Total VAT due (Box 1 + Box 2)', editable: false, highlight: true },
                    { box: 'box4', num: 4, label: 'VAT reclaimed on purchases (input tax)', editable: true, highlight: false },
                    { box: 'box5', num: 5, label: 'Net VAT to pay HMRC (Box 3 minus Box 4)', editable: false, highlight: true },
                    { box: 'box6', num: 6, label: 'Total value of sales excluding VAT', editable: true, highlight: false },
                    { box: 'box7', num: 7, label: 'Total value of purchases excluding VAT', editable: true, highlight: false },
                    { box: 'box8', num: 8, label: 'Total value of goods to EU countries', editable: true, highlight: false },
                    { box: 'box9', num: 9, label: 'Total value of goods from EU countries', editable: true, highlight: false },
                  ].map(({ box, num, label, editable, highlight }) => (
                    <div key={box} className={`flex items-center gap-4 px-5 py-3 ${highlight ? 'bg-amber-500/5' : ''}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${highlight ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800 text-gray-400'}`}>
                        {num}
                      </div>
                      <div className="flex-1 text-sm text-gray-300">{label}</div>
                      {editable ? (
                        <input type="number" step="0.01" className={`${boxInp} w-36 flex-shrink-0`}
                          value={(boxes as any)[box]}
                          onChange={e => upd(box, e.target.value)}/>
                      ) : (
                        <div className={`w-36 flex-shrink-0 text-right font-mono font-bold text-sm pr-3 ${highlight ? 'text-amber-400' : 'text-gray-200'}`}>
                          £{fmt((boxes as any)[box])}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Box 5 summary */}
              <div className={`rounded-2xl p-5 border ${boxes.box5 > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className={`text-base font-bold ${boxes.box5 > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                      {boxes.box5 > 0 ? 'Amount to pay HMRC' : 'Repayment from HMRC'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Box 5</div>
                  </div>
                  <div className={`text-3xl font-bold ${boxes.box5 > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatCurrency(Math.abs(boxes.box5))}
                  </div>
                </div>
              </div>

              {/* MTD submission note */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-xs text-gray-600 space-y-1">
                <div className="text-gray-400 font-medium mb-2">Submitting via MTD</div>
                <div>1. Verify all boxes are correct — recalculate if needed</div>
                <div>2. HMRC MTD API submission is coming in the next update</div>
                <div>3. Until then, you can use these figures to submit via HMRC's own MTD portal</div>
                <div>4. Keep a record of your Resend receipt number after submission</div>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl flex items-center justify-center py-20">
              <div className="text-center">
                <div className="text-4xl mb-3 opacity-20">📊</div>
                <div className="text-sm text-gray-600">Select a return or create a new one</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}