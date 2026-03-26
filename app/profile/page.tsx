'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const TABS = [
  { id: 'business',     label: 'Business',      icon: '🏢' },
  { id: 'accreditation',label: 'Accreditation', icon: '🏅' },
  { id: 'insurance',    label: 'Insurance',     icon: '🛡' },
  { id: 'branding',     label: 'Branding',      icon: '🎨' },
  { id: 'banking',      label: 'Banking',       icon: '🏦' },
]

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [userEmail, setUserEmail] = useState('')
  const [tab, setTab] = useState('business')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    setUser(session.user)
    const { data: ud } = await (supabase as any).from('users').select('*').eq('id', session.user.id).single()
    if (ud?.email) setUserEmail(ud.email)
    const { data: ip } = await (supabase as any).from('installer_profiles').select('*').eq('user_id', session.user.id).single()
    if (ip) {
      setProfile(ip)
      if (ip.logo_url) setLogoPreview(ip.logo_url)
    } else {
      // Create empty profile
      const { data: newProfile } = await (supabase as any).from('installer_profiles')
        .insert({ user_id: session.user.id, company_name: ud?.full_name || '', status: 'incomplete' })
        .select().single()
      setProfile(newProfile || { user_id: session.user.id, company_name: '', status: 'incomplete' })
    }
  }

  function upd(updates: any) {
    setProfile((prev: any) => ({ ...prev, ...updates }))
  }

  async function uploadLogo(file: File) {
    if (!user) return
    setUploadingLogo(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/logo.${ext}`
      const { error: upErr } = await supabase.storage.from('installer-logos').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('installer-logos').getPublicUrl(path)
      setLogoPreview(publicUrl)
      upd({ logo_url: publicUrl })
    } catch (e: any) { setError(e.message) }
    setUploadingLogo(false)
  }

  async function save() {
    setSaving(true); setError('')
    try {
      if (userEmail) {
        await (supabase as any).from('users').update({ email: userEmail }).eq('id', user?.id)
      }
      // Strip fields that don't exist on installer_profiles
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { email: _e, ...profileData } = profile || {}
      const payload = { ...profileData, user_id: user?.id, updated_at: new Date().toISOString() }
      let dbErr: any = null
      if (profile?.id) {
        const { error } = await (supabase as any).from('installer_profiles').update(payload).eq('id', profile.id)
        dbErr = error
      } else {
        const { error, data } = await (supabase as any).from('installer_profiles').insert(payload).select().single()
        dbErr = error
        if (data) setProfile(data)
      }
      if (dbErr) throw dbErr
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  // Completion percentage
  const fields = [
    profile?.company_name, profile?.address_line1, profile?.postcode,
    profile?.phone, userEmail, profile?.mcs_certificate_number,
    profile?.public_liability_insurer, profile?.logo_url,
  ]
  const completed = fields.filter(Boolean).length
  const pct = Math.round((completed / fields.length) * 100)

  const inp = "w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"
  const grid2 = "grid grid-cols-1 md:grid-cols-2 gap-4"

  if (!profile) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-sm text-gray-400">Loading...</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo preview */}
            <div className="w-16 h-16 rounded-xl border-2 border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50 cursor-pointer"
              onClick={() => logoRef.current?.click()}>
              {logoPreview
                ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain"/>
                : <span className="text-2xl">🏢</span>}
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{profile.company_name || 'Your company'}</h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }}/>
                </div>
                <span className="text-xs text-gray-400">{pct}% complete</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <a href="/dashboard" className="text-xs text-gray-400 hover:text-gray-600">← Dashboard</a>
            <button onClick={save} disabled={saving}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-sm font-medium px-5 py-2 rounded-xl">
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Status banner */}
        {profile.status === 'incomplete' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <div className="text-sm font-semibold text-amber-800">Profile incomplete</div>
              <div className="text-xs text-amber-700 mt-0.5">Complete your business details, MCS accreditation and insurance information to unlock the full platform.</div>
            </div>
          </div>
        )}
        {profile.status === 'active' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <span className="text-xl">✅</span>
            <div>
              <div className="text-sm font-semibold text-emerald-800">Profile active — MCS umbrella access granted</div>
              <div className="text-xs text-emerald-700 mt-0.5">MCS: {profile.mcs_certificate_number} · Subscription: {profile.subscription_plan}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <span>{t.icon}</span><span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">

          {/* Business */}
          {tab === 'business' && <>
            <div className={grid2}>
              <div>
                <label className={lbl}>Company name *</label>
                <input type="text" className={inp} value={profile.company_name || ''} onChange={e => upd({ company_name: e.target.value })}/>
              </div>
              <div>
                <label className={lbl}>Trading name (if different)</label>
                <input type="text" className={inp} value={profile.trading_name || ''} onChange={e => upd({ trading_name: e.target.value })}/>
              </div>
            </div>
            <div className={grid2}>
              <div>
                <label className={lbl}>Companies House number</label>
                <input type="text" className={inp} value={profile.companies_house_number || ''} onChange={e => upd({ companies_house_number: e.target.value })} placeholder="12345678"/>
              </div>
              <div>
                <label className={lbl}>VAT number</label>
                <input type="text" className={inp} value={profile.vat_number || ''} onChange={e => upd({ vat_number: e.target.value })} placeholder="GB123456789"/>
              </div>
            </div>
            <div>
              <label className={lbl}>Director / sole trader name</label>
              <input type="text" className={inp} value={profile.director_name || ''} onChange={e => upd({ director_name: e.target.value })}/>
            </div>
            <div>
              <label className={lbl}>Registered address</label>
              <input type="text" className={inp} value={profile.address_line1 || ''} onChange={e => upd({ address_line1: e.target.value })} placeholder="Address line 1"/>
            </div>
            <div>
              <input type="text" className={inp} value={profile.address_line2 || ''} onChange={e => upd({ address_line2: e.target.value })} placeholder="Address line 2 (optional)"/>
            </div>
            <div className={grid2}>
              <div>
                <input type="text" className={inp} value={profile.city || ''} onChange={e => upd({ city: e.target.value })} placeholder="City"/>
              </div>
              <div>
                <input type="text" className={inp} value={profile.postcode || ''} onChange={e => upd({ postcode: e.target.value })} placeholder="Postcode"/>
              </div>
            </div>
            <div className={grid2}>
              <div>
                <label className={lbl}>Phone *</label>
                <input type="tel" className={inp} value={profile.phone || ''} onChange={e => upd({ phone: e.target.value })}/>
              </div>
              <div>
                <label className={lbl}>Business email *</label>
                <input type="email" className={inp} value={userEmail} onChange={e => setUserEmail(e.target.value)}/>
              </div>
            </div>
            <div>
              <label className={lbl}>Website</label>
              <input type="url" className={inp} value={profile.website || ''} onChange={e => upd({ website: e.target.value })} placeholder="https://"/>
            </div>
          </>}

          {/* Accreditation */}
          {tab === 'accreditation' && <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
              Your MCS certificate number is required before you can submit BUS grant applications or generate MCS installation certificates.
            </div>
            <div className={grid2}>
              <div>
                <label className={lbl}>MCS certificate number *</label>
                <input type="text" className={inp} value={profile.mcs_certificate_number || ''} onChange={e => upd({ mcs_certificate_number: e.target.value })} placeholder="MCSXXXXXXX"/>
              </div>
              <div>
                <label className={lbl}>MCS expiry date</label>
                <input type="date" className={inp} value={profile.mcs_expiry_date || ''} onChange={e => upd({ mcs_expiry_date: e.target.value })}/>
              </div>
            </div>
            <div className={grid2}>
              <div>
                <label className={lbl}>TrustMark licence number</label>
                <input type="text" className={inp} value={profile.trustmark_number || ''} onChange={e => upd({ trustmark_number: e.target.value })}/>
              </div>
              <div>
                <label className={lbl}>Which? Trusted Trader number</label>
                <input type="text" className={inp} value={profile.which_trusted_trader || ''} onChange={e => upd({ which_trusted_trader: e.target.value })}/>
              </div>
            </div>
            <div>
              <label className={lbl}>Additional qualifications (e.g. F-Gas, Part P, OFTEC)</label>
              <textarea className={`${inp} h-24 resize-none`} value={profile.qualifications || ''} onChange={e => upd({ qualifications: e.target.value })} placeholder="List any additional qualifications, registration numbers and expiry dates"/>
            </div>
          </>}

          {/* Insurance */}
          {tab === 'insurance' && <>
            <div className="space-y-4">
              <div className="text-sm font-semibold text-gray-900">Public liability insurance</div>
              <div className={grid2}>
                <div>
                  <label className={lbl}>Insurer name</label>
                  <input type="text" className={inp} value={profile.public_liability_insurer || ''} onChange={e => upd({ public_liability_insurer: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Cover amount (£)</label>
                  <input type="number" className={inp} value={profile.public_liability_amount || ''} onChange={e => upd({ public_liability_amount: e.target.value })} placeholder="2000000"/>
                </div>
              </div>
              <div>
                <label className={lbl}>Policy expiry date</label>
                <input type="date" className={inp} value={profile.public_liability_expiry || ''} onChange={e => upd({ public_liability_expiry: e.target.value })}/>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <div className="text-sm font-semibold text-gray-900 mb-3">Professional indemnity insurance</div>
                <div className={grid2}>
                  <div>
                    <label className={lbl}>Insurer name</label>
                    <input type="text" className={inp} value={profile.indemnity_insurer || ''} onChange={e => upd({ indemnity_insurer: e.target.value })}/>
                  </div>
                  <div>
                    <label className={lbl}>Policy expiry date</label>
                    <input type="date" className={inp} value={profile.indemnity_expiry || ''} onChange={e => upd({ indemnity_expiry: e.target.value })}/>
                  </div>
                </div>
              </div>
            </div>
          </>}

          {/* Branding */}
          {tab === 'branding' && <>
            <div className="space-y-4">
              <div>
                <label className={lbl}>Company logo</label>
                <div className="flex items-start gap-4">
                  <div className="w-32 h-32 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 cursor-pointer hover:border-emerald-400 transition-colors"
                    onClick={() => logoRef.current?.click()}>
                    {logoPreview
                      ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2"/>
                      : <div className="text-center"><span className="text-3xl">🏢</span><div className="text-xs text-gray-400 mt-1">Click to upload</div></div>}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 mb-2">Appears on proposals, MCS certificates, and customer portal.</div>
                    <div className="text-xs text-gray-400">PNG, JPG or SVG · Max 5MB · Transparent background recommended</div>
                    <button onClick={() => logoRef.current?.click()} disabled={uploadingLogo}
                      className="mt-3 text-xs bg-white border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50">
                      {uploadingLogo ? 'Uploading...' : 'Choose file'}
                    </button>
                    <input ref={logoRef} type="file" className="hidden" accept="image/*"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }}/>
                  </div>
                </div>
              </div>

              <div className={grid2}>
                <div>
                  <label className={lbl}>Primary colour (proposals, headings)</label>
                  <div className="flex gap-2">
                    <input type="color" className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer" value={profile.primary_colour || '#059669'}
                      onChange={e => upd({ primary_colour: e.target.value })}/>
                    <input type="text" className={inp} value={profile.primary_colour || '#059669'}
                      onChange={e => upd({ primary_colour: e.target.value })}/>
                  </div>
                </div>
                <div>
                  <label className={lbl}>Secondary colour (text, accents)</label>
                  <div className="flex gap-2">
                    <input type="color" className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer" value={profile.secondary_colour || '#1f2937'}
                      onChange={e => upd({ secondary_colour: e.target.value })}/>
                    <input type="text" className={inp} value={profile.secondary_colour || '#1f2937'}
                      onChange={e => upd({ secondary_colour: e.target.value })}/>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className={lbl}>Proposal header preview</label>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="p-4 flex items-center justify-between" style={{ borderBottom: `3px solid ${profile.primary_colour || '#059669'}` }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-50 border border-gray-200 overflow-hidden">
                        {logoPreview ? <img src={logoPreview} alt="" className="w-full h-full object-contain"/> : <span className="text-lg">🏢</span>}
                      </div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: profile.secondary_colour || '#1f2937' }}>{profile.company_name || 'Your Company Ltd'}</div>
                        <div className="text-xs text-gray-400">MCS Accredited Installer</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold" style={{ color: profile.primary_colour || '#059669' }}>PROPOSAL REF-XXXXXX</div>
                      <div className="text-xs text-gray-400">Prepared: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>}

          {/* Banking */}
          {tab === 'banking' && <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              Banking details are used for BUS grant payments. They are encrypted and only visible to Enerus Plus admin.
            </div>
            <div>
              <label className={lbl}>Bank name</label>
              <input type="text" className={inp} value={profile.bank_name || ''} onChange={e => upd({ bank_name: e.target.value })}/>
            </div>
            <div className={grid2}>
              <div>
                <label className={lbl}>Sort code</label>
                <input type="text" className={inp} value={profile.bank_sort_code || ''} onChange={e => upd({ bank_sort_code: e.target.value })} placeholder="XX-XX-XX"/>
              </div>
              <div>
                <label className={lbl}>Account number</label>
                <input type="text" className={inp} value={profile.bank_account_number || ''} onChange={e => upd({ bank_account_number: e.target.value })} placeholder="XXXXXXXX"/>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Subscription</div>
              <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-900 capitalize">{profile.subscription_plan || 'Solo'} plan</div>
                  <div className="text-xs text-gray-400 mt-0.5">Status: <span className={`font-medium ${profile.subscription_status === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>{profile.subscription_status || 'Trial'}</span></div>
                  {profile.trial_ends_at && <div className="text-xs text-gray-400">Trial ends: {new Date(profile.trial_ends_at).toLocaleDateString('en-GB')}</div>}
                </div>
                <button className="text-xs bg-emerald-700 text-white px-4 py-2 rounded-lg hover:bg-emerald-800">Manage subscription</button>
              </div>
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}