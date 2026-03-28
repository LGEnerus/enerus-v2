'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, formatCurrency } from '@/lib/supabase'

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')
  const [newTab, setNewTab] = useState<'contact'|'site'>('contact')

  const [form, setForm] = useState({
    is_company: false, company_name: '',
    first_name: '', last_name: '',
    email: '', phone: '', mobile: '',
    address_line1: '', address_line2: '',
    city: '', county: '', postcode: '',
    notes: '',
  })

  const [siteForm, setSiteForm] = useState({
    name: 'Main property',
    address_line1: '', address_line2: '',
    city: '', county: '', postcode: '',
    property_type: '', epc_rating: '',
    floor_area_m2: '', year_built: '',
    notes: '',
    same_as_customer: true,
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)
    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)
    const { data } = await (supabase as any)
      .from('customers')
      .select('*, works(id, total_gross, status), sites(id)')
      .order('last_name')
    setCustomers(data || [])
    setLoading(false)
  }

  async function createCustomer() {
    if (!form.first_name) { setError('First name is required'); return }
    setSaving(true); setError('')
    try {
      // Create customer
      const { data: cust, error: custErr } = await (supabase as any)
        .from('customers')
        .insert({ ...form, account_id: accountId, created_by: userId })
        .select().single()
      if (custErr) throw custErr

      // Create default site
      const siteAddress = siteForm.same_as_customer ? {
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        city: form.city,
        county: form.county,
        postcode: form.postcode,
      } : {
        address_line1: siteForm.address_line1,
        address_line2: siteForm.address_line2,
        city: siteForm.city,
        county: siteForm.county,
        postcode: siteForm.postcode,
      }

      await (supabase as any).from('sites').insert({
        account_id: accountId,
        customer_id: cust.id,
        name: siteForm.name || 'Main property',
        ...siteAddress,
        property_type: siteForm.property_type || null,
        epc_rating: siteForm.epc_rating || null,
        floor_area_m2: siteForm.floor_area_m2 ? parseFloat(siteForm.floor_area_m2) : null,
        year_built: siteForm.year_built ? parseInt(siteForm.year_built) : null,
        notes: siteForm.notes || null,
        is_default: true,
      })

      setShowNew(false)
      resetForm()
      router.push(`/customers/${cust.id}`)
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  function resetForm() {
    setForm({ is_company: false, company_name: '', first_name: '', last_name: '', email: '', phone: '', mobile: '', address_line1: '', address_line2: '', city: '', county: '', postcode: '', notes: '' })
    setSiteForm({ name: 'Main property', address_line1: '', address_line2: '', city: '', county: '', postcode: '', property_type: '', epc_rating: '', floor_area_m2: '', year_built: '', notes: '', same_as_customer: true })
    setNewTab('contact')
  }

  function customerName(c: any) {
    if (c.is_company && c.company_name) return c.company_name
    return `${c.first_name} ${c.last_name}`
  }
  function customerValue(c: any) { return (c.works || []).reduce((s: number, w: any) => s + (w.total_gross || 0), 0) }
  function siteCount(c: any) { return (c.sites || []).length }

  const filtered = customers.filter(c => {
    if (!search) return true
    const name = `${c.first_name} ${c.last_name} ${c.company_name || ''} ${c.email || ''} ${c.postcode || ''}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-400 mb-1.5"
  const grid2 = "grid grid-cols-2 gap-3"

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-white">Customers</h1>
          <span className="text-xs text-gray-600">{customers.length} total</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/>
            </svg>
            <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 w-52"/>
          </div>
          <button onClick={() => setShowNew(true)}
            className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            + New customer
          </button>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Total customers</div>
            <div className="text-2xl font-bold text-white">{customers.length}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Total revenue</div>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(customers.reduce((s, c) => s + customerValue(c), 0))}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Avg per customer</div>
            <div className="text-2xl font-bold text-gray-300">
              {customers.length > 0 ? formatCurrency(customers.reduce((s, c) => s + customerValue(c), 0) / customers.length) : '£0'}
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-4xl mb-4 opacity-10">👥</div>
              <div className="text-sm font-medium text-gray-600 mb-1">{search ? 'No customers found' : 'No customers yet'}</div>
              {!search && (
                <button onClick={() => setShowNew(true)}
                  className="mt-4 text-xs bg-amber-500 text-gray-950 font-bold px-5 py-2.5 rounded-xl hover:bg-amber-400 transition-colors">
                  Add first customer →
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-600 px-5 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-gray-600 px-3 py-3 hidden md:table-cell">Contact</th>
                  <th className="text-left text-xs font-medium text-gray-600 px-3 py-3 hidden lg:table-cell">Location</th>
                  <th className="text-center text-xs font-medium text-gray-600 px-3 py-3">Sites</th>
                  <th className="text-right text-xs font-medium text-gray-600 px-3 py-3">Jobs</th>
                  <th className="text-right text-xs font-medium text-gray-600 px-5 py-3">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filtered.map(c => (
                  <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)}
                    className="hover:bg-gray-800/40 cursor-pointer transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold flex-shrink-0">
                          {customerName(c).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">{customerName(c)}</div>
                          {c.is_company && c.first_name && <div className="text-xs text-gray-600">{c.first_name} {c.last_name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <div className="text-xs text-gray-400">{c.email || '—'}</div>
                      <div className="text-xs text-gray-600">{c.phone || c.mobile || ''}</div>
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <div className="text-xs text-gray-400">{c.city || '—'}</div>
                      <div className="text-xs text-gray-600">{c.postcode || ''}</div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs font-medium ${siteCount(c) > 1 ? 'text-amber-400' : 'text-gray-600'}`}>
                        {siteCount(c) || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-sm text-gray-400">{(c.works || []).length}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-sm font-semibold ${customerValue(c) > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                        {formatCurrency(customerValue(c))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* New customer modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowNew(false); resetForm() } }}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <div className="text-base font-bold text-white">New customer</div>
              <button onClick={() => { setShowNew(false); resetForm() }} className="text-gray-600 hover:text-gray-400 text-xl">×</button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
              {(['contact', 'site'] as const).map(t => (
                <button key={t} onClick={() => setNewTab(t)}
                  className={`text-xs px-4 py-2 rounded-lg capitalize font-medium transition-colors ${newTab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  {t === 'contact' ? 'Contact details' : 'Property / site'}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

              {newTab === 'contact' && <>
                <div className="flex items-center gap-3">
                  <button onClick={() => setForm(p => ({ ...p, is_company: !p.is_company }))}
                    className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${form.is_company ? 'bg-amber-500' : 'bg-gray-700'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_company ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                  </button>
                  <span className="text-sm text-gray-300">Company / business account</span>
                </div>
                {form.is_company && (
                  <div><label className={lbl}>Company name</label>
                    <input className={inp} value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} placeholder="Acme Properties Ltd"/>
                  </div>
                )}
                <div className={grid2}>
                  <div><label className={lbl}>First name *</label>
                    <input className={inp} value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}/></div>
                  <div><label className={lbl}>Last name</label>
                    <input className={inp} value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}/></div>
                </div>
                <div className={grid2}>
                  <div><label className={lbl}>Email</label>
                    <input type="email" className={inp} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}/></div>
                  <div><label className={lbl}>Phone</label>
                    <input type="tel" className={inp} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}/></div>
                </div>
                <div className="pt-1 border-t border-gray-800">
                  <div className="text-xs text-gray-500 mb-3">Billing / contact address</div>
                  <div><label className={lbl}>Address line 1</label>
                    <input className={inp} value={form.address_line1} onChange={e => setForm(p => ({ ...p, address_line1: e.target.value }))} placeholder="12 Main Street"/></div>
                </div>
                <div className={grid2}>
                  <div><label className={lbl}>City</label>
                    <input className={inp} value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))}/></div>
                  <div><label className={lbl}>Postcode</label>
                    <input className={inp} value={form.postcode} onChange={e => setForm(p => ({ ...p, postcode: e.target.value }))}/></div>
                </div>
                <div><label className={lbl}>Notes</label>
                  <textarea className={`${inp} resize-none`} rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any relevant notes…"/></div>
              </>}

              {newTab === 'site' && <>
                <div className="bg-gray-800 rounded-xl p-3 text-xs text-gray-400">
                  A site is a property where work is carried out. You can add more sites later from the customer record. If no site is added, the customer's contact address is used.
                </div>
                <div><label className={lbl}>Site name</label>
                  <input className={inp} value={siteForm.name} onChange={e => setSiteForm(p => ({ ...p, name: e.target.value }))} placeholder="Main home, Holiday cottage, Unit 4…"/></div>

                {/* Same as customer address toggle */}
                <div className="flex items-center gap-3">
                  <button onClick={() => setSiteForm(p => ({ ...p, same_as_customer: !p.same_as_customer }))}
                    className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${siteForm.same_as_customer ? 'bg-amber-500' : 'bg-gray-700'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${siteForm.same_as_customer ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                  </button>
                  <span className="text-sm text-gray-300">Same address as contact details</span>
                </div>

                {!siteForm.same_as_customer && <>
                  <div><label className={lbl}>Address line 1</label>
                    <input className={inp} value={siteForm.address_line1} onChange={e => setSiteForm(p => ({ ...p, address_line1: e.target.value }))}/></div>
                  <div className={grid2}>
                    <div><label className={lbl}>City</label>
                      <input className={inp} value={siteForm.city} onChange={e => setSiteForm(p => ({ ...p, city: e.target.value }))}/></div>
                    <div><label className={lbl}>Postcode</label>
                      <input className={inp} value={siteForm.postcode} onChange={e => setSiteForm(p => ({ ...p, postcode: e.target.value }))}/></div>
                  </div>
                </>}

                <div className={grid2}>
                  <div><label className={lbl}>Property type</label>
                    <select className={inp} value={siteForm.property_type} onChange={e => setSiteForm(p => ({ ...p, property_type: e.target.value }))}>
                      <option value="">Select…</option>
                      {['Detached house','Semi-detached house','Terraced house','Flat / apartment','Bungalow','Commercial premises','Industrial','Other'].map(t => <option key={t}>{t}</option>)}
                    </select></div>
                  <div><label className={lbl}>EPC rating</label>
                    <select className={inp} value={siteForm.epc_rating} onChange={e => setSiteForm(p => ({ ...p, epc_rating: e.target.value }))}>
                      <option value="">Unknown</option>
                      {['A','B','C','D','E','F','G'].map(r => <option key={r}>{r}</option>)}
                    </select></div>
                </div>
                <div className={grid2}>
                  <div><label className={lbl}>Floor area (m²)</label>
                    <input type="number" className={inp} value={siteForm.floor_area_m2} onChange={e => setSiteForm(p => ({ ...p, floor_area_m2: e.target.value }))}/></div>
                  <div><label className={lbl}>Year built</label>
                    <input type="number" className={inp} value={siteForm.year_built} onChange={e => setSiteForm(p => ({ ...p, year_built: e.target.value }))} placeholder="1970"/></div>
                </div>
                <div><label className={lbl}>Site notes</label>
                  <textarea className={`${inp} resize-none`} rows={2} value={siteForm.notes} onChange={e => setSiteForm(p => ({ ...p, notes: e.target.value }))} placeholder="Access codes, parking, hazards…"/></div>
              </>}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-800 flex-shrink-0 space-y-2">
              {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
              <div className="flex gap-3">
                {newTab === 'contact' ? (
                  <>
                    <button onClick={() => setNewTab('site')}
                      className="flex-1 border border-gray-700 text-gray-400 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-800 transition-colors">
                      Next: add site →
                    </button>
                    <button onClick={createCustomer} disabled={saving}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold text-sm py-2.5 rounded-xl transition-colors">
                      {saving ? 'Saving…' : 'Create customer'}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setNewTab('contact')}
                      className="border border-gray-700 text-gray-400 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-800 transition-colors">
                      ← Back
                    </button>
                    <button onClick={createCustomer} disabled={saving}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold text-sm py-2.5 rounded-xl transition-colors">
                      {saving ? 'Saving…' : 'Create customer'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}