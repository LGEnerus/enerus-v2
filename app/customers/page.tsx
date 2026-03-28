'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate } from '@/lib/supabase'

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

  const [form, setForm] = useState({
    is_company: false, company_name: '',
    first_name: '', last_name: '',
    email: '', phone: '', mobile: '',
    address_line1: '', address_line2: '',
    city: '', county: '', postcode: '',
    property_type: '', epc_rating: '',
    notes: '',
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserId(session.user.id)

    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)

    // Load customers with their work count and total value
    const { data } = await (supabase as any)
      .from('customers')
      .select('*, works(id, total_gross, status)')
      .order('last_name')

    setCustomers(data || [])
    setLoading(false)
  }

  async function createCustomer() {
    if (!form.first_name) { setError('First name is required'); return }
    setSaving(true); setError('')
    try {
      const { data, error: err } = await (supabase as any)
        .from('customers')
        .insert({ ...form, account_id: accountId, created_by: userId })
        .select().single()
      if (err) throw err
      setShowNew(false)
      setForm({ is_company: false, company_name: '', first_name: '', last_name: '', email: '', phone: '', mobile: '', address_line1: '', address_line2: '', city: '', county: '', postcode: '', property_type: '', epc_rating: '', notes: '' })
      router.push(`/customers/${data.id}`)
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  function customerName(c: any) {
    if (c.is_company && c.company_name) return c.company_name
    return `${c.first_name} ${c.last_name}`
  }

  function customerValue(c: any) {
    return (c.works || []).reduce((s: number, w: any) => s + (w.total_gross || 0), 0)
  }

  function customerWorkCount(c: any) {
    return (c.works || []).length
  }

  const filtered = customers.filter(c => {
    if (!search) return true
    const name = `${c.first_name} ${c.last_name} ${c.company_name || ''} ${c.email || ''} ${c.postcode || ''}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-400 mb-1.5"

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-sm text-gray-600">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <h1 className="text-sm font-semibold text-white">Customers</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/>
            </svg>
            <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 w-56"/>
          </div>
          <button onClick={() => setShowNew(true)}
            className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            + New customer
          </button>
        </div>
      </div>

      <div className="px-6 py-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Total customers</div>
            <div className="text-2xl font-bold text-white">{customers.length}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Total revenue</div>
            <div className="text-2xl font-bold text-amber-400">
              {formatCurrency(customers.reduce((s, c) => s + customerValue(c), 0))}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Avg per customer</div>
            <div className="text-2xl font-bold text-gray-300">
              {customers.length > 0
                ? formatCurrency(customers.reduce((s, c) => s + customerValue(c), 0) / customers.length)
                : '£0'}
            </div>
          </div>
        </div>

        {/* Customer table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-4xl mb-4 opacity-10">👥</div>
              <div className="text-sm font-medium text-gray-600 mb-1">
                {search ? 'No customers found' : 'No customers yet'}
              </div>
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
                  <th className="text-right text-xs font-medium text-gray-600 px-3 py-3">Jobs</th>
                  <th className="text-right text-xs font-medium text-gray-600 px-5 py-3">Total value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filtered.map(c => (
                  <tr key={c.id}
                    onClick={() => router.push(`/customers/${c.id}`)}
                    className="hover:bg-gray-800/40 cursor-pointer transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold flex-shrink-0">
                          {customerName(c).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                            {customerName(c)}
                          </div>
                          {c.is_company && c.first_name && (
                            <div className="text-xs text-gray-600">{c.first_name} {c.last_name}</div>
                          )}
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
                    <td className="px-3 py-3 text-right">
                      <span className="text-sm text-gray-400">{customerWorkCount(c)}</span>
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowNew(false) }}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="text-base font-bold text-white">New customer</div>
              <button onClick={() => setShowNew(false)} className="text-gray-600 hover:text-gray-400 text-xl">×</button>
            </div>

            <div className="space-y-4">
              {/* Company toggle */}
              <div className="flex items-center gap-3">
                <button onClick={() => setForm(p => ({ ...p, is_company: !p.is_company }))}
                  className={`w-10 h-5 rounded-full transition-colors relative ${form.is_company ? 'bg-amber-500' : 'bg-gray-700'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_company ? 'translate-x-5' : 'translate-x-0.5'}`}/>
                </button>
                <span className="text-sm text-gray-300">Company / business</span>
              </div>

              {form.is_company && (
                <div>
                  <label className={lbl}>Company name</label>
                  <input type="text" className={inp} value={form.company_name}
                    onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))}/>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>First name *</label>
                  <input type="text" className={inp} value={form.first_name}
                    onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}/>
                </div>
                <div>
                  <label className={lbl}>Last name</label>
                  <input type="text" className={inp} value={form.last_name}
                    onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Email</label>
                  <input type="email" className={inp} value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}/>
                </div>
                <div>
                  <label className={lbl}>Phone</label>
                  <input type="tel" className={inp} value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}/>
                </div>
              </div>
              <div>
                <label className={lbl}>Address</label>
                <input type="text" className={inp} value={form.address_line1}
                  onChange={e => setForm(p => ({ ...p, address_line1: e.target.value }))}
                  placeholder="12 Main Street"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>City</label>
                  <input type="text" className={inp} value={form.city}
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))}/>
                </div>
                <div>
                  <label className={lbl}>Postcode</label>
                  <input type="text" className={inp} value={form.postcode}
                    onChange={e => setForm(p => ({ ...p, postcode: e.target.value }))}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Property type</label>
                  <select className={inp} value={form.property_type}
                    onChange={e => setForm(p => ({ ...p, property_type: e.target.value }))}>
                    <option value="">Select…</option>
                    <option>Detached house</option>
                    <option>Semi-detached house</option>
                    <option>Terraced house</option>
                    <option>Flat / apartment</option>
                    <option>Bungalow</option>
                    <option>Commercial</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>EPC rating</label>
                  <select className={inp} value={form.epc_rating}
                    onChange={e => setForm(p => ({ ...p, epc_rating: e.target.value }))}>
                    <option value="">Unknown</option>
                    {['A','B','C','D','E','F','G'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Notes</label>
                <textarea className={`${inp} resize-none`} rows={2} value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any relevant notes about this customer…"/>
              </div>

              {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}

              <div className="flex gap-3 pt-2">
                <button onClick={createCustomer} disabled={saving}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold text-sm py-3 rounded-xl transition-colors">
                  {saving ? 'Saving…' : 'Create customer'}
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