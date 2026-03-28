'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate } from '@/lib/supabase'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', quote_sent: 'Quote sent', quote_viewed: 'Quote viewed',
  quote_accepted: 'Accepted', quote_declined: 'Declined',
  job_scheduled: 'Scheduled', job_in_progress: 'In progress', job_complete: 'Complete',
  invoice_sent: 'Invoice sent', invoice_viewed: 'Invoice viewed',
  invoice_partially_paid: 'Part paid', invoice_paid: 'Paid',
  invoice_overdue: 'Overdue', cancelled: 'Cancelled', archived: 'Archived',
}
const STATUS_COLOUR: Record<string, string> = {
  draft: 'text-gray-400 bg-gray-800',
  quote_sent: 'text-blue-300 bg-blue-900/50', quote_viewed: 'text-blue-200 bg-blue-800/50',
  quote_accepted: 'text-amber-300 bg-amber-900/50', quote_declined: 'text-gray-500 bg-gray-800',
  job_scheduled: 'text-purple-300 bg-purple-900/50', job_in_progress: 'text-amber-300 bg-amber-900/50',
  job_complete: 'text-emerald-300 bg-emerald-900/50', invoice_sent: 'text-blue-300 bg-blue-900/50',
  invoice_viewed: 'text-blue-200 bg-blue-800/50', invoice_partially_paid: 'text-amber-300 bg-amber-900/50',
  invoice_paid: 'text-emerald-300 bg-emerald-900/50', invoice_overdue: 'text-red-300 bg-red-900/50',
  cancelled: 'text-gray-600 bg-gray-800', archived: 'text-gray-700 bg-gray-900',
}

type Tab = 'details' | 'sites' | 'work'

