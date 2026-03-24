'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Check = { key: string; label: string; required?: boolean }

const SECTIONS: { title: string; icon: string; checks: Check[]; fields?: { key: string; label: string; unit: string; type?: string }[] }[] = [
  {
    title: 'System commissioning',
    icon: '⚙️',
    fields: [
      { key: 'system_pressure_bar', label: 'System pressure', unit: 'bar' },
      { key: 'flow_rate_lmin', label: 'Flow rate measured', unit: 'l/min' },
      { key: 'flow_temp_achieved_c', label: 'Flow temperature achieved', unit: '°C' },
      { key: 'return_temp_achieved_c', label: 'Return temperature achieved', unit: '°C' },
    ],
    checks: [
      { key: 'system_pressure_ok', label: 'System pressure within acceptable range (1–2 bar)', required: true },
      { key: 'delta_t_ok', label: 'ΔT (flow/return) achieved at design conditions', required: true },
    ],
  },
  {
    title: 'Heat pump checks',
    icon: '🔥',
    fields: [
      { key: 'hp_cop_measured', label: 'COP measured (if available)', unit: '' },
    ],
    checks: [
      { key: 'hp_antifreeze_checked', label: 'Antifreeze concentration checked (min 20%)', required: true },
      { key: 'hp_defrost_tested', label: 'Defrost cycle operation verified', required: true },
      { key: 'hp_controls_set', label: 'HP controls programmed and set correctly', required: true },
    ],
  },
  {
    title: 'Hot water (DHW)',
    icon: '💧',
    fields: [
      { key: 'dhw_temp_achieved_c', label: 'DHW temperature achieved', unit: '°C' },
    ],
    checks: [
      { key: 'dhw_legionella_cycle_set', label: 'Legionella pasteurisation cycle set (≥60°C)', required: true },
      { key: 'dhw_expansion_vessel_checked', label: 'Expansion vessel pressure checked', required: true },
    ],
  },
  {
    title: 'Electrical',
    icon: '⚡',
    checks: [
      { key: 'electrical_safe_isolation', label: 'Safe isolation procedure followed', required: true },
      { key: 'rcbo_fitted', label: 'RCBO / appropriate protection fitted', required: true },
      { key: 'earth_bonding_checked', label: 'Earth bonding checked and compliant', required: true },
    ],
  },
  {
    title: 'Handover & documentation',
    icon: '📋',
    checks: [
      { key: 'benchmark_completed', label: 'Benchmark (or equivalent) commissioning sheet completed', required: true },
      { key: 'handover_pack_given', label: 'Handover pack given to customer', required: true },
      { key: 'customer_demonstration', label: 'System operation demonstrated to customer', required: true },
    ],
  },
]

