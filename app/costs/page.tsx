'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate, COST_CATEGORY_LABEL, type CostCategory } from '@/lib/supabase'

const CATEGORY_COLOURS: Record<string, string> = {
  fuel: 'bg-amber-900/50 text-amber-300',
  consumables: 'bg-blue-900/50 text-blue-300',
  workwear: 'bg-purple-900/50 text-purple-300',
  ppe: 'bg-orange-900/50 text-orange-300',
  tools: 'bg-cyan-900/50 text-cyan-300',
  vehicle: 'bg-indigo-900/50 text-indigo-300',
  insurance: 'bg-red-900/50 text-red-300',
  accreditation: 'bg-pink-900/50 text-pink-300',
  subscription: 'bg-violet-900/50 text-violet-300',
  rent: 'bg-rose-900/50 text-rose-300',
  utilities: 'bg-yellow-900/50 text-yellow-300',
  marketing: 'bg-green-900/50 text-green-300',
  training: 'bg-teal-900/50 text-teal-300',
  subcontractor: 'bg-gray-700 text-gray-300',
  materials: 'bg-sky-900/50 text-sky-300',
  other: 'bg-gray-800 text-gray-400',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function CostsPage() {
  const router = useRouter()
  const [costs, setCosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [categoryFilter, setCategoryFilter] = useState('')

  const [form, setForm] = useState({
    category: 'fuel' as CostCategory,
    name: '',
    supplier: '',
    amount: '',
    vat_amount: '',
    is_recurring: false,
    recurrence: 'monthly',
    cost_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)
    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)
    const { data } = await (supabase as any)
      .from('business_costs')
      .select('*')
      .order('cost_date', { ascending: false })
    setCosts(data || [])
    setLoading(false)
  }

  async function save() {
    if (!form.name || !form.amount) { setError('Name and amount required'); return }
    setSaving(true); setError('')
    try {
      const { error: err } = await (supabase as any).from('business_costs').insert({
        ...form,
        account_id: accountId,
        amount: parseFloat(form.amount),
        vat_amount: form.vat_amount ? parseFloat(form.vat_amount) : 0,
        created_by: userId,
      })
      if (err) throw err
      setShowNew(false)
      setForm({ category: 'fuel', name: '', supplier: '', amount: '', vat_amount: '', is_recurring: false, recurrence: 'monthly', cost_date: new Date().toISOString().split('T')[0], notes: '' })
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  // Filter costs for selected month
  const monthCosts = costs.filter(c => {
    const d = new Date(c.cost_date)
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear
  })

  const filtered = monthCosts.filter(c => !categoryFilter || c.category === categoryFilter)

  // Monthly total
  const monthTotal = monthCosts.reduce((s, c) => s + (c.amount || 0), 0)
  const monthVat = monthCosts.reduce((s, c) => s + (c.vat_amount || 0), 0)

  // Category breakdown
  const byCategory = monthCosts.reduce((acc: any, c) => {
    acc[c.category] = (acc[c.category] || 0) + (c.amount || 0)
    return acc
  }, {})

  // Recurring costs
  const recurringTotal = costs.filter(c => c.is_recurring && c.recurrence === 'monthly')
    .reduce((s, c) => s + (c.amount || 0), 0)

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-400 mb-1.5"

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-sm text-gray-600">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-white">Costs</h1>
          {/* Month picker */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg">
            <button onClick={() => {
              if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1) }
              else setSelectedMonth(m => m - 1)
            }} className="px-2 py-1.5 text-gray-500 hover:text-gray-300 text-sm">‹</button>
            <span className="text-xs font-medium text-gray-300 px-1">{MONTHS[selectedMonth]} {selectedYear}</span>
            <button onClick={() => {
              if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1) }
              else setSelectedMonth(m => m + 1)
            }} className="px-2 py-1.5 text-gray-500 hover:text-gray-300 text-sm">›</button>
          </div>
        </div>
        <button onClick={() => setShowNew(true)}
          className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
          + Log cost
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">This month</div>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(monthTotal)}</div>
            <div className="text-xs text-gray-600 mt-1">{monthCosts.length} entries</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">VAT reclaimable</div>
            <div className="text-2xl font-bold text-emerald-400">{formatCurrency(monthVat)}</div>
            <div className="text-xs text-gray-600 mt-1">Input tax</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Monthly overhead</div>
            <div className="text-2xl font-bold text-gray-300">{formatCurrency(recurringTotal)}</div>
            <div className="text-xs text-gray-600 mt-1">Recurring fixed costs</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Net cost</div>
            <div className="text-2xl font-bold text-gray-300">{formatCurrency(monthTotal - monthVat)}</div>
            <div className="text-xs text-gray-600 mt-1">Ex-reclaimable VAT</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Category breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">By category</div>
            {Object.keys(byCategory).length === 0 ? (
              <div className="text-sm text-gray-700 text-center py-6">No costs this month</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(byCategory)
                  .sort(([,a]: any, [,b]: any) => b - a)
                  .map(([cat, amount]: any) => (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOURS[cat] || CATEGORY_COLOURS.other}`}>
                          {COST_CATEGORY_LABEL[cat as CostCategory] || cat}
                        </span>
                        <span className="text-sm font-semibold text-gray-200">{formatCurrency(amount)}</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-1">
                        <div className="bg-amber-500 h-1 rounded-full" style={{ width: `${Math.min(100, (amount / monthTotal) * 100)}%` }}/>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Cost list */}
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">
                {MONTHS[selectedMonth]} {selectedYear}
              </div>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-amber-500">
                <option value="">All categories</option>
                {Object.entries(COST_CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <div className="text-3xl mb-3 opacity-10">💸</div>
                <div className="text-sm text-gray-700">No costs logged for {MONTHS[selectedMonth]}</div>
                <button onClick={() => setShowNew(true)} className="mt-4 text-xs text-amber-400 hover:text-amber-300">
                  + Log first cost
                </button>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs font-medium text-gray-600 px-5 py-2.5">Description</th>
                    <th className="text-left text-xs font-medium text-gray-600 px-3 py-2.5 hidden md:table-cell">Category</th>
                    <th className="text-left text-xs font-medium text-gray-600 px-3 py-2.5 hidden lg:table-cell">Date</th>
                    <th className="text-right text-xs font-medium text-gray-600 px-5 py-2.5">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-3">
                        <div className="text-sm text-gray-200">{c.name}</div>
                        {c.supplier && <div className="text-xs text-gray-600">{c.supplier}</div>}
                        {c.is_recurring && (
                          <span className="text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded mt-0.5 inline-block capitalize">
                            ↻ {c.recurrence}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOURS[c.category] || CATEGORY_COLOURS.other}`}>
                          {COST_CATEGORY_LABEL[c.category as CostCategory] || c.category}
                        </span>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        <span className="text-xs text-gray-600">{formatDate(c.cost_date)}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="text-sm font-semibold text-gray-200">{formatCurrency(c.amount)}</div>
                        {c.vat_amount > 0 && <div className="text-xs text-emerald-500">+{formatCurrency(c.vat_amount)} VAT</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* New cost modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowNew(false) }}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <div className="text-base font-bold text-white">Log cost</div>
              <button onClick={() => setShowNew(false)} className="text-gray-600 hover:text-gray-400 text-xl">×</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className={lbl}>Category</label>
                <select className={inp} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as CostCategory }))}>
                  {Object.entries(COST_CATEGORY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Description *</label>
                <input className={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Fuel — Jas Patel, Screwfix consumables…"/>
              </div>
              <div>
                <label className={lbl}>Supplier</label>
                <input className={inp} value={form.supplier} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))}
                  placeholder="Screwfix, Allstar, Snickers…"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Amount (£) *</label>
                  <input type="number" step="0.01" min="0" className={inp} value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}/>
                </div>
                <div>
                  <label className={lbl}>VAT amount (£)</label>
                  <input type="number" step="0.01" min="0" className={inp} value={form.vat_amount}
                    onChange={e => setForm(p => ({ ...p, vat_amount: e.target.value }))}/>
                </div>
              </div>
              <div>
                <label className={lbl}>Date</label>
                <input type="date" className={inp} value={form.cost_date}
                  onChange={e => setForm(p => ({ ...p, cost_date: e.target.value }))}/>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setForm(p => ({ ...p, is_recurring: !p.is_recurring }))}
                  className={`w-9 h-5 rounded-full transition-colors relative ${form.is_recurring ? 'bg-amber-500' : 'bg-gray-700'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_recurring ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                </button>
                <span className="text-sm text-gray-300">Recurring</span>
                {form.is_recurring && (
                  <select className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none"
                    value={form.recurrence} onChange={e => setForm(p => ({ ...p, recurrence: e.target.value }))}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                )}
              </div>
              <div>
                <label className={lbl}>Notes</label>
                <input className={inp} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}/>
              </div>

              {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}

              <div className="flex gap-3 pt-1">
                <button onClick={save} disabled={saving}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold text-sm py-3 rounded-xl transition-colors">
                  {saving ? 'Saving…' : 'Log cost'}
                </button>
                <button onClick={() => setShowNew(false)}
                  className="px-5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}