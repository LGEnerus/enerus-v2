'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const TRADES = [
  'Plumbing', 'Heating', 'Electrical', 'Gas', 'Building',
  'Roofing', 'Carpentry', 'Painting & Decorating', 'Tiling',
  'Renewables / Heat pumps', 'HVAC', 'General builder', 'Other',
]

const STEPS = ['Business', 'Contact', 'Preferences']

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)

  const [form, setForm] = useState({
    business_name: '',
    trading_name: '',
    director_name: '',
    companies_house_no: '',
    vat_registered: false,
    vat_number: '',
    trades: [] as string[],
    phone: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: '',
    county: '',
    postcode: '',
    invoice_prefix: 'INV',
    quote_prefix: 'QTE',
    invoice_payment_terms: 30,
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      // Pre-fill email from auth
      setForm(p => ({ ...p, email: session.user.email || '' }))
    })
  }, [router])

  function upd(updates: Partial<typeof form>) {
    setForm(p => ({ ...p, ...updates }))
  }

  function toggleTrade(trade: string) {
    setForm(p => ({
      ...p,
      trades: p.trades.includes(trade)
        ? p.trades.filter(t => t !== trade)
        : [...p.trades, trade]
    }))
  }

  async function finish() {
    setSaving(true); setError('')
    try {
      // 1. Create account record
      const { data: account, error: accErr } = await (supabase as any)
        .from('accounts')
        .insert({
          business_name: form.business_name,
          trading_name: form.trading_name || null,
          director_name: form.director_name || null,
          companies_house_no: form.companies_house_no || null,
          vat_registered: form.vat_registered,
          vat_number: form.vat_number || null,
          phone: form.phone,
          email: form.email,
          address_line1: form.address_line1 || null,
          address_line2: form.address_line2 || null,
          city: form.city || null,
          county: form.county || null,
          postcode: form.postcode || null,
          invoice_prefix: form.invoice_prefix,
          quote_prefix: form.quote_prefix,
          invoice_payment_terms: form.invoice_payment_terms,
          primary_colour: '#f59e0b',
          secondary_colour: '#0f1117',
        })
        .select()
        .single()

      if (accErr) throw accErr

      // 2. Create user record linked to account
      const { error: userErr } = await (supabase as any)
        .from('users')
        .insert({
          id: user.id,
          account_id: account.id,
          email: form.email,
          full_name: form.director_name || user.email,
          role: 'owner',
        })

      if (userErr) throw userErr

      router.push('/dashboard?welcome=1')
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-400 mb-1.5"
  const grid2 = "grid grid-cols-1 md:grid-cols-2 gap-4"

  const canNext = [
    form.business_name.length > 0,
    form.phone.length > 0 && form.email.length > 0,
    form.invoice_prefix.length > 0,
  ][step]

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#0f1117">
              <path d="M10 2L4 5.5v5c0 3.5 2.5 6.8 6 7.5 3.5-.7 6-4 6-7.5v-5L10 2z"/>
            </svg>
          </div>
          <div>
            <div className="text-base font-bold text-white">trade stack</div>
            <div className="text-xs text-gray-500">set up your account</div>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? 'bg-amber-500 text-gray-950' :
                i === step ? 'bg-amber-500 text-gray-950' :
                'bg-gray-800 text-gray-500'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs ${i === step ? 'text-white font-medium' : 'text-gray-500'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-700 mx-1"/>}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7 space-y-5">

          {/* Step 0: Business details */}
          {step === 0 && <>
            <div>
              <div className="text-lg font-bold text-white mb-1">Your business</div>
              <div className="text-sm text-gray-500">We'll use this on your quotes and invoices.</div>
            </div>
            <div>
              <label className={lbl}>Business name *</label>
              <input type="text" className={inp} value={form.business_name}
                onChange={e => upd({ business_name: e.target.value })}
                placeholder="Patel Plumbing & Heating Ltd"/>
            </div>
            <div>
              <label className={lbl}>Trading name (if different)</label>
              <input type="text" className={inp} value={form.trading_name}
                onChange={e => upd({ trading_name: e.target.value })}
                placeholder="Leave blank if same"/>
            </div>
            <div className={grid2}>
              <div>
                <label className={lbl}>Your name</label>
                <input type="text" className={inp} value={form.director_name}
                  onChange={e => upd({ director_name: e.target.value })}
                  placeholder="Jas Patel"/>
              </div>
              <div>
                <label className={lbl}>Companies House number</label>
                <input type="text" className={inp} value={form.companies_house_no}
                  onChange={e => upd({ companies_house_no: e.target.value })}
                  placeholder="12345678"/>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => upd({ vat_registered: !form.vat_registered })}
                className={`w-10 h-5 rounded-full transition-colors relative ${form.vat_registered ? 'bg-amber-500' : 'bg-gray-700'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.vat_registered ? 'translate-x-5' : 'translate-x-0.5'}`}/>
              </button>
              <span className="text-sm text-gray-300">VAT registered</span>
            </div>
            {form.vat_registered && (
              <div>
                <label className={lbl}>VAT number</label>
                <input type="text" className={inp} value={form.vat_number}
                  onChange={e => upd({ vat_number: e.target.value })}
                  placeholder="GB123456789"/>
              </div>
            )}
            <div>
              <label className={lbl}>What trades do you do? (select all that apply)</label>
              <div className="flex flex-wrap gap-2">
                {TRADES.map(t => (
                  <button key={t} onClick={() => toggleTrade(t)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      form.trades.includes(t)
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-gray-700 text-gray-500 hover:border-gray-500'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>}

          {/* Step 1: Contact details */}
          {step === 1 && <>
            <div>
              <div className="text-lg font-bold text-white mb-1">Contact details</div>
              <div className="text-sm text-gray-500">These appear on your quotes and invoices.</div>
            </div>
            <div className={grid2}>
              <div>
                <label className={lbl}>Phone number *</label>
                <input type="tel" className={inp} value={form.phone}
                  onChange={e => upd({ phone: e.target.value })}
                  placeholder="07700 900000"/>
              </div>
              <div>
                <label className={lbl}>Business email *</label>
                <input type="email" className={inp} value={form.email}
                  onChange={e => upd({ email: e.target.value })}
                  placeholder="hello@yourcompany.co.uk"/>
              </div>
            </div>
            <div>
              <label className={lbl}>Address line 1</label>
              <input type="text" className={inp} value={form.address_line1}
                onChange={e => upd({ address_line1: e.target.value })}
                placeholder="12 Trade Street"/>
            </div>
            <div>
              <label className={lbl}>Address line 2</label>
              <input type="text" className={inp} value={form.address_line2}
                onChange={e => upd({ address_line2: e.target.value })}
                placeholder="Industrial Estate"/>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>City</label>
                <input type="text" className={inp} value={form.city}
                  onChange={e => upd({ city: e.target.value })} placeholder="Birmingham"/>
              </div>
              <div>
                <label className={lbl}>Postcode</label>
                <input type="text" className={inp} value={form.postcode}
                  onChange={e => upd({ postcode: e.target.value })} placeholder="B1 1AA"/>
              </div>
            </div>
          </>}

          {/* Step 2: Preferences */}
          {step === 2 && <>
            <div>
              <div className="text-lg font-bold text-white mb-1">Document preferences</div>
              <div className="text-sm text-gray-500">How your quotes and invoices will be numbered.</div>
            </div>
            <div className={grid2}>
              <div>
                <label className={lbl}>Quote prefix</label>
                <input type="text" className={inp} value={form.quote_prefix}
                  onChange={e => upd({ quote_prefix: e.target.value.toUpperCase() })}
                  placeholder="QTE" maxLength={6}/>
                <div className="text-xs text-gray-600 mt-1">e.g. QTE-0001</div>
              </div>
              <div>
                <label className={lbl}>Invoice prefix</label>
                <input type="text" className={inp} value={form.invoice_prefix}
                  onChange={e => upd({ invoice_prefix: e.target.value.toUpperCase() })}
                  placeholder="INV" maxLength={6}/>
                <div className="text-xs text-gray-600 mt-1">e.g. INV-0001</div>
              </div>
            </div>
            <div>
              <label className={lbl}>Default payment terms (days)</label>
              <div className="flex gap-2">
                {[7, 14, 30, 60].map(d => (
                  <button key={d} onClick={() => upd({ invoice_payment_terms: d })}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                      form.invoice_payment_terms === d
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-gray-700 text-gray-500 hover:border-gray-500'
                    }`}>
                    {d} days
                  </button>
                ))}
              </div>
            </div>
            {/* Summary */}
            <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Account summary</div>
              <div className="flex justify-between"><span className="text-gray-500">Business</span><span className="text-gray-200">{form.business_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">VAT</span><span className="text-gray-200">{form.vat_registered ? `Registered · ${form.vat_number || 'no number yet'}` : 'Not registered'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Location</span><span className="text-gray-200">{form.city || form.postcode || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Quotes</span><span className="text-gray-200">{form.quote_prefix}-0001, -0002…</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Invoices</span><span className="text-gray-200">{form.invoice_prefix}-0001, -0002…</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Payment terms</span><span className="text-gray-200">{form.invoice_payment_terms} days</span></div>
            </div>
          </>}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-5">
          {step > 0 ? (
            <button onClick={() => setStep(p => p - 1)}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              ← Back
            </button>
          ) : <div/>}

          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(p => p + 1)} disabled={!canNext}
              className="bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-950 font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors">
              Continue →
            </button>
          ) : (
            <button onClick={finish} disabled={saving || !canNext}
              className="bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-950 font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors">
              {saving ? 'Creating account…' : 'Create account →'}
            </button>
          )}
        </div>

        <div className="text-center mt-6 text-xs text-gray-600">
          You can change all of this later in Settings
        </div>
      </div>
    </div>
  )
}