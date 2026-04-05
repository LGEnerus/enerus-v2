'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, formatCurrency, VAT_RATE_PCT, type VatRate } from '@/lib/supabase'

const UNITS = ['each', 'hour', 'day', 'm', 'm²', 'm³', 'kg', 'litre', 'pack', 'set']

export default function InvoiceEditPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string

  const [invoice, setInvoice] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [lineItems, setLineItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [vatOverride, setVatOverride] = useState<VatRate | ''>('')

  const [form, setForm] = useState({
    title: '',
    customer_notes: '',
    internal_notes: '',
    invoice_date: '',
    due_date: '',
  })

  useEffect(() => { load() }, [invoiceId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const [{ data: inv }, { data: items }] = await Promise.all([
      (supabase as any).from('invoices').select('*, customers(*)').eq('id', invoiceId).single(),
      (supabase as any).from('line_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
    ])

    if (!inv) { router.push('/customers'); return }
    setInvoice(inv); setCustomer(inv.customers)
    setLineItems(items || [])
    setForm({
      title: inv.title || '',
      customer_notes: inv.customer_notes || '',
      internal_notes: inv.internal_notes || '',
      invoice_date: inv.invoice_date || '',
      due_date: inv.due_date || '',
    })
    setLoading(false)
  }

  function upd(u: Partial<typeof form>) { setForm(p => ({ ...p, ...u })) }
  function updateItem(id: string, u: any) { setLineItems(p => p.map(i => i.id === id ? { ...i, ...u } : i)) }

  function addItem() {
    setLineItems(p => [...p, {
      id: `new_${Date.now()}`, name: '', description: '', quantity: 1,
      unit: 'each', unit_price: 0, cost_price: 0,
      vat_rate: vatOverride || 'standard', is_material: false, sort_order: p.length, _new: true,
    }])
  }

  function removeItem(id: string) { setLineItems(p => p.map(i => i.id === id ? { ...i, _deleted: true } : i)) }
  function applyVat(rate: VatRate) { setVatOverride(rate); setLineItems(p => p.map(i => i._deleted ? i : { ...i, vat_rate: rate })) }

  const active = lineItems.filter(i => !i._deleted)
  function lineNet(i: any) { return i.quantity * i.unit_price }
  function lineVat(i: any) { return lineNet(i) * (VAT_RATE_PCT[i.vat_rate as VatRate] / 100) }
  function lineGross(i: any) { return lineNet(i) + lineVat(i) }

  const subtotalNet = active.reduce((s, i) => s + lineNet(i), 0)
  const totalVat = active.reduce((s, i) => s + lineVat(i), 0)
  const totalGross = subtotalNet + totalVat

  function customerName() {
    if (!customer) return '—'
    if (customer.is_company && customer.company_name) return customer.company_name
    return `${customer.first_name} ${customer.last_name}`
  }

  function DateField({ label, value, onChange, dateOnly }: { label: string; value: string; onChange: (v: string) => void; dateOnly?: boolean }) {
    const type = dateOnly ? 'date' : 'datetime-local'
    return (
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
        <label className="relative block cursor-pointer group">
          <input type={type} value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"/>
          <div className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm flex items-center justify-between group-hover:border-amber-500/60 transition-colors">
            <span className={value ? 'text-gray-100' : 'text-gray-600'}>{value ? new Date(value + (dateOnly ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : 'Click to set date'}</span>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-gray-600 flex-shrink-0"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
          </div>
        </label>
        {value && <button onClick={() => onChange('')} className="text-xs text-gray-600 hover:text-red-400 mt-1">× Clear</button>}
      </div>
    )
  }

  async function save() {
    setSaving(true); setError('')
    try {
      await (supabase as any).from('invoices').update({
        ...form,
        subtotal_net: subtotalNet, total_vat: totalVat, total_gross: totalGross,
        amount_due: totalGross - (invoice.amount_paid || 0),
        updated_at: new Date().toISOString(),
      }).eq('id', invoiceId)

      for (const item of lineItems) {
        if (item._deleted && !item._new) {
          await (supabase as any).from('line_items').delete().eq('id', item.id)
        } else if (item._new && !item._deleted && item.name.trim()) {
          await (supabase as any).from('line_items').insert({
            invoice_id: invoiceId, sort_order: item.sort_order, name: item.name,
            description: item.description || null, quantity: item.quantity, unit: item.unit,
            unit_price: item.unit_price, cost_price: item.cost_price || null,
            vat_rate: item.vat_rate, line_vat: lineVat(item), line_gross: lineGross(item),
            is_material: item.is_material,
          })
        } else if (!item._new && !item._deleted) {
          await (supabase as any).from('line_items').update({
            sort_order: item.sort_order, name: item.name,
            description: item.description || null, quantity: item.quantity, unit: item.unit,
            unit_price: item.unit_price, cost_price: item.cost_price || null,
            vat_rate: item.vat_rate, line_vat: lineVat(item), line_gross: lineGross(item),
            is_material: item.is_material,
          }).eq('id', item.id)
        }
      }

      router.push(`/invoices/${invoiceId}`)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-400 mb-1.5"

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <a href={`/invoices/${invoiceId}`} className="text-gray-600 hover:text-gray-400 text-sm">← {invoice.reference}</a>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-medium text-gray-300">Edit</span>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <a href={`/invoices/${invoiceId}`} className="text-xs text-gray-500 border border-gray-700 px-3 py-2 rounded-lg hover:bg-gray-800">Cancel</a>
          <button onClick={save} disabled={saving} className="bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg">{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">

            {/* Customer (read-only) */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Customer</div>
              <div className="text-sm font-medium text-gray-200">{customerName()}</div>
            </div>

            {/* Invoice details */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Invoice details</div>
              <div><label className={lbl}>Title</label><input className={inp} value={form.title} onChange={e => upd({ title: e.target.value })} placeholder="e.g. Boiler installation — final invoice"/></div>
              <div className="grid grid-cols-2 gap-4">
                <DateField label="Invoice date" value={form.invoice_date} onChange={v => upd({ invoice_date: v })} dateOnly/>
                <DateField label="Due date" value={form.due_date} onChange={v => upd({ due_date: v })} dateOnly/>
              </div>
              <div><label className={lbl}>Notes for customer</label><textarea className={`${inp} resize-none`} rows={2} value={form.customer_notes} onChange={e => upd({ customer_notes: e.target.value })} placeholder="Visible on invoice…"/></div>
              <div><label className={lbl}>Internal notes</label><textarea className={`${inp} resize-none`} rows={2} value={form.internal_notes} onChange={e => upd({ internal_notes: e.target.value })}/></div>
            </div>

            {/* Line items */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Line items</div>
                <button onClick={addItem} className="text-xs text-amber-400 hover:text-amber-300">+ Add</button>
              </div>
              {/* VAT override */}
              <div className="flex items-center gap-2 mb-4 bg-gray-800 rounded-xl px-3 py-2.5">
                <span className="text-xs text-gray-500 flex-shrink-0">VAT override:</span>
                <div className="flex gap-1.5 flex-1">
                  {(['standard','reduced','zero','exempt'] as VatRate[]).map(rate => (
                    <button key={rate} onClick={() => applyVat(rate)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${vatOverride === rate ? 'bg-amber-500 text-gray-950' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                      {rate === 'standard' ? '20%' : rate === 'reduced' ? '5%' : rate === 'zero' ? '0%' : 'Exempt'}
                    </button>
                  ))}
                </div>
                {vatOverride && <span className="text-xs text-amber-400 flex-shrink-0">Applied ✓</span>}
              </div>
              <div className="space-y-3">
                {active.map((item, idx) => (
                  <div key={item.id} className="bg-gray-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-4 flex-shrink-0">{idx + 1}</span>
                      <input placeholder="Item name *" value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500"/>
                      <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-red-400 text-xl">×</button>
                    </div>
                    <input placeholder="Description (optional)" value={item.description || ''} onChange={e => updateItem(item.id, { description: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500"/>
                    <div className="grid grid-cols-5 gap-2">
                      <div><div className="text-xs text-gray-600 mb-1">Qty</div><input type="number" min="0" step="0.01" value={item.quantity} onChange={e => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"/></div>
                      <div><div className="text-xs text-gray-600 mb-1">Unit</div><select value={item.unit} onChange={e => updateItem(item.id, { unit: e.target.value })} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500">{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
                      <div><div className="text-xs text-gray-600 mb-1">Unit price</div><input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"/></div>
                      <div><div className="text-xs text-gray-600 mb-1">Cost</div><input type="number" min="0" step="0.01" value={item.cost_price || 0} onChange={e => updateItem(item.id, { cost_price: parseFloat(e.target.value) || 0 })} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"/></div>
                      <div><div className="text-xs text-gray-600 mb-1">VAT</div><select value={item.vat_rate} onChange={e => updateItem(item.id, { vat_rate: e.target.value })} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"><option value="standard">20%</option><option value="reduced">5%</option><option value="zero">0%</option><option value="exempt">Exempt</option></select></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer"><input type="checkbox" checked={item.is_material} onChange={e => updateItem(item.id, { is_material: e.target.checked })}/>Material</label>
                      <span className="text-sm font-semibold text-amber-400">{formatCurrency(lineGross(item))}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addItem} className="mt-3 w-full py-2.5 border border-dashed border-gray-700 rounded-xl text-xs text-gray-500 hover:border-amber-500 hover:text-amber-400 transition-colors">+ Add line item</button>
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
              <button onClick={save} disabled={saving} className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold py-3 rounded-xl transition-colors">{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}