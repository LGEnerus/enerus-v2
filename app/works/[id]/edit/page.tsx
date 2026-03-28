'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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

export default function WorkEditPage() {
  const params = useParams()
  const router = useRouter()
  const workId = params.id as string

  const [work, setWork] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [lineItems, setLineItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    trade_type: 'general' as TradeType,
    scheduled_start: '',
    scheduled_end: '',
    site_address_line1: '',
    site_postcode: '',
    customer_notes: '',
    internal_notes: '',
    invoice_due_date: '',
  })

  useEffect(() => { load() }, [workId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const [{ data: w }, { data: items }] = await Promise.all([
      (supabase as any).from('works').select('*, customers(*)').eq('id', workId).single(),
      (supabase as any).from('line_items').select('*').eq('work_id', workId).order('sort_order'),
    ])

    if (!w) { router.push('/works'); return }
    setWork(w)
    setCustomer(w.customers)
    setLineItems(items || [])
    setForm({
      trade_type: w.trade_type || 'general',
      scheduled_start: w.scheduled_start ? w.scheduled_start.slice(0, 16) : '',
      scheduled_end: w.scheduled_end ? w.scheduled_end.slice(0, 16) : '',
      site_address_line1: w.site_address_line1 || '',
      site_postcode: w.site_postcode || '',
      customer_notes: w.customer_notes || '',
      internal_notes: w.internal_notes || '',
      invoice_due_date: w.invoice_due_date || '',
    })
    setLoading(false)
  }

  function upd(updates: Partial<typeof form>) { setForm(p => ({ ...p, ...updates })) }

  function updateItem(id: string, updates: any) {
    setLineItems(p => p.map(i => i.id === id ? { ...i, ...updates } : i))
  }

  function addItem() {
    setLineItems(p => [...p, {
      id: `new_${Date.now()}`,
      name: '', description: '', quantity: 1,
      unit: 'each', unit_price: 0, cost_price: 0,
      vat_rate: 'standard', is_material: false,
      sort_order: p.length, _new: true,
    }])
  }

  function removeItem(id: string) {
    setLineItems(p => p.map(i => i.id === id ? { ...i, _deleted: true } : i))
  }

  function lineNet(item: any) { return item.quantity * item.unit_price }
  function lineVat(item: any) { return lineNet(item) * (VAT_RATE_PCT[item.vat_rate as VatRate] / 100) }
  function lineGross(item: any) { return lineNet(item) + lineVat(item) }

  const activeItems = lineItems.filter(i => !i._deleted)
  const subtotalNet = activeItems.reduce((s, i) => s + lineNet(i), 0)
  const totalVat = activeItems.reduce((s, i) => s + lineVat(i), 0)
  const totalGross = subtotalNet + totalVat
  const totalCost = activeItems.reduce((s, i) => s + (i.quantity * (i.cost_price || 0)), 0)
  const margin = subtotalNet > 0 ? ((subtotalNet - totalCost) / subtotalNet) * 100 : 0

  async function save() {
    setSaving(true); setError('')
    try {
      // Update work record
      await (supabase as any).from('works').update({
        ...form,
        subtotal_net: subtotalNet,
        total_vat: totalVat,
        total_gross: totalGross,
        total_cost: totalCost,
        gross_margin: subtotalNet - totalCost,
        margin_pct: margin,
        amount_due: totalGross - (work.amount_paid || 0),
        updated_at: new Date().toISOString(),
      }).eq('id', workId)

      // Handle line items
      for (const item of lineItems) {
        if (item._deleted && !item._new) {
          await (supabase as any).from('line_items').delete().eq('id', item.id)
        } else if (item._new && !item._deleted && item.name.trim()) {
          await (supabase as any).from('line_items').insert({
            work_id: workId,
            sort_order: item.sort_order,
            name: item.name,
            description: item.description || null,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            cost_price: item.cost_price || null,
            vat_rate: item.vat_rate,
            line_vat: lineVat(item),
            line_gross: lineGross(item),
            is_material: item.is_material,
          })
        } else if (!item._new && !item._deleted) {
          await (supabase as any).from('line_items').update({
            sort_order: item.sort_order,
            name: item.name,
            description: item.description || null,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            cost_price: item.cost_price || null,
            vat_rate: item.vat_rate,
            line_vat: lineVat(item),
            line_gross: lineGross(item),
            is_material: item.is_material,
          }).eq('id', item.id)
        }
      }

      router.push(`/works/${workId}`)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-500 mb-1.5"

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-sm text-gray-600">Loading…</div>
    </div>
  )

  const customerName = customer?.is_company ? customer.company_name : `${customer?.first_name} ${customer?.last_name}`

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <a href={`/works/${workId}`} className="text-gray-600 hover:text-gray-400 text-sm">← {work.reference}</a>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-medium text-gray-300">Edit</span>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <a href={`/works/${workId}`} className="text-xs text-gray-500 border border-gray-700 px-3 py-2 rounded-lg hover:bg-gray-800">Cancel</a>
          <button onClick={save} disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="px-6 py-5 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">

            {/* Customer (read-only) */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Customer</div>
              <div className="text-sm font-medium text-gray-200">{customerName}</div>
              <div className="text-xs text-gray-500 mt-0.5">{customer?.address_line1} {customer?.postcode}</div>
            </div>

            {/* Job details */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Job details</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Trade</label>
                  <select value={form.trade_type} onChange={e => upd({ trade_type: e.target.value as TradeType })} className={inp}>
                    {TRADES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Site postcode</label>
                  <input className={inp} value={form.site_postcode} onChange={e => upd({ site_postcode: e.target.value })}/>
                </div>
              </div>
              <div>
                <label className={lbl}>Site address</label>
                <input className={inp} value={form.site_address_line1} onChange={e => upd({ site_address_line1: e.target.value })}/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Scheduled start</label>
                  <input type="datetime-local" className={inp} value={form.scheduled_start} onChange={e => upd({ scheduled_start: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Scheduled end</label>
                  <input type="datetime-local" className={inp} value={form.scheduled_end} onChange={e => upd({ scheduled_end: e.target.value })}/>
                </div>
              </div>
              <div>
                <label className={lbl}>Invoice due date</label>
                <input type="date" className={inp} value={form.invoice_due_date} onChange={e => upd({ invoice_due_date: e.target.value })}/>
              </div>
              <div>
                <label className={lbl}>Notes for customer</label>
                <textarea className={`${inp} resize-none`} rows={2} value={form.customer_notes} onChange={e => upd({ customer_notes: e.target.value })}/>
              </div>
              <div>
                <label className={lbl}>Internal notes</label>
                <textarea className={`${inp} resize-none`} rows={2} value={form.internal_notes} onChange={e => upd({ internal_notes: e.target.value })}/>
              </div>
            </div>

            {/* Line items */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">Line items</div>
              <div className="space-y-3">
                {activeItems.map((item, idx) => (
                  <div key={item.id} className="bg-gray-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-4 flex-shrink-0">{idx + 1}</span>
                      <input type="text" placeholder="Item name *" value={item.name}
                        onChange={e => updateItem(item.id, { name: e.target.value })}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500"/>
                      <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-red-400 text-xl leading-none flex-shrink-0">×</button>
                    </div>
                    <input type="text" placeholder="Description (optional)" value={item.description || ''}
                      onChange={e => updateItem(item.id, { description: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500"/>
                    <div className="grid grid-cols-5 gap-2">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Qty</div>
                        <input type="number" min="0" step="0.01" value={item.quantity}
                          onChange={e => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"/>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Unit</div>
                        <select value={item.unit} onChange={e => updateItem(item.id, { unit: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500">
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Unit price</div>
                        <input type="number" min="0" step="0.01" value={item.unit_price}
                          onChange={e => updateItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"/>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Cost price</div>
                        <input type="number" min="0" step="0.01" value={item.cost_price || 0}
                          onChange={e => updateItem(item.id, { cost_price: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"/>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">VAT</div>
                        <select value={item.vat_rate} onChange={e => updateItem(item.id, { vat_rate: e.target.value })}
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
                        <input type="checkbox" checked={item.is_material}
                          onChange={e => updateItem(item.id, { is_material: e.target.checked })}/>
                        Material
                      </label>
                      <span className="text-sm font-semibold text-amber-400">{formatCurrency(lineGross(item))}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addItem}
                className="mt-3 w-full py-2.5 border border-dashed border-gray-700 rounded-xl text-xs text-gray-500 hover:border-amber-500 hover:text-amber-400 transition-colors">
                + Add line item
              </button>
            </div>
          </div>

          {/* Summary */}
          <div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sticky top-20">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">Summary</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="text-gray-200">{formatCurrency(subtotalNet)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span className="text-gray-200">{formatCurrency(totalVat)}</span></div>
                <div className="border-t border-gray-700 pt-2 flex justify-between">
                  <span className="text-sm font-semibold text-white">Total</span>
                  <span className="text-lg font-bold text-amber-400">{formatCurrency(totalGross)}</span>
                </div>
              </div>
              {totalCost > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Cost</span><span className="text-gray-400">{formatCurrency(totalCost)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Profit</span><span className="text-emerald-400">{formatCurrency(subtotalNet - totalCost)}</span></div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-gray-500">Margin</span>
                    <span className={margin < 20 ? 'text-red-400' : margin < 40 ? 'text-amber-400' : 'text-emerald-400'}>{margin.toFixed(1)}%</span>
                  </div>
                </div>
              )}
              <button onClick={save} disabled={saving}
                className="mt-5 w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold py-3 rounded-xl transition-colors">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}