export default function CommissioningPage() {
  const params = useParams()
  const jobId = params.id as string
  const [record, setRecord] = useState<any>({})
  const [customer, setCustomer] = useState<any>(null)
  const [design, setDesign] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [existingId, setExistingId] = useState<string | null>(null)

  useEffect(() => { load() }, [jobId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }
    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)
    const { data: sd } = await (supabase as any).from('system_designs').select('*').eq('job_id', jobId).single()
    setDesign(sd)
    const { data: cr } = await (supabase as any).from('commissioning_records').select('*').eq('job_id', jobId).single()
    if (cr) { setRecord(cr); setExistingId(cr.id) }
    else {
      // Pre-fill from design
      const preload: any = {}
      if (sd?.flow_temp_c) preload.flow_temp_achieved_c = sd.flow_temp_c
      setRecord(preload)
    }
    setLoading(false)
  }

  function upd(updates: any) { setRecord((p: any) => ({ ...p, ...updates })) }
  function toggle(key: string) { upd({ [key]: !record[key] }) }

  // Count completion
  const allRequired = SECTIONS.flatMap(s => s.checks.filter(c => c.required).map(c => c.key))
  const completedRequired = allRequired.filter(k => record[k])
  const pct = Math.round((completedRequired.length / allRequired.length) * 100)

  async function save(redirect?: string) {
    setSaving(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const payload = {
        ...record,
        job_id: jobId,
        installer_id: session.user.id,
        updated_at: new Date().toISOString(),
      }
      if (existingId) {
        const { error: e } = await (supabase as any).from('commissioning_records').update(payload).eq('id', existingId)
        if (e) throw e
      } else {
        const { data, error: e } = await (supabase as any).from('commissioning_records').insert({ ...payload, created_at: new Date().toISOString() }).select().single()
        if (e) throw e
        if (data) setExistingId(data.id)
      }
      // Mark commissioning stage complete if all required checks done
      if (pct === 100) {
        await (supabase as any).from('job_stages').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('job_id', jobId).eq('stage', 'commissioning')
      }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
      if (redirect) window.location.href = redirect
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  const inp = "w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-sm text-gray-400">Loading...</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">Commissioning Checklist</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.address_line1}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">← Job</a>
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button onClick={() => save()} disabled={saving}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className={`px-4 py-2 text-xs flex items-center gap-4 ${pct === 100 ? 'bg-emerald-700 text-white' : 'bg-amber-600 text-white'}`}>
        <span className="font-medium">MCS Commissioning Record</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }}/>
          </div>
          <span>{completedRequired.length}/{allRequired.length} required checks</span>
        </div>
        <span className="ml-auto">{pct === 100 ? '✓ Commissioning complete' : `${100 - pct}% remaining`}</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Design summary */}
        {design && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-xs font-semibold text-gray-700 mb-3">System as designed</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><div className="text-gray-400">Heat pump</div><div className="font-medium">{design.design_inputs?.systemSpec?.hpModel || 'Not set'}</div></div>
              <div><div className="text-gray-400">Design flow temp</div><div className="font-medium">{design.flow_temp_c || '—'}°C</div></div>
              <div><div className="text-gray-400">Heat loss</div><div className="font-medium">{design.total_heat_loss_w ? `${(design.total_heat_loss_w/1000).toFixed(1)}kW` : '—'}</div></div>
              <div><div className="text-gray-400">SPF estimate</div><div className="font-medium">{design.scop_estimate || '—'}</div></div>
            </div>
          </div>
        )}

        {/* Commissioning date */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Commissioning date *</label>
              <input type="date" className={inp} value={record.commissioning_date || ''} onChange={e => upd({ commissioning_date: e.target.value })}/>
            </div>
            <div>
              <label className={lbl}>HP serial number</label>
              <input type="text" className={inp} value={record.hp_serial_number || ''} onChange={e => upd({ hp_serial_number: e.target.value })}/>
            </div>
          </div>
        </div>

        {/* Checklist sections */}
        {SECTIONS.map(section => (
          <div key={section.title} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100">
              <span className="text-lg">{section.icon}</span>
              <span className="text-sm font-semibold text-gray-900">{section.title}</span>
              <span className="ml-auto text-xs text-gray-400">
                {section.checks.filter(c => record[c.key]).length}/{section.checks.length} checks
              </span>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Measurement fields */}
              {section.fields && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-3 border-b border-gray-100">
                  {section.fields.map(f => (
                    <div key={f.key}>
                      <label className={lbl}>{f.label} {f.unit && <span className="text-gray-400">{f.unit}</span>}</label>
                      <input type="number" step="0.1" className={inp} value={record[f.key] || ''}
                        onChange={e => upd({ [f.key]: parseFloat(e.target.value) || null })}/>
                    </div>
                  ))}
                </div>
              )}
              {/* Checkboxes */}
              {section.checks.map(check => (
                <label key={check.key} className="flex items-center gap-3 cursor-pointer group">
                  <div onClick={() => toggle(check.key)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${record[check.key] ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 group-hover:border-emerald-400'}`}>
                    {record[check.key] && <svg width="12" height="9" viewBox="0 0 12 9" fill="white"><path d="M1 4l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span className={`text-sm ${record[check.key] ? 'text-gray-900' : 'text-gray-600'}`}>
                    {check.label}
                    {check.required && <span className="text-red-400 ml-1">*</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Notes */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-900 mb-3">Commissioning notes</div>
          <div className="space-y-3">
            <div>
              <label className={lbl}>General notes</label>
              <textarea className={`${inp} h-20 resize-none`} value={record.notes || ''}
                onChange={e => upd({ notes: e.target.value })} placeholder="Any notes about the commissioning visit..."/>
            </div>
            <div>
              <label className={lbl}>Defects or snags noted</label>
              <textarea className={`${inp} h-20 resize-none`} value={record.defects_noted || ''}
                onChange={e => upd({ defects_noted: e.target.value })} placeholder="List any defects — these will appear in the follow-up ticket"/>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => toggle('follow_up_required')}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${record.follow_up_required ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                {record.follow_up_required && <svg width="12" height="9" viewBox="0 0 12 9" fill="white"><path d="M1 4l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span className="text-sm text-gray-700">Follow-up visit required</span>
            </label>
          </div>
        </div>

        {/* Complete button */}
        <button onClick={() => save(`/jobs/${jobId}`)} disabled={saving || pct < 100}
          className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 text-white text-sm font-semibold py-3.5 rounded-2xl transition-colors">
          {saving ? 'Saving...' : pct < 100 ? `Complete ${allRequired.length - completedRequired.length} remaining checks to finish` : 'Save & mark commissioning complete →'}
        </button>
      </div>
    </div>
  )
}