'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, VAT_RATE_PCT, formatCurrency, type VatRate, type TradeType } from '@/lib/supabase'

type LineItemDraft = {
  id: string
  name: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  cost_price: number
  vat_rate: VatRate
  is_material: boolean
}

const UNITS = ['each', 'hour', 'day', 'm', 'm²', 'm³', 'kg', 'litre', 'pack', 'set']
const TRADES: { value: TradeType; label: string }[] = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'heating', label: 'Heating' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'gas', label: 'Gas' },
  { value: 'building', label: 'Building' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'painting', label: 'Decorating' },
  { value: 'renewables', label: 'Renewables' },
  { value: 'general', label: 'General' },
  { value: 'other', label: 'Other' },
]

function newLineItem(): LineItemDraft {
  return {
    id: crypto.randomUUID(),
    name: '', description: '', quantity: 1,
    unit: 'each', unit_price: 0, cost_price: 0,
    vat_rate: 'standard', is_material: false,
  }
}

function NewWorkInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultType = searchParams.get('type') || 'quote'

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')

  // Customers
  const [customers, setCustomers] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)

  // Form
  const [workType, setWorkType] = useState<'quote'|'job'|'invoice'>(defaultType as any)
  const [form, setForm] = useState({
    customer_id: '',
    trade_type: 'general' as TradeType,
    scheduled_start: '',
    scheduled_end: '',
    site_address_line1: '',
    site_postcode: '',
    internal_notes: '',
    customer_notes: '',
  })

  // New customer
  const [newCustomer, setNewCustomer] = useState({
    first_name: '', last_name: '', email: '',
    phone: '', address_line1: '', postcode: '',
    is_company: false, company_name: '',
  })

  // Line items
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([newLineItem()])

  // Catalogue
  const [catalogue, setCatalogue] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [siteId, setSiteId] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
      if (!u?.account_id) { router.push('/onboarding'); return }
      setAccountId(u.account_id)

      // If duplicating an existing work, pre-fill from it
    const duplicateId = new URLSearchParams(window.location.search).get('duplicate')
    if (duplicateId) {
      const { data: orig } = await (supabase as any)
        .from('works').select('*, line_items(*)').eq('id', duplicateId).single()
      if (orig) {
        setForm((p: any) => ({
          ...p,
          trade_type: orig.trade_type,
          site_address_line1: orig.site_address_line1 || '',
          site_postcode: orig.site_postcode || '',
          customer_notes: orig.customer_notes || '',
          internal_notes: orig.internal_notes || '',
          customer_id: orig.customer_id,
        }))
        if (orig.line_items?.length > 0) {
          setLineItems(orig.line_items.map((i: any) => ({
            id: crypto.randomUUID(),
            name: i.name, description: i.description || '',
            quantity: i.quantity, unit: i.unit,
            unit_price: i.unit_price, cost_price: i.cost_price || 0,
            vat_rate: i.vat_rate, is_material: i.is_material,
          })))
        }
      }
    }

    const [{ data: custs }, { data: cat }] = await Promise.all([
        (supabase as any).from('customers').select('*').order('last_name'),
        (supabase as any).from('catalogue_items').select('*').eq('is_active', true).order('name'),
      ])
      setCustomers(custs || [])
      setCatalogue(cat || [])
    }
    load()
  }, [router])

  function upd(updates: Partial<typeof form>) {
    setForm(p => ({ ...p, ...updates }))
  }

  // Line item helpers
  function updateItem(id: string, updates: Partial<LineItemDraft>) {
    setLineItems(p => p.map(i => i.id === id ? { ...i, ...updates } : i))
  }

  function addItem() {
    setLineItems(p => [...p, newLineItem()])
  }

  function removeItem(id: string) {
    setLineItems(p => p.filter(i => i.id !== id))
  }

  function addFromCatalogue(cat: any) {
    setLineItems(p => [...p, {
      id: crypto.randomUUID(),
      name: cat.name,
      description: cat.description || '',
      quantity: 1,
      unit: cat.unit || 'each',
      unit_price: cat.unit_price,
      cost_price: cat.cost_price || 0,
      vat_rate: cat.vat_rate || 'standard',
      is_material: cat.category === 'Material',
    }])
  }

  // Totals
  function lineGross(item: LineItemDraft): number {
    const net = item.quantity * item.unit_price
    const vatPct = VAT_RATE_PCT[item.vat_rate] / 100
    return net * (1 + vatPct)
  }

  function lineVat(item: LineItemDraft): number {
    const net = item.quantity * item.unit_price
    return net * (VAT_RATE_PCT[item.vat_rate] / 100)
  }

  const subtotalNet = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const totalVat = lineItems.reduce((s, i) => s + lineVat(i), 0)
  const totalGross = subtotalNet + totalVat
  const totalCost = lineItems.reduce((s, i) => s + i.quantity * (i.cost_price || 0), 0)
  const margin = totalCost > 0 ? ((subtotalNet - totalCost) / subtotalNet) * 100 : 0

  // Filtered customers
  const filteredCustomers = customers.filter(c => {
    const name = `${c.first_name} ${c.last_name} ${c.company_name || ''}`.toLowerCase()
    return !customerSearch || name.includes(customerSearch.toLowerCase())
  })

  async function handleSave() {
    if (!form.customer_id && !showNewCustomer) { setError('Please select or create a customer'); return }
    if (showNewCustomer && !newCustomer.first_name) { setError('Customer first name is required'); return }
    if (lineItems.length === 0 || !lineItems[0].name) { setError('Add at least one line item'); return }

    setSaving(true); setError('')
    try {
      let customerId = form.customer_id

      // Create new customer if needed
      if (showNewCustomer) {
        const { data: cust, error: custErr } = await (supabase as any)
          .from('customers')
          .insert({ ...newCustomer, account_id: accountId, created_by: userId })
          .select().single()
        if (custErr) throw custErr
        customerId = cust.id
      }

      // Determine initial status
      const status = workType === 'quote' ? 'draft'
        : workType === 'job' ? 'job_scheduled'
        : 'invoice_sent'

      // Create work record
      const { data: work, error: workErr } = await (supabase as any)
        .from('works')
        .insert({
          account_id: accountId,
          customer_id: customerId,
          status,
          trade_type: form.trade_type,
          scheduled_start: form.scheduled_start || null,
          scheduled_end: form.scheduled_end || null,
          site_id: siteId || null,
          site_address_line1: form.site_address_line1 || null,
          site_postcode: form.site_postcode || null,
          internal_notes: form.internal_notes || null,
          customer_notes: form.customer_notes || null,
          subtotal_net: subtotalNet,
          total_vat: totalVat,
          total_gross: totalGross,
          total_cost: totalCost,
          gross_margin: subtotalNet - totalCost,
          margin_pct: margin,
          amount_due: totalGross,
          created_by: userId,
          quote_date: workType === 'quote' ? new Date().toISOString().split('T')[0] : null,
          invoice_date: workType === 'invoice' ? new Date().toISOString().split('T')[0] : null,
        })
        .select().single()

      if (workErr) throw workErr

      // Insert line items
      const itemsToInsert = lineItems
        .filter(i => i.name.trim())
        .map((i, idx) => ({
          work_id: work.id,
          sort_order: idx,
          name: i.name,
          description: i.description || null,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
          cost_price: i.cost_price || null,
          vat_rate: i.vat_rate,
          line_vat: lineVat(i),
          line_gross: lineGross(i),
          is_material: i.is_material,
        }))

      if (itemsToInsert.length > 0) {
        const { error: itemErr } = await (supabase as any).from('line_items').insert(itemsToInsert)
        if (itemErr) throw itemErr
      }

      // Log activity
      await (supabase as any).from('activity_log').insert({
        account_id: accountId,
        entity_type: 'work',
        entity_id: work.id,
        event: 'created',
        summary: `${workType.charAt(0).toUpperCase() + workType.slice(1)} created`,
        user_id: userId,
      })

      router.push(`/works/${work.id}`)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-400 mb-1.5"
  const selectedCustomer = customers.find(c => c.id === form.customer_id)

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <span className="text-gray-700">/</span>
        <span className="text-sm font-semibold text-white">New work</span>
        <div className="ml-auto flex items-center gap-3">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button onClick={handleSave} disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-950 text-xs font-bold px-5 py-2 rounded-lg transition-colors">
            {saving ? 'Saving…' : `Create ${workType}`}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

        {/* Type selector */}
        <div className="flex gap-2">
          {(['quote','job','invoice'] as const).map(t => (
            <button key={t} onClick={() => setWorkType(t)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold border transition-colors capitalize ${
                workType === t
                  ? 'bg-amber-500 border-amber-500 text-gray-950'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
              }`}>
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT: Main form */}
          <div className="lg:col-span-2 space-y-5">

            {/* Customer */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-white">Customer</div>
                <button onClick={() => setShowNewCustomer(p => !p)}
                  className="text-xs text-amber-400 hover:text-amber-300">
                  {showNewCustomer ? '← Choose existing' : '+ New customer'}
                </button>
              </div>

              {!showNewCustomer ? (
                <div className="space-y-3">
                  <input type="text" placeholder="Search customers…" value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)} className={inp}/>
                  {selectedCustomer && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-amber-300">
                          {selectedCustomer.is_company ? selectedCustomer.company_name : `${selectedCustomer.first_name} ${selectedCustomer.last_name}`}
                        </div>
                        <div className="text-xs text-gray-500">{selectedCustomer.address_line1} {selectedCustomer.postcode}</div>
                      </div>
                      <button onClick={() => { upd({ customer_id: '' }); setCustomerSearch('') }}
                        className="text-xs text-gray-500 hover:text-red-400">✕</button>
                    </div>
                  )}
                  {/* Site selector - shows after customer selected */}
              {selectedCustomer && sites.length > 0 && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Site / property</label>
                  <select value={siteId} onChange={e => {
                    setSiteId(e.target.value)
                    const site = sites.find((s: any) => s.id === e.target.value)
                    if (site) upd({ site_address_line1: site.address_line1 || '', site_postcode: site.postcode || '' })
                  }} className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500">
                    {sites.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}{s.postcode ? ` — ${s.postcode}` : ''}{s.is_default ? ' (default)' : ''}</option>
                    ))}
                  </select>
                  {siteId && (() => {
                    const site = sites.find((s: any) => s.id === siteId)
                    if (!site) return null
                    return (
                      <div className="mt-1.5 text-xs text-gray-600">
                        {[site.property_type, site.epc_rating ? `EPC ${site.epc_rating}` : null, site.floor_area_m2 ? `${site.floor_area_m2}m²` : null].filter(Boolean).join(' · ')}
                      </div>
                    )
                  })()}
                </div>
              )}

              {!selectedCustomer && (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredCustomers.length === 0 ? (
                        <div className="text-xs text-gray-600 py-4 text-center">No customers found</div>
                      ) : filteredCustomers.map(c => (
                        <button key={c.id} onClick={async () => {
                          upd({ customer_id: c.id, site_address_line1: c.address_line1 || '', site_postcode: c.postcode || '' })
                          setCustomerSearch('')
                          setSiteId('')
                          const { data: s } = await (supabase as any).from('sites').select('*').eq('customer_id', c.id).order('is_default', { ascending: false })
                          setSites(s || [])
                          // Auto-select default site
                          const def = (s || []).find((x: any) => x.is_default)
                          if (def) { setSiteId(def.id); upd({ site_address_line1: def.address_line1 || '', site_postcode: def.postcode || '' }) }
                        }}
                          className="w-full text-left px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors">
                          <div className="text-sm text-gray-200">
                            {c.is_company ? c.company_name : `${c.first_name} ${c.last_name}`}
                          </div>
                          <div className="text-xs text-gray-500">{c.address_line1} · {c.postcode}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setNewCustomer(p => ({ ...p, is_company: !p.is_company }))}
                      className={`w-8 h-4 rounded-full transition-colors relative ${newCustomer.is_company ? 'bg-amber-500' : 'bg-gray-700'}`}>
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${newCustomer.is_company ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                    </button>
                    <span className="text-xs text-gray-400">Company</span>
                  </div>
                  {newCustomer.is_company && (
                    <div>
                      <label className={lbl}>Company name</label>
                      <input type="text" className={inp} value={newCustomer.company_name}
                        onChange={e => setNewCustomer(p => ({ ...p, company_name: e.target.value }))}/>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>First name *</label>
                      <input type="text" className={inp} value={newCustomer.first_name}
                        onChange={e => setNewCustomer(p => ({ ...p, first_name: e.target.value }))}/>
                    </div>
                    <div>
                      <label className={lbl}>Last name</label>
                      <input type="text" className={inp} value={newCustomer.last_name}
                        onChange={e => setNewCustomer(p => ({ ...p, last_name: e.target.value }))}/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Email</label>
                      <input type="email" className={inp} value={newCustomer.email}
                        onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))}/>
                    </div>
                    <div>
                      <label className={lbl}>Phone</label>
                      <input type="tel" className={inp} value={newCustomer.phone}
                        onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))}/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Address</label>
                      <input type="text" className={inp} value={newCustomer.address_line1}
                        onChange={e => setNewCustomer(p => ({ ...p, address_line1: e.target.value }))}/>
                    </div>
                    <div>
                      <label className={lbl}>Postcode</label>
                      <input type="text" className={inp} value={newCustomer.postcode}
                        onChange={e => setNewCustomer(p => ({ ...p, postcode: e.target.value }))}/>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Job details */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-sm font-semibold text-white">Job details</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Trade</label>
                  <select value={form.trade_type} onChange={e => upd({ trade_type: e.target.value as TradeType })} className={inp}>
                    {TRADES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Site postcode</label>
                  <input type="text" className={inp} value={form.site_postcode}
                    onChange={e => upd({ site_postcode: e.target.value })} placeholder="B1 1AA"/>
                </div>
              </div>
              <div>
                <label className={lbl}>Site address</label>
                <input type="text" className={inp} value={form.site_address_line1}
                  onChange={e => upd({ site_address_line1: e.target.value })} placeholder="12 Trade Street"/>
              </div>
              {workType === 'job' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Scheduled start</label>
                    <input type="datetime-local" className={inp} value={form.scheduled_start}
                      onChange={e => upd({ scheduled_start: e.target.value })}/>
                  </div>
                  <div>
                    <label className={lbl}>Scheduled end</label>
                    <input type="datetime-local" className={inp} value={form.scheduled_end}
                      onChange={e => upd({ scheduled_end: e.target.value })}/>
                  </div>
                </div>
              )}
              <div>
                <label className={lbl}>Notes for customer</label>
                <textarea className={`${inp} resize-none`} rows={2} value={form.customer_notes}
                  onChange={e => upd({ customer_notes: e.target.value })}
                  placeholder="Visible on quote/invoice…"/>
              </div>
              <div>
                <label className={lbl}>Internal notes</label>
                <textarea className={`${inp} resize-none`} rows={2} value={form.internal_notes}
                  onChange={e => upd({ internal_notes: e.target.value })}
                  placeholder="Not shown to customer…"/>
              </div>
            </div>

            {/* Line items */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-white">Line items</div>
                {catalogue.length > 0 && (
                  <div className="relative group">
                    <button className="text-xs text-amber-400 hover:text-amber-300">+ From catalogue</button>
                    <div className="absolute right-0 top-6 bg-gray-800 border border-gray-700 rounded-xl p-2 min-w-56 z-10 hidden group-hover:block shadow-xl">
                      <div className="text-xs text-gray-500 px-2 py-1 mb-1">Catalogue items</div>
                      {catalogue.map(c => (
                        <button key={c.id} onClick={() => addFromCatalogue(c)}
                          className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-700 transition-colors">
                          <div className="text-xs text-gray-200">{c.name}</div>
                          <div className="text-xs text-gray-500">{formatCurrency(c.unit_price)} / {c.unit}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {lineItems.map((item, idx) => (
                  <div key={item.id} className="bg-gray-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-4">{idx + 1}</span>
                      <input type="text" placeholder="Item name *" value={item.name}
                        onChange={e => updateItem(item.id, { name: e.target.value })}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500"/>
                      {lineItems.length > 1 && (
                        <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-red-400 text-lg leading-none">×</button>
                      )}
                    </div>
                    <input type="text" placeholder="Description (optional)" value={item.description}
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
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
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
                        <input type="number" min="0" step="0.01" value={item.cost_price}
                          onChange={e => updateItem(item.id, { cost_price: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"/>
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
                        <input type="checkbox" checked={item.is_material}
                          onChange={e => updateItem(item.id, { is_material: e.target.checked })}
                          className="rounded"/>
                        Material (track ordering)
                      </label>
                      <div className="text-sm font-semibold text-amber-400">{formatCurrency(lineGross(item))}</div>
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

          {/* RIGHT: Summary */}
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sticky top-20">
              <div className="text-sm font-semibold text-white mb-4">Summary</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal (net)</span>
                  <span className="text-gray-200">{formatCurrency(subtotalNet)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">VAT</span>
                  <span className="text-gray-200">{formatCurrency(totalVat)}</span>
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between">
                  <span className="text-sm font-semibold text-white">Total</span>
                  <span className="text-lg font-bold text-amber-400">{formatCurrency(totalGross)}</span>
                </div>
              </div>

              {totalCost > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-2">
                  <div className="text-xs text-gray-600 uppercase tracking-wide">Margin</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Cost</span>
                    <span className="text-gray-400">{formatCurrency(totalCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Gross profit</span>
                    <span className="text-emerald-400">{formatCurrency(subtotalNet - totalCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Margin</span>
                    <span className={`font-semibold ${margin < 20 ? 'text-red-400' : margin < 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {margin.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}

              <button onClick={handleSave} disabled={saving}
                className="mt-5 w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-950 font-bold py-3 rounded-xl transition-colors capitalize">
                {saving ? 'Saving…' : `Create ${workType}`}
              </button>

              {error && (
                <div className="mt-3 text-xs text-red-400 text-center">{error}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NewWorkPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>}>
      <NewWorkInner />
    </Suspense>
  )
}