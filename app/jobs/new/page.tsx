'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, type TradeType } from '@/lib/supabase'

const TRADES = [
  { value: 'plumbing', label: 'Plumbing' }, { value: 'heating', label: 'Heating' },
  { value: 'electrical', label: 'Electrical' }, { value: 'gas', label: 'Gas' },
  { value: 'building', label: 'Building' }, { value: 'roofing', label: 'Roofing' },
  { value: 'carpentry', label: 'Carpentry' }, { value: 'painting', label: 'Decorating' },
  { value: 'renewables', label: 'Renewables' }, { value: 'general', label: 'General' },
  { value: 'other', label: 'Other' },
]

function NewJobInner() {
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

  const [form, setForm] = useState({
    customer_id: preCustomerId,
    site_id: '',
    trade_type: 'general' as TradeType,
    title: '',
    description: '',
    site_address_line1: '',
    site_postcode: '',
    customer_notes: '',
    internal_notes: '',
    scheduled_start: '',
    scheduled_end: '',
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

  function customerName(c: any) {
    if (c.is_company && c.company_name) return c.company_name
    return `${c.first_name} ${c.last_name}`
  }

  const selectedCustomer = customers.find(c => c.id === form.customer_id)
  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true
    return `${c.first_name} ${c.last_name} ${c.company_name || ''}`.toLowerCase().includes(customerSearch.toLowerCase())
  })

  // Date picker component
  function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
        <label className="relative block cursor-pointer group">
          <input type="datetime-local" value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"/>
          <div className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm flex items-center justify-between group-hover:border-amber-500/60 transition-colors">
            <span className={value ? 'text-gray-100' : 'text-gray-600'}>{value ? new Date(value).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Click to set date & time'}</span>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-gray-600 flex-shrink-0"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
          </div>
        </label>
        {value && <button onClick={() => onChange('')} className="text-xs text-gray-600 hover:text-red-400 mt-1">× Clear</button>}
      </div>
    )
  }

  async function save() {
    if (!form.customer_id) { setError('Select a customer'); return }
    setSaving(true); setError('')
    try {
      const { data: refData } = await (supabase as any).rpc('generate_job_reference', { p_account_id: accountId })

      const { data: job, error: jErr } = await (supabase as any).from('jobs').insert({
        account_id: accountId, customer_id: form.customer_id,
        site_id: form.site_id || null, reference: refData,
        status: 'created', trade_type: form.trade_type,
        title: form.title || null, description: form.description || null,
        site_address_line1: form.site_address_line1 || null,
        site_postcode: form.site_postcode || null,
        customer_notes: form.customer_notes || null,
        internal_notes: form.internal_notes || null,
        scheduled_start: form.scheduled_start || null,
        scheduled_end: form.scheduled_end || null,
        created_by: userId,
      }).select().single()

      if (jErr) throw jErr

      await (supabase as any).from('activity_log').insert({
        account_id: accountId, entity_type: 'job', entity_id: job.id,
        event: 'created', summary: 'Job created', user_id: userId,
      })

      router.push(`/jobs/${job.id}`)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-400 mb-1.5"

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-semibold text-white">New job</span>
        <div className="ml-auto flex items-center gap-3">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button onClick={save} disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 text-xs font-bold px-5 py-2 rounded-lg">
            {saving ? 'Saving…' : 'Create job'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">

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
                {filteredCustomers.length === 0 && <div className="text-xs text-gray-600 py-4 text-center">No customers found</div>}
              </div>
            </div>
          )}
        </div>

        {/* Job details */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
          <div className="text-sm font-semibold text-white">Job details</div>
          <div>
            <label className={lbl}>Job title</label>
            <input className={inp} value={form.title} onChange={e => upd({ title: e.target.value })} placeholder="e.g. Boiler service, ASHP installation…"/>
          </div>
          <div>
            <label className={lbl}>Description</label>
            <textarea className={`${inp} resize-none`} rows={2} value={form.description} onChange={e => upd({ description: e.target.value })} placeholder="Scope of work…"/>
          </div>
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
          <DateField label="Scheduled start" value={form.scheduled_start} onChange={v => upd({ scheduled_start: v })}/>
          <DateField label="Scheduled end" value={form.scheduled_end} onChange={v => upd({ scheduled_end: v })}/>
          <div>
            <label className={lbl}>Notes for customer</label>
            <textarea className={`${inp} resize-none`} rows={2} value={form.customer_notes} onChange={e => upd({ customer_notes: e.target.value })}/>
          </div>
          <div>
            <label className={lbl}>Internal notes</label>
            <textarea className={`${inp} resize-none`} rows={2} value={form.internal_notes} onChange={e => upd({ internal_notes: e.target.value })}/>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={save} disabled={saving}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold py-3 rounded-xl transition-colors">
            {saving ? 'Saving…' : 'Create job'}
          </button>
          <button onClick={() => router.back()} className="px-5 bg-gray-900 border border-gray-700 text-gray-400 rounded-xl hover:bg-gray-800">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function NewJobPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-sm text-gray-600">Loading…</div></div>}>
      <NewJobInner />
    </Suspense>
  )
}