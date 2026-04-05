'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, formatCurrency, VAT_RATE_PCT, type VatRate, type TradeType } from '@/lib/supabase'

const UNITS = ['each', 'hour', 'day', 'm', 'm²', 'm³', 'kg', 'litre', 'pack', 'set']
const TRADES = [
  { value: 'plumbing', label: 'Plumbing' }, { value: 'heating', label: 'Heating' },
  { value: 'electrical', label: 'Electrical' }, { value: 'gas', label: 'Gas' },
  { value: 'building', label: 'Building' }, { value: 'roofing', label: 'Roofing' },
  { value: 'carpentry', label: 'Carpentry' }, { value: 'painting', label: 'Decorating' },
  { value: 'renewables', label: 'Renewables' }, { value: 'general', label: 'General' },
  { value: 'other', label: 'Other' },
]

type LineItem = { id: string; name: string; description: string; quantity: number; unit: string; unit_price: number; cost_price: number; vat_rate: VatRate; is_material: boolean }

function newItem(): LineItem {
  return { id: crypto.randomUUID(), name: '', description: '', quantity: 1, unit: 'each', unit_price: 0, cost_price: 0, vat_rate: 'standard', is_material: false }
}

function NewQuoteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preCustomerId = searchParams.get('customer') || ''

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([newItem()])
  const [vatOverride, setVatOverride] = useState<VatRate | ''>('')

  const [form, setForm] = useState({
    customer_id: preCustomerId,
    site_id: '',
    trade_type: 'general' as TradeType,
    title: '',
    site_address_line1: '',
    site_postcode: '',
    customer_notes: '',
    internal_notes: '',
    valid_until: '',
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)
    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (!u?.account_id) { router.push('/onboarding'); return }
    setAccountId(u.account_id)
    const { data: custs } = await (supabase as any).from('customers').select('*').order('last_name')
    setCustomers(custs || [])

    if (preCustomerId) {
      const { data: s } = await (supabase as any).from('sites').select('*').eq('customer_id', preCustomerId).order('is_default', { ascending: false })
      setSites(s || [])
      const def = (s || []).find((x: any) => x.is_default)
      if (def) setForm(p => ({ ...p, site_id: def.id, site_address_line1: def.address_line1 || '', site_postcode: def.postcode || '' }))
    }
  }

  async function selectCustomer(c: any) {
    setForm(p => ({ ...p, customer_id: c.id, site_address_line1: c.address_line1 || '', site_postcode: c.postcode || '' }))
    setCustomerSearch('')
    const { data: s } = await (supabase as any).from('sites').select('*').eq('customer_id', c.id).order('is_default', { ascending: false })
    setSites(s || [])
    const def = (s || []).find((x: any) => x.is_default)
    if (def) setForm(p => ({ ...p, site_id: def.id, site_address_line1: def.address_line1 || '', site_postcode: def.postcode || '' }))
  }

  function upd(u: Partial<typeof form>) { setForm(p => ({ ...p, ...u })) }
  function updateItem(id: string, u: Partial<LineItem>) { setLineItems(p => p.map(i => i.id === id ? { ...i, ...u } : i)) }
  function addItem() { setLineItems(p => [...p, { ...newItem(), vat_rate: vatOverride || 'standard' }]) }
  function removeItem(id: string) { setLineItems(p => p.filter(i => i.id !== id)) }
  function applyVat(rate: VatRate) { setVatOverride(rate); setLineItems(p => p.map(i => ({ ...i, vat_rate: rate }))) }

  function lineNet(i: LineItem) { return i.quantity * i.unit_price }
  function lineVat(i: LineItem) { return lineNet(i) * (VAT_RATE_PCT[i.vat_rate] / 100) }
  function lineGross(i: LineItem) { return lineNet(i) + lineVat(i) }

  const subtotalNet = lineItems.reduce((s, i) => s + lineNet(i), 0)
  const totalVat = lineItems.reduce((s, i) => s + lineVat(i), 0)
  const totalGross = subtotalNet + totalVat
  const totalCost = lineItems.reduce((s, i) => s + i.quantity * i.cost_price, 0)
  const margin = subtotalNet > 0 ? ((subtotalNet - totalCost) / subtotalNet) * 100 : 0

  const selectedCustomer = customers.find(c => c.id === form.customer_id)
  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true
    return `${c.first_name} ${c.last_name} ${c.company_name || ''}`.toLowerCase().includes(customerSearch.toLowerCase())
  })

  function customerName(c: any) {
    if (c.is_company && c.company_name) return c.company_name
    return `${c.first_name} ${c.last_name}`
  }

  async function save() {
    if (!form.customer_id) { setError('Select a customer'); return }
    if (lineItems.length === 0 || !lineItems[0].name) { setError('Add at least one line item'); return }
    setSaving(true); setError('')
    try {
      const { data: refData } = await (supabase as any).rpc('generate_quote_reference', { p_account_id: accountId })

      const { data: quote, error: qErr } = await (supabase as any).from('quotes').insert({
        account_id: accountId, customer_id: form.customer_id,
        site_id: form.site_id || null, reference: refData,
        status: 'draft', trade_type: form.trade_type,
        title: form.title || null, site_address_line1: form.site_address_line1 || null,
        site_postcode: form.site_postcode || null, customer_notes: form.customer_notes || null,
        internal_notes: form.internal_notes || null,
        valid_until: form.valid_until || null,
        quote_date: new Date().toISOString().split('T')[0],
        subtotal_net: subtotalNet, total_vat: totalVat, total_gross: totalGross,
        total_cost: totalCost, gross_margin: subtotalNet - totalCost, margin_pct: margin,
        created_by: userId,
      }).select().single()

      if (qErr) throw qErr

      const items = lineItems.filter(i => i.name.trim()).map((i, idx) => ({
        quote_id: quote.id, sort_order: idx, name: i.name,
        description: i.description || null, quantity: i.quantity, unit: i.unit,
        unit_price: i.unit_price, cost_price: i.cost_price || null, vat_rate: i.vat_rate,
        line_vat: lineVat(i), line_gross: lineGross(i), is_material: i.is_material,
      }))
      if (items.length > 0) await (supabase as any).from('line_items').insert(items)

      await (supabase as any).from('activity_log').insert({
        account_id: accountId, entity_type: 'quote', entity_id: quote.id,
        event: 'created', summary: 'Quote created', user_id: userId,
      })

      router.push(`/quotes/${quote.id}`)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-400 mb-1.5"

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-semibold text-white">New quote</span>
        <div className="ml-auto flex items-center gap-3">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button onClick={save} disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 text-xs font-bold px-5 py-2 rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Create quote'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">

            {/* Customer */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-white mb-4">Customer</div>
              {selectedCustomer ? (
                <div className="space-y-3">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-amber-300">{customerName(selectedCustomer)}</div>
                      <div className="text-xs text-gray-500">{selectedCustomer.email}</div>
                    </div>
                    <button onClick={() => { upd({ customer_id: '', site_id: '' }); setSites([]) }} className="text-xs text-gray-500 hover:text-red-400">✕ Change</button>
                  </div>
                  {sites.length > 0 && (
                    <div>
                      <label className={lbl}>Site / property</label>
                      <select value={form.site_id} onChange={e => {
                        const site = sites.find((s: any) => s.id === e.target.value)
                        upd({ site_id: e.target.value, site_address_line1: site?.address_line1 || '', site_postcode: site?.postcode || '' })
                      }} className={inp}>
                        {sites.map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.postcode ? ` — ${s.postcode}` : ''}{s.is_default ? ' (default)' : ''}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <input placeholder="Search customers…" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} className={inp}/>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredCustomers.map(c => (
                      <button key={c.id} onClick={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors">
                        <div className="text-sm text-gray-200">{customerName(c)}</div>
                        <div className="text-xs text-gray-500">{c.address_line1} · {c.postcode}</div>
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && <div className="text-xs text-gray-600 py-4 text-center">No customers found — <a href="/customers" className="text-amber-400">add one first</a></div>}
                  </div>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-sm font-semibold text-white">Quote details</div>
              <div>
                <label className={lbl}>Title / description</label>
                <input className={inp} value={form.title} onChange={e => upd({ title: e.target.value })} placeholder="e.g. Boiler replacement, ASHP installation…"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Trade</label>
                  <select value={form.trade_type} onChange={e => upd({ trade_type: e.target.value as TradeType })} className={inp}>
                    {TRADES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Valid until</label>
                  <label className="relative block cursor-pointer group">
                    <input type="date" value={form.valid_until} onChange={e => upd({ valid_until: e.target.value })} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"/>
                    <div className={`${inp} flex items-center justify-between group-hover:border-amber-500/60`}>
                      <span className={form.valid_until ? 'text-gray-100' : 'text-gray-600'}>{form.valid_until ? new Date(form.valid_until + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : 'Click to set'}</span>
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-gray-600"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
                    </div>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Site address</label>
                  <input className={inp} value={form.site_address_line1} onChange={e => upd({ site_address_line1: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Site postcode</label>
                  <input className={inp} value={form.site_postcode} onChange={e => upd({ site_postcode: e.target.value })}/>
                </div>
              </div>
              <div>
                <label className={lbl}>Notes for customer</label>
                <textarea className={`${inp} resize-none`} rows={2} value={form.customer_notes} onChange={e => upd({ customer_notes: e.target.value })} placeholder="Visible on the quote…"/>
              </div>
              <div>
                <label className={lbl}>Internal notes</label>
                <textarea className={`${inp} resize-none`} rows={2} value={form.internal_notes} onChange={e => upd({ internal_notes: e.target.value })} placeholder="Not shown to customer…"/>
              </div>
            </div>

            {/* Line items */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-white">Line items</div>
                <button onClick={addItem} className="text-xs text-amber-400 hover:text-amber-300">+ Add item</button>
              </div>
              {/* VAT override bar */}
              <div className="flex items-center gap-2 mb-4 bg-gray-800 rounded-xl px-3 py-2.5">
                <span className="text-xs text-gray-500 flex-shrink-0">VAT override:</span>
                <div className="flex gap-1.5 flex-1">
                  {(['standard','reduced','zero','exempt'] as VatRate[]).map(rate => {
                    const label = rate === 'standard' ? '20%' : rate === 'reduced' ? '5%' : rate === 'zero' ? '0%' : 'Exempt'
                    return <button key={rate} onClick={() => applyVat(rate)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${vatOverride === rate ? 'bg-amber-500 text-gray-950' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>{label}</button>
                  })}
                </div>
                {vatOverride && <span className="text-xs text-amber-400 flex-shrink-0">Applied ✓</span>}
              </div>
              <div className="space-y-3">
                {lineItems.map((item, idx) => (
                  <div key={item.id} className="bg-gray-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-4 flex-shrink-0">{idx + 1}</span>
                      <input placeholder="Item name *" value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500"/>
                      {lineItems.length > 1 && <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-red-400 text-xl">×</button>}
                    </div>
                    <input placeholder="Description (optional)" value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500"/>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { label: 'Qty', type: 'number', value: item.quantity, onChange: (v: string) => updateItem(item.id, { quantity: parseFloat(v) || 0 }) },
                        { label: 'Unit price', type: 'number', value: item.unit_price, onChange: (v: string) => updateItem(item.id, { unit_price: parseFloat(v) || 0 }) },
                        { label: 'Cost', type: 'number', value: item.cost_price, onChange: (v: string) => updateItem(item.id, { cost_price: parseFloat(v) || 0 }) },
                      ].map(f => (
                        <div key={f.label}>
                          <div className="text-xs text-gray-600 mb-1">{f.label}</div>
                          <input type="number" min="0" step="0.01" value={f.value} onChange={e => f.onChange(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"/>
                        </div>
                      ))}
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Unit</div>
                        <select value={item.unit} onChange={e => updateItem(item.id, { unit: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500">
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">VAT</div>
                        <select value={item.vat_rate} onChange={e => updateItem(item.id, { vat_rate: e.target.value as VatRate })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500">
                          <option value="standard">20%</option>
                          <option value="reduced">5%</option>
                          <option value="zero">0%</option>
                          <option value="exempt">Exempt</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={item.is_material} onChange={e => updateItem(item.id, { is_material: e.target.checked })}/>
                        Material
                      </label>
                      <span className="text-sm font-semibold text-amber-400">{formatCurrency(lineGross(item))}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addItem} className="mt-3 w-full py-2.5 border border-dashed border-gray-700 rounded-xl text-xs text-gray-500 hover:border-amber-500 hover:text-amber-400 transition-colors">
                + Add line item
              </button>
            </div>
          </div>

          {/* Summary */}
          <div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sticky top-20 space-y-3">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Summary</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="text-gray-200">{formatCurrency(subtotalNet)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span className="text-gray-200">{formatCurrency(totalVat)}</span></div>
                <div className="border-t border-gray-700 pt-2 flex justify-between">
                  <span className="text-sm font-semibold text-white">Total</span>
                  <span className="text-xl font-bold text-amber-400">{formatCurrency(totalGross)}</span>
                </div>
              </div>
              {totalCost > 0 && (
                <div className="pt-3 border-t border-gray-800 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Cost</span><span className="text-gray-400">{formatCurrency(totalCost)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Margin</span><span className={margin < 20 ? 'text-red-400' : margin < 40 ? 'text-amber-400' : 'text-emerald-400'}>{margin.toFixed(1)}%</span></div>
                </div>
              )}
              <button onClick={save} disabled={saving} className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold py-3 rounded-xl transition-colors">
                {saving ? 'Saving…' : 'Create quote'}
              </button>
              {error && <div className="text-xs text-red-400 text-center">{error}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NewQuotePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>}>
      <NewQuoteInner />
    </Suspense>
  )
}