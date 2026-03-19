'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const emptyProfile = {
  company_name: '',
  trading_name: '',
  director_name: '',
  companies_house_number: '',
  address_line1: '',
  address_line2: '',
  city: '',
  postcode: '',
  phone: '',
  website: '',
  mcs_number: '',
  competencies: [] as string[],
  coverage_areas: [] as string[],
  public_liability_expiry: '',
  employers_liability_expiry: '',
  umbrella_agreement_signed: false,
  status: 'incomplete',
  completion_pct: 0,
}

type ProfileData = typeof emptyProfile

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>(emptyProfile)
  const [userId, setUserId] = useState('')
  const [profileId, setProfileId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'business' | 'compliance' | 'documents'>('business')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }
      setUserId(session.user.id)

      const { data } = await supabase
        .from('installer_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (data) {
        const { id, user_id, ...rest } = data as any
        setProfile({ ...emptyProfile, ...rest })
        setProfileId(id)
      }
      setLoading(false)
    }
    load()
  }, [])

  function calcCompletion(p: ProfileData): number {
    const checks = [
      !!p.company_name,
      !!p.director_name,
      !!p.address_line1,
      !!p.city,
      !!p.postcode,
      !!p.phone,
      !!p.mcs_number,
      (p.competencies?.length ?? 0) > 0,
      !!p.public_liability_expiry,
      !!p.employers_liability_expiry,
      !!p.umbrella_agreement_signed,
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }

  async function handleSave() {
    setSaving(true)
    const pct = calcCompletion(profile)
    const status = pct === 100 ? 'active' : 'incomplete'
    const payload: any = { ...profile, completion_pct: pct, status }

    if (profileId) {
        await (supabase as any)
        .from('installer_profiles')
        .update(payload)
        .eq('id', profileId)
    } else {
      const { data } = await supabase
        .from('installer_profiles')
        .insert({ ...payload, user_id: userId })
        .select()
        .single()
      if (data) setProfileId((data as any).id)
    }

    setProfile(prev => ({ ...prev, completion_pct: pct, status }))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function update(field: keyof ProfileData, value: any) {
    setProfile(prev => ({ ...prev, [field]: value }))
  }

  function toggleCompetency(val: string) {
    const current = profile.competencies ?? []
    update('competencies', current.includes(val)
      ? current.filter((c: string) => c !== val)
      : [...current, val]
    )
  }

  const pct = calcCompletion(profile)
  const isComplete = pct === 100

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
              <path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Enerus Plus</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">MCS Umbrella</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Dashboard</a>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save profile'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Profile header */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700 font-semibold text-lg">
                {(profile.company_name || 'E').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">{profile.company_name || 'Your company name'}</div>
                <div className="text-xs text-gray-400 mt-0.5">{profile.mcs_number || 'MCS number not set'}</div>
              </div>
            </div>
            <div className={`text-xs font-medium px-3 py-1 rounded-full ${isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {isComplete ? 'Profile complete' : `${pct}% complete`}
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-emerald-600 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}/>
          </div>
          {!isComplete && (
            <p className="text-xs text-amber-700 mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Complete all sections below to unlock job processing and the full platform.
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
          {(['business', 'compliance', 'documents'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tab === 'business' ? 'Business details' : tab === 'compliance' ? 'Compliance' : 'Documents'}
            </button>
          ))}
        </div>

        {/* Business details */}
        {activeTab === 'business' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Company name *</label>
                <input type="text" value={profile.company_name} onChange={e => update('company_name', e.target.value)} placeholder="Apex Renewables Ltd" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Trading name</label>
                <input type="text" value={profile.trading_name} onChange={e => update('trading_name', e.target.value)} placeholder="If different from above" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Director name *</label>
                <input type="text" value={profile.director_name} onChange={e => update('director_name', e.target.value)} placeholder="James Whitfield" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Companies House number</label>
                <input type="text" value={profile.companies_house_number} onChange={e => update('companies_house_number', e.target.value)} placeholder="14782651" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Address line 1 *</label>
              <input type="text" value={profile.address_line1} onChange={e => update('address_line1', e.target.value)} placeholder="14 Forge Street" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Address line 2</label>
              <input type="text" value={profile.address_line2} onChange={e => update('address_line2', e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">City *</label>
                <input type="text" value={profile.city} onChange={e => update('city', e.target.value)} placeholder="Manchester" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Postcode *</label>
                <input type="text" value={profile.postcode} onChange={e => update('postcode', e.target.value)} placeholder="M1 1AA" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone *</label>
                <input type="tel" value={profile.phone} onChange={e => update('phone', e.target.value)} placeholder="0161 400 7231" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Website</label>
                <input type="url" value={profile.website} onChange={e => update('website', e.target.value)} placeholder="https://apexrenewables.co.uk" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">MCS number *</label>
              <input type="text" value={profile.mcs_number} onChange={e => update('mcs_number', e.target.value)} placeholder="MCS/H/12749" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Competencies *</label>
              <div className="flex gap-3 flex-wrap">
                {['ashp', 'gshp', 'exhaust_air'].map(c => (
                  <button key={c} type="button" onClick={() => toggleCompetency(c)}
                    className={`text-xs px-4 py-2 rounded-lg border font-medium transition-colors ${
                      (profile.competencies ?? []).includes(c)
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'
                    }`}
                  >
                    {c === 'ashp' ? 'Air Source (ASHP)' : c === 'gshp' ? 'Ground Source (GSHP)' : 'Exhaust Air'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Compliance */}
        {activeTab === 'compliance' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Public liability insurance expiry *</label>
              <input type="date" value={profile.public_liability_expiry} onChange={e => update('public_liability_expiry', e.target.value)} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
              <p className="text-xs text-gray-400 mt-1">Minimum £2m public liability cover required</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Employer&apos;s liability insurance expiry *</label>
              <input type="date" value={profile.employers_liability_expiry} onChange={e => update('employers_liability_expiry', e.target.value)} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"/>
              <p className="text-xs text-gray-400 mt-1">Minimum £5m employer&apos;s liability cover required</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => update('umbrella_agreement_signed', !profile.umbrella_agreement_signed)}
                  className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center mt-0.5 transition-colors ${profile.umbrella_agreement_signed ? 'bg-emerald-700 border-emerald-700' : 'border-gray-300'}`}
                >
                  {profile.umbrella_agreement_signed && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                <div>
                  <div className="text-sm font-medium text-gray-900">Umbrella agreement *</div>
                  <div className="text-xs text-gray-500 mt-0.5">I confirm I have read and agree to the Enerus Plus MCS Umbrella Scheme terms and conditions, and that all information provided is accurate and up to date.</div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="text-xs font-medium text-gray-600 mb-3">Compliance checklist</div>
              {[
                { label: 'MCS number provided', done: !!profile.mcs_number },
                { label: 'Competency selected', done: (profile.competencies?.length ?? 0) > 0 },
                { label: 'Public liability insurance', done: !!profile.public_liability_expiry },
                { label: "Employer's liability insurance", done: !!profile.employers_liability_expiry },
                { label: 'Umbrella agreement signed', done: !!profile.umbrella_agreement_signed },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-emerald-100' : 'bg-gray-200'}`}>
                    {item.done && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3l2 2 4-4" stroke="#065f46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className={`text-xs ${item.done ? 'text-gray-700' : 'text-gray-400'}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        {activeTab === 'documents' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <p className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
              Document uploads will be enabled in the next release. Accepted formats: PDF, JPG, PNG (max 10MB each).
            </p>
            {[
              { label: 'Public liability insurance certificate', required: true },
              { label: "Employer's liability insurance certificate", required: true },
              { label: 'MCS qualifications & certificates', required: true },
              { label: 'F-Gas handler certificate', required: false },
              { label: 'Signed umbrella agreement', required: true },
            ].map(doc => (
              <div key={doc.label} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                <div>
                  <div className="text-sm text-gray-900 font-medium">{doc.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{doc.required ? 'Required' : 'Optional'}</div>
                </div>
                <button disabled className="text-xs bg-gray-100 text-gray-400 px-4 py-2 rounded-lg cursor-not-allowed">Upload</button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={handleSave} disabled={saving} className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  )
}