export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const customerId = params.id as string

  const [customer, setCustomer] = useState<any>(null)
  const [sites, setSites] = useState<any[]>([])
  const [works, setWorks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('details')
  const [editingContact, setEditingContact] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<any>({})
  const [accountId, setAccountId] = useState('')

  // Site management
  const [showNewSite, setShowNewSite] = useState(false)
  const [editingSite, setEditingSite] = useState<string | null>(null)
  const [siteForm, setSiteForm] = useState<any>({
    name: '', address_line1: '', address_line2: '',
    city: '', county: '', postcode: '',
    property_type: '', epc_rating: '',
    floor_area_m2: '', year_built: '', notes: '',
  })

  useEffect(() => { load() }, [customerId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)

    const [{ data: c }, { data: s }, { data: w }] = await Promise.all([
      (supabase as any).from('customers').select('*').eq('id', customerId).single(),
      (supabase as any).from('sites').select('*').eq('customer_id', customerId).order('is_default', { ascending: false }),
      (supabase as any).from('works').select('*, sites(name, postcode)').eq('customer_id', customerId).order('created_at', { ascending: false }),
    ])

    if (!c) { router.push('/customers'); return }
    setCustomer(c); setForm(c)
    setSites(s || [])
    setWorks(w || [])
    setLoading(false)
  }

  async function saveContact() {
    setSaving(true); setError('')
    try {
      const { error: err } = await (supabase as any).from('customers')
        .update({ ...form, updated_at: new Date().toISOString() }).eq('id', customerId)
      if (err) throw err
      setEditingContact(false)
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function saveSite(siteId?: string) {
    setSaving(true); setError('')
    try {
      const payload = {
        ...siteForm,
        floor_area_m2: siteForm.floor_area_m2 ? parseFloat(siteForm.floor_area_m2) : null,
        year_built: siteForm.year_built ? parseInt(siteForm.year_built) : null,
        updated_at: new Date().toISOString(),
      }
      if (siteId) {
        await (supabase as any).from('sites').update(payload).eq('id', siteId)
      } else {
        await (supabase as any).from('sites').insert({
          ...payload,
          account_id: accountId,
          customer_id: customerId,
          is_default: sites.length === 0,
        })
      }
      setShowNewSite(false); setEditingSite(null)
      setSiteForm({ name: '', address_line1: '', address_line2: '', city: '', county: '', postcode: '', property_type: '', epc_rating: '', floor_area_m2: '', year_built: '', notes: '' })
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function setDefaultSite(siteId: string) {
    await (supabase as any).from('sites').update({ is_default: false }).eq('customer_id', customerId)
    await (supabase as any).from('sites').update({ is_default: true }).eq('id', siteId)
    await load()
  }

  async function deleteSite(siteId: string) {
    if (!confirm('Delete this site? Any jobs linked to it will be unlinked.')) return
    await (supabase as any).from('sites').delete().eq('id', siteId)
    await load()
  }

  function customerName() {
    if (!customer) return '—'
    if (customer.is_company && customer.company_name) return customer.company_name
    return `${customer.first_name} ${customer.last_name}`
  }

  const totalValue = works.reduce((s, w) => s + (w.total_gross || 0), 0)
  const totalPaid = works.filter(w => w.status === 'invoice_paid').reduce((s, w) => s + (w.total_gross || 0), 0)
  const outstanding = works.filter(w => ['invoice_sent','invoice_viewed','invoice_overdue','invoice_partially_paid'].includes(w.status)).reduce((s, w) => s + (w.amount_due || 0), 0)

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-500 mb-1.5"
  const grid2 = "grid grid-cols-2 gap-3"

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <a href="/customers" className="text-gray-600 hover:text-gray-400 text-sm transition-colors">← Customers</a>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-medium text-gray-300">{customerName()}</span>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <a href={`/works/new?customer=${customerId}`}
            className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            + New job
          </a>
        </div>
      </div>

      <div className="px-6 py-5 max-w-screen-xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* LEFT: Summary */}
          <div className="space-y-4">
            {/* Header */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg font-bold flex-shrink-0">
                  {customerName().charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-base font-bold text-white">{customerName()}</div>
                  {customer.is_company && customer.first_name && (
                    <div className="text-xs text-gray-500">{customer.first_name} {customer.last_name}</div>
                  )}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {customer.email && <div><a href={`mailto:${customer.email}`} className="text-amber-400 hover:text-amber-300">{customer.email}</a></div>}
                {customer.phone && <div className="text-gray-300">{customer.phone}</div>}
                {customer.mobile && <div className="text-gray-400 text-xs">{customer.mobile}</div>}
                {customer.address_line1 && (
                  <div className="text-gray-400 text-xs pt-1 border-t border-gray-800 mt-2">
                    {customer.address_line1}{customer.postcode ? `, ${customer.postcode}` : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Financials */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Financials</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Total billed</span><span className="text-amber-400 font-semibold">{formatCurrency(totalValue)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Collected</span><span className="text-emerald-400 font-semibold">{formatCurrency(totalPaid)}</span></div>
                {outstanding > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Outstanding</span><span className="text-red-400 font-semibold">{formatCurrency(outstanding)}</span></div>}
                <div className="flex justify-between text-sm pt-1 border-t border-gray-800"><span className="text-gray-500">Total jobs</span><span className="text-gray-300">{works.length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Sites</span><span className="text-gray-300">{sites.length}</span></div>
              </div>
            </div>
          </div>

          {/* RIGHT: Tabs */}
          <div className="xl:col-span-2 space-y-4">
            {/* Tab nav */}
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
              {(['details', 'sites', 'work'] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`text-xs px-4 py-2 rounded-lg capitalize font-medium transition-colors ${tab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  {t === 'sites' ? `Sites (${sites.length})` : t === 'work' ? `Work (${works.length})` : t}
                </button>
              ))}
            </div>

            {/* Details tab */}
            {tab === 'details' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-white">Contact details</div>
                  {!editingContact
                    ? <button onClick={() => setEditingContact(true)} className="text-xs text-amber-400 hover:text-amber-300">Edit</button>
                    : <div className="flex gap-2">
                        <button onClick={() => { setEditingContact(false); setForm(customer) }} className="text-xs text-gray-500 border border-gray-700 px-3 py-1 rounded-lg hover:bg-gray-800">Cancel</button>
                        <button onClick={saveContact} disabled={saving} className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-3 py-1 rounded-lg">{saving ? 'Saving…' : 'Save'}</button>
                      </div>
                  }
                </div>
                {!editingContact ? (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      ['Email', customer.email], ['Phone', customer.phone],
                      ['Mobile', customer.mobile], ['Address', customer.address_line1],
                      ['City', customer.city], ['Postcode', customer.postcode],
                    ].map(([k, v]) => v ? (
                      <div key={k}><div className="text-xs text-gray-600 mb-0.5">{k}</div><div className="text-gray-200">{v}</div></div>
                    ) : null)}
                    {customer.notes && (
                      <div className="col-span-2 pt-3 border-t border-gray-800">
                        <div className="text-xs text-gray-600 mb-1">Notes</div>
                        <div className="text-sm text-gray-400">{customer.notes}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={grid2}>
                      <div><label className={lbl}>First name</label><input className={inp} value={form.first_name || ''} onChange={e => setForm((p: any) => ({ ...p, first_name: e.target.value }))}/></div>
                      <div><label className={lbl}>Last name</label><input className={inp} value={form.last_name || ''} onChange={e => setForm((p: any) => ({ ...p, last_name: e.target.value }))}/></div>
                    </div>
                    <div className={grid2}>
                      <div><label className={lbl}>Email</label><input type="email" className={inp} value={form.email || ''} onChange={e => setForm((p: any) => ({ ...p, email: e.target.value }))}/></div>
                      <div><label className={lbl}>Phone</label><input className={inp} value={form.phone || ''} onChange={e => setForm((p: any) => ({ ...p, phone: e.target.value }))}/></div>
                    </div>
                    <div><label className={lbl}>Address</label><input className={inp} value={form.address_line1 || ''} onChange={e => setForm((p: any) => ({ ...p, address_line1: e.target.value }))}/></div>
                    <div className={grid2}>
                      <div><label className={lbl}>City</label><input className={inp} value={form.city || ''} onChange={e => setForm((p: any) => ({ ...p, city: e.target.value }))}/></div>
                      <div><label className={lbl}>Postcode</label><input className={inp} value={form.postcode || ''} onChange={e => setForm((p: any) => ({ ...p, postcode: e.target.value }))}/></div>
                    </div>
                    <div><label className={lbl}>Notes</label><textarea className={`${inp} resize-none`} rows={2} value={form.notes || ''} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))}/></div>
                  </div>
                )}
              </div>
            )}

            {/* Sites tab */}
            {tab === 'sites' && (
              <div className="space-y-3">
                {sites.map(site => (
                  <div key={site.id} className={`bg-gray-900 border rounded-2xl p-5 ${site.is_default ? 'border-amber-500/30' : 'border-gray-800'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-white">{site.name}</div>
                          {site.is_default && <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">Default</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {[site.address_line1, site.city, site.postcode].filter(Boolean).join(', ') || 'No address set'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!site.is_default && (
                          <button onClick={() => setDefaultSite(site.id)} className="text-xs text-gray-500 hover:text-amber-400 transition-colors">Set default</button>
                        )}
                        <button onClick={() => { setEditingSite(site.id); setSiteForm({ name: site.name, address_line1: site.address_line1 || '', address_line2: site.address_line2 || '', city: site.city || '', county: site.county || '', postcode: site.postcode || '', property_type: site.property_type || '', epc_rating: site.epc_rating || '', floor_area_m2: site.floor_area_m2 || '', year_built: site.year_built || '', notes: site.notes || '' }) }} className="text-xs text-amber-400 hover:text-amber-300">Edit</button>
                        {!site.is_default && (
                          <button onClick={() => deleteSite(site.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors">Delete</button>
                        )}
                      </div>
                    </div>

                    {editingSite === site.id ? (
                      <div className="space-y-3 pt-3 border-t border-gray-800">
                        <div><label className={lbl}>Site name</label><input className={inp} value={siteForm.name} onChange={e => setSiteForm((p: any) => ({ ...p, name: e.target.value }))}/></div>
                        <div><label className={lbl}>Address</label><input className={inp} value={siteForm.address_line1} onChange={e => setSiteForm((p: any) => ({ ...p, address_line1: e.target.value }))}/></div>
                        <div className={grid2}>
                          <div><label className={lbl}>City</label><input className={inp} value={siteForm.city} onChange={e => setSiteForm((p: any) => ({ ...p, city: e.target.value }))}/></div>
                          <div><label className={lbl}>Postcode</label><input className={inp} value={siteForm.postcode} onChange={e => setSiteForm((p: any) => ({ ...p, postcode: e.target.value }))}/></div>
                        </div>
                        <div className={grid2}>
                          <div><label className={lbl}>Property type</label>
                            <select className={inp} value={siteForm.property_type} onChange={e => setSiteForm((p: any) => ({ ...p, property_type: e.target.value }))}>
                              <option value="">Select…</option>
                              {['Detached house','Semi-detached house','Terraced house','Flat / apartment','Bungalow','Commercial premises','Industrial','Other'].map(t => <option key={t}>{t}</option>)}
                            </select></div>
                          <div><label className={lbl}>EPC rating</label>
                            <select className={inp} value={siteForm.epc_rating} onChange={e => setSiteForm((p: any) => ({ ...p, epc_rating: e.target.value }))}>
                              <option value="">Unknown</option>
                              {['A','B','C','D','E','F','G'].map(r => <option key={r}>{r}</option>)}
                            </select></div>
                        </div>
                        <div className={grid2}>
                          <div><label className={lbl}>Floor area (m²)</label><input type="number" className={inp} value={siteForm.floor_area_m2} onChange={e => setSiteForm((p: any) => ({ ...p, floor_area_m2: e.target.value }))}/></div>
                          <div><label className={lbl}>Year built</label><input type="number" className={inp} value={siteForm.year_built} onChange={e => setSiteForm((p: any) => ({ ...p, year_built: e.target.value }))}/></div>
                        </div>
                        <div><label className={lbl}>Notes</label><textarea className={`${inp} resize-none`} rows={2} value={siteForm.notes} onChange={e => setSiteForm((p: any) => ({ ...p, notes: e.target.value }))}/></div>
                        <div className="flex gap-2">
                          <button onClick={() => saveSite(site.id)} disabled={saving}
                            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold text-sm py-2.5 rounded-xl">
                            {saving ? 'Saving…' : 'Save site'}
                          </button>
                          <button onClick={() => setEditingSite(null)}
                            className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        {site.property_type && <div><div className="text-gray-600">Type</div><div className="text-gray-300 mt-0.5">{site.property_type}</div></div>}
                        {site.epc_rating && <div><div className="text-gray-600">EPC</div>
                          <div className={`font-semibold mt-0.5 ${site.epc_rating <= 'B' ? 'text-emerald-400' : site.epc_rating === 'C' ? 'text-amber-400' : 'text-red-400'}`}>{site.epc_rating}</div></div>}
                        {site.floor_area_m2 && <div><div className="text-gray-600">Area</div><div className="text-gray-300 mt-0.5">{site.floor_area_m2} m²</div></div>}
                        {site.year_built && <div><div className="text-gray-600">Built</div><div className="text-gray-300 mt-0.5">{site.year_built}</div></div>}
                        {site.notes && <div className="col-span-3"><div className="text-gray-600">Notes</div><div className="text-gray-400 mt-0.5">{site.notes}</div></div>}
                      </div>
                    )}

                    {/* Works at this site */}
                    {(() => {
                      const siteWorks = works.filter(w => w.site_id === site.id)
                      if (siteWorks.length === 0) return null
                      return (
                        <div className="mt-3 pt-3 border-t border-gray-800">
                          <div className="text-xs text-gray-600 mb-2">{siteWorks.length} job{siteWorks.length > 1 ? 's' : ''} at this site</div>
                          <div className="space-y-1">
                            {siteWorks.slice(0, 3).map(w => (
                              <a key={w.id} href={`/works/${w.id}`}
                                className="flex items-center justify-between px-3 py-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
                                <span className="text-xs font-mono text-gray-500">{w.reference || '—'}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOUR[w.status] || 'text-gray-500 bg-gray-800'}`}>{STATUS_LABEL[w.status] || w.status}</span>
                                <span className="text-xs text-gray-400">{formatCurrency(w.total_gross || 0)}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                ))}

                {/* Add new site */}
                {showNewSite ? (
                  <div className="bg-gray-900 border border-amber-500/20 rounded-2xl p-5 space-y-3">
                    <div className="text-sm font-semibold text-white">New site</div>
                    <div><label className={lbl}>Site name</label><input className={inp} value={siteForm.name} onChange={e => setSiteForm((p: any) => ({ ...p, name: e.target.value }))} placeholder="Main home, Holiday cottage, Unit 4…"/></div>
                    <div><label className={lbl}>Address</label><input className={inp} value={siteForm.address_line1} onChange={e => setSiteForm((p: any) => ({ ...p, address_line1: e.target.value }))}/></div>
                    <div className={grid2}>
                      <div><label className={lbl}>City</label><input className={inp} value={siteForm.city} onChange={e => setSiteForm((p: any) => ({ ...p, city: e.target.value }))}/></div>
                      <div><label className={lbl}>Postcode</label><input className={inp} value={siteForm.postcode} onChange={e => setSiteForm((p: any) => ({ ...p, postcode: e.target.value }))}/></div>
                    </div>
                    <div className={grid2}>
                      <div><label className={lbl}>Property type</label>
                        <select className={inp} value={siteForm.property_type} onChange={e => setSiteForm((p: any) => ({ ...p, property_type: e.target.value }))}>
                          <option value="">Select…</option>
                          {['Detached house','Semi-detached house','Terraced house','Flat / apartment','Bungalow','Commercial premises','Industrial','Other'].map(t => <option key={t}>{t}</option>)}
                        </select></div>
                      <div><label className={lbl}>EPC rating</label>
                        <select className={inp} value={siteForm.epc_rating} onChange={e => setSiteForm((p: any) => ({ ...p, epc_rating: e.target.value }))}>
                          <option value="">Unknown</option>
                          {['A','B','C','D','E','F','G'].map(r => <option key={r}>{r}</option>)}
                        </select></div>
                    </div>
                    <div className={grid2}>
                      <div><label className={lbl}>Floor area (m²)</label><input type="number" className={inp} value={siteForm.floor_area_m2} onChange={e => setSiteForm((p: any) => ({ ...p, floor_area_m2: e.target.value }))}/></div>
                      <div><label className={lbl}>Year built</label><input type="number" className={inp} value={siteForm.year_built} onChange={e => setSiteForm((p: any) => ({ ...p, year_built: e.target.value }))}/></div>
                    </div>
                    <div><label className={lbl}>Notes</label><textarea className={`${inp} resize-none`} rows={2} value={siteForm.notes} onChange={e => setSiteForm((p: any) => ({ ...p, notes: e.target.value }))} placeholder="Access codes, parking, hazards…"/></div>
                    {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
                    <div className="flex gap-2">
                      <button onClick={() => saveSite()} disabled={saving}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold text-sm py-2.5 rounded-xl">
                        {saving ? 'Saving…' : 'Add site'}
                      </button>
                      <button onClick={() => setShowNewSite(false)}
                        className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowNewSite(true)}
                    className="w-full py-3 border border-dashed border-gray-700 rounded-2xl text-xs text-gray-500 hover:border-amber-500 hover:text-amber-400 transition-colors">
                    + Add another site
                  </button>
                )}
              </div>
            )}

            {/* Work tab */}
            {tab === 'work' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">Work history</div>
                  <a href={`/works/new?customer=${customerId}`} className="text-xs text-amber-400 hover:text-amber-300">+ New job</a>
                </div>
                {works.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-3xl mb-3 opacity-20">📋</div>
                    <div className="text-sm text-gray-600 mb-4">No work yet</div>
                    <a href={`/works/new?customer=${customerId}`} className="text-xs bg-amber-500 text-gray-950 font-bold px-4 py-2 rounded-xl hover:bg-amber-400">Create first job →</a>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left text-xs font-medium text-gray-600 px-5 py-3">Reference</th>
                        <th className="text-left text-xs font-medium text-gray-600 px-3 py-3 hidden md:table-cell">Site</th>
                        <th className="text-left text-xs font-medium text-gray-600 px-3 py-3">Status</th>
                        <th className="text-right text-xs font-medium text-gray-600 px-3 py-3">Value</th>
                        <th className="text-right text-xs font-medium text-gray-600 px-5 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {works.map(w => (
                        <tr key={w.id} onClick={() => router.push(`/works/${w.id}`)}
                          className="hover:bg-gray-800/40 cursor-pointer transition-colors group">
                          <td className="px-5 py-3"><span className="text-xs font-mono text-gray-500 group-hover:text-amber-400 transition-colors">{w.reference || '—'}</span></td>
                          <td className="px-3 py-3 hidden md:table-cell"><span className="text-xs text-gray-500">{w.sites?.name || '—'}</span></td>
                          <td className="px-3 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLOUR[w.status] || 'text-gray-500 bg-gray-800'}`}>{STATUS_LABEL[w.status] || w.status}</span></td>
                          <td className="px-3 py-3 text-right"><span className="text-sm font-semibold text-gray-200">{formatCurrency(w.total_gross || 0)}</span></td>
                          <td className="px-5 py-3 text-right"><span className="text-xs text-gray-600">{formatDate(w.created_at)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}