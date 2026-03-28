'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Tab = 'business' | 'invoicing' | 'team' | 'account'

export default function SettingsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('business')
  const [account, setAccount] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<any>({})
  const [userForm, setUserForm] = useState<any>({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: u } = await (supabase as any)
      .from('users').select('*, accounts(*)').eq('id', session.user.id).single()

    if (!u?.account_id) { router.push('/onboarding'); return }

    setUser(u)
    setAccount(u.accounts)
    setForm(u.accounts || {})
    setUserForm({ full_name: u.full_name || '', phone: u.phone || '', job_title: u.job_title || '' })

    const { data: teamUsers } = await (supabase as any)
      .from('users').select('*').eq('account_id', u.account_id).order('full_name')

    setUsers(teamUsers || [])
    setLoading(false)
  }

  function upd(updates: any) { setForm((p: any) => ({ ...p, ...updates })) }

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const { error: err } = await (supabase as any)
        .from('accounts')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', account.id)
      if (err) throw err

      await (supabase as any).from('users').update({
        full_name: userForm.full_name,
        phone: userForm.phone,
        job_title: userForm.job_title,
      }).eq('id', user.id)

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${account.id}/logo.${ext}`
      const { error: upErr } = await supabase.storage.from('account-logos').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('account-logos').getPublicUrl(path)
      upd({ logo_url: publicUrl })
    } catch (e: any) { setError(e.message) }
    setUploadingLogo(false)
  }

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-400 mb-1.5"
  const grid2 = "grid grid-cols-1 md:grid-cols-2 gap-4"

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-sm text-gray-600">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <h1 className="text-sm font-semibold text-white">Settings</h1>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-red-400">{error}</span>}
          {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
          <button onClick={save} disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="px-6 py-5 max-w-3xl mx-auto space-y-5">

        {/* Tab nav */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {(['business', 'invoicing', 'team', 'account'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs px-4 py-2 rounded-lg capitalize font-medium transition-colors ${tab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Business tab */}
        {tab === 'business' && (
          <div className="space-y-5">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
              <div className="text-sm font-semibold text-white">Business details</div>

              {/* Logo */}
              <div>
                <label className={lbl}>Business logo</label>
                <div className="flex items-center gap-4">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="Logo" className="w-16 h-16 object-contain bg-gray-800 rounded-xl border border-gray-700"/>
                  ) : (
                    <div className="w-16 h-16 bg-gray-800 rounded-xl border border-gray-700 flex items-center justify-center text-gray-600 text-2xl">🏢</div>
                  )}
                  <div>
                    <button onClick={() => logoRef.current?.click()}
                      className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-lg">
                      {uploadingLogo ? 'Uploading…' : 'Upload logo'}
                    </button>
                    <div className="text-xs text-gray-600 mt-1">PNG, JPG or WebP · Max 5MB</div>
                    <input ref={logoRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }}/>
                  </div>
                </div>
              </div>

              <div className={grid2}>
                <div>
                  <label className={lbl}>Business name *</label>
                  <input className={inp} value={form.business_name || ''} onChange={e => upd({ business_name: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Trading name</label>
                  <input className={inp} value={form.trading_name || ''} onChange={e => upd({ trading_name: e.target.value })} placeholder="If different from above"/>
                </div>
              </div>
              <div className={grid2}>
                <div>
                  <label className={lbl}>Director / owner name</label>
                  <input className={inp} value={form.director_name || ''} onChange={e => upd({ director_name: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Companies House number</label>
                  <input className={inp} value={form.companies_house_no || ''} onChange={e => upd({ companies_house_no: e.target.value })}/>
                </div>
              </div>
              <div className={grid2}>
                <div>
                  <label className={lbl}>Phone</label>
                  <input type="tel" className={inp} value={form.phone || ''} onChange={e => upd({ phone: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Business email</label>
                  <input type="email" className={inp} value={form.email || ''} onChange={e => upd({ email: e.target.value })}/>
                </div>
              </div>
              <div>
                <label className={lbl}>Address line 1</label>
                <input className={inp} value={form.address_line1 || ''} onChange={e => upd({ address_line1: e.target.value })}/>
              </div>
              <div className={grid2}>
                <div>
                  <label className={lbl}>City</label>
                  <input className={inp} value={form.city || ''} onChange={e => upd({ city: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Postcode</label>
                  <input className={inp} value={form.postcode || ''} onChange={e => upd({ postcode: e.target.value })}/>
                </div>
              </div>
              <div>
                <label className={lbl}>Website</label>
                <input type="url" className={inp} value={form.website || ''} onChange={e => upd({ website: e.target.value })} placeholder="https://"/>
              </div>
            </div>

            {/* VAT */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
              <div className="text-sm font-semibold text-white">VAT</div>
              <div className="flex items-center gap-3">
                <button onClick={() => upd({ vat_registered: !form.vat_registered })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${form.vat_registered ? 'bg-amber-500' : 'bg-gray-700'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.vat_registered ? 'translate-x-5' : 'translate-x-0.5'}`}/>
                </button>
                <span className="text-sm text-gray-300">VAT registered</span>
              </div>
              {form.vat_registered && (
                <div className={grid2}>
                  <div>
                    <label className={lbl}>VAT number</label>
                    <input className={inp} value={form.vat_number || ''} onChange={e => upd({ vat_number: e.target.value })} placeholder="GB123456789"/>
                  </div>
                  <div>
                    <label className={lbl}>VAT scheme</label>
                    <select className={inp} value={form.vat_scheme || 'standard'} onChange={e => upd({ vat_scheme: e.target.value })}>
                      <option value="standard">Standard</option>
                      <option value="flat_rate">Flat rate</option>
                      <option value="cash">Cash accounting</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Bank details */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
              <div className="text-sm font-semibold text-white">Bank details</div>
              <div className="text-xs text-gray-600">Shown on invoices for payment. Stored for reference only.</div>
              <div className={grid2}>
                <div>
                  <label className={lbl}>Bank name</label>
                  <input className={inp} value={form.bank_name || ''} onChange={e => upd({ bank_name: e.target.value })} placeholder="Barclays, HSBC…"/>
                </div>
                <div>
                  <label className={lbl}>Account name</label>
                  <input className={inp} value={form.bank_account_name || ''} onChange={e => upd({ bank_account_name: e.target.value })}/>
                </div>
              </div>
              <div className={grid2}>
                <div>
                  <label className={lbl}>Sort code</label>
                  <input className={inp} value={form.bank_sort_code || ''} onChange={e => upd({ bank_sort_code: e.target.value })} placeholder="00-00-00"/>
                </div>
                <div>
                  <label className={lbl}>Account number</label>
                  <input className={inp} value={form.bank_account_number || ''} onChange={e => upd({ bank_account_number: e.target.value })} placeholder="00000000"/>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Invoicing tab */}
        {tab === 'invoicing' && (
          <div className="space-y-5">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
              <div className="text-sm font-semibold text-white">Document numbering</div>
              <div className={grid2}>
                <div>
                  <label className={lbl}>Quote prefix</label>
                  <input className={inp} value={form.quote_prefix || 'QTE'} onChange={e => upd({ quote_prefix: e.target.value.toUpperCase() })} maxLength={6}/>
                  <div className="text-xs text-gray-600 mt-1">e.g. {form.quote_prefix || 'QTE'}-0001</div>
                </div>
                <div>
                  <label className={lbl}>Invoice prefix</label>
                  <input className={inp} value={form.invoice_prefix || 'INV'} onChange={e => upd({ invoice_prefix: e.target.value.toUpperCase() })} maxLength={6}/>
                  <div className="text-xs text-gray-600 mt-1">e.g. {form.invoice_prefix || 'INV'}-0001</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
              <div className="text-sm font-semibold text-white">Payment terms</div>
              <div>
                <label className={lbl}>Default payment terms (days)</label>
                <div className="flex gap-2">
                  {[7, 14, 30, 60].map(d => (
                    <button key={d} onClick={() => upd({ invoice_payment_terms: d })}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                        (form.invoice_payment_terms || 30) === d
                          ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                          : 'border-gray-700 text-gray-500 hover:border-gray-500'
                      }`}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
              <div className="text-sm font-semibold text-white">Default notes</div>
              <div>
                <label className={lbl}>Default invoice notes</label>
                <textarea className={`${inp} resize-none`} rows={3} value={form.invoice_notes_default || ''}
                  onChange={e => upd({ invoice_notes_default: e.target.value })}
                  placeholder="e.g. Payment due within 30 days. Thank you for your business."/>
              </div>
              <div>
                <label className={lbl}>Default quote notes</label>
                <textarea className={`${inp} resize-none`} rows={3} value={form.quote_notes_default || ''}
                  onChange={e => upd({ quote_notes_default: e.target.value })}
                  placeholder="e.g. This quote is valid for 30 days from the date of issue."/>
              </div>
            </div>
          </div>
        )}

        {/* Team tab */}
        {tab === 'team' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <div className="text-sm font-semibold text-white">Team members</div>
              <div className="text-xs text-gray-600 mt-0.5">Staff who have access to this account</div>
            </div>
            <div className="divide-y divide-gray-800">
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold flex-shrink-0">
                    {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200">{u.full_name || '—'}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
                    u.role === 'owner' ? 'bg-amber-500/15 text-amber-400' :
                    u.role === 'admin' ? 'bg-blue-900/50 text-blue-300' :
                    'bg-gray-800 text-gray-400'
                  }`}>{u.role}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-800">
              <div className="text-xs text-gray-600">To invite a team member, have them register at /register — they will need to be linked to your account manually for now.</div>
            </div>
          </div>
        )}

        {/* Account tab */}
        {tab === 'account' && (
          <div className="space-y-5">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
              <div className="text-sm font-semibold text-white">Your profile</div>
              <div>
                <label className={lbl}>Full name</label>
                <input className={inp} value={userForm.full_name} onChange={e => setUserForm((p: any) => ({ ...p, full_name: e.target.value }))}/>
              </div>
              <div className={grid2}>
                <div>
                  <label className={lbl}>Phone</label>
                  <input type="tel" className={inp} value={userForm.phone} onChange={e => setUserForm((p: any) => ({ ...p, phone: e.target.value }))}/>
                </div>
                <div>
                  <label className={lbl}>Job title</label>
                  <input className={inp} value={userForm.job_title} onChange={e => setUserForm((p: any) => ({ ...p, job_title: e.target.value }))} placeholder="Director, Lead engineer…"/>
                </div>
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input type="email" className={inp} value={user?.email || ''} disabled
                  style={{ opacity: 0.5, cursor: 'not-allowed' }}/>
                <div className="text-xs text-gray-600 mt-1">Email cannot be changed here</div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
              <div className="text-sm font-semibold text-white">Subscription</div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-200 capitalize font-medium">{account?.plan || 'Basic'} plan</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {account?.status === 'trial'
                      ? `Free trial · expires ${account.trial_ends_at ? new Date(account.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '—'}`
                      : account?.status === 'active' ? `Active · £${account?.plan === 'business' ? '30' : account?.plan === 'team' ? '20' : '15'}/month`
                      : account?.status === 'past_due' ? 'Payment overdue'
                      : account?.status === 'cancelled' ? 'Cancelled'
                      : account?.status}
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  account?.status === 'active' ? 'bg-emerald-900/50 text-emerald-300' :
                  account?.status === 'trial' ? 'bg-amber-900/50 text-amber-300' :
                  'bg-red-900/50 text-red-300'
                }`}>{account?.status}</span>
              </div>
              <div className="flex gap-2 pt-1">
                {(account?.status === 'trial' || account?.status === 'cancelled' || account?.status === 'past_due') && (
                  <a href="/pricing" className="flex-1 text-center text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold py-2.5 rounded-xl transition-colors">
                    {account?.status === 'trial' ? 'Upgrade now' : 'Resubscribe'}
                  </a>
                )}
                {account?.status === 'active' && account?.plan === 'solo' && (
                  <a href="/pricing" className="flex-1 text-center text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold py-2.5 rounded-xl transition-colors">
                    Upgrade to Premium
                  </a>
                )}
                {account?.status === 'active' && (
                  <a href="https://billing.stripe.com/p/login/test_00g00000000" target="_blank"
                    className="flex-1 text-center text-xs border border-gray-700 text-gray-400 hover:bg-gray-800 py-2.5 rounded-xl transition-colors">
                    Manage billing
                  </a>
                )}
              </div>
            </div>

            <div className="bg-gray-900 border border-red-500/10 rounded-2xl p-6 space-y-3">
              <div className="text-sm font-semibold text-red-400">Danger zone</div>
              <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
                className="text-xs text-gray-500 border border-gray-700 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}