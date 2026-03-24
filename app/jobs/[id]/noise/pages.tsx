'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─── MCS 020 Issue 2 Noise Calculation ───────────────────────────────────────
// Lp = Lw - 20·log10(r) - 8 + D + R - B
// Lp = sound pressure level at assessment point dB(A)
// Lw = sound power level of HP dB(A)
// r  = distance from HP to assessment point (m)
// D  = directivity correction (0 for free field, 3 for one reflecting surface)
// R  = reflective surface bonus (+3 per additional surface, max +9 for 3 surfaces)
// B  = barrier attenuation dB (0 if no barrier)

function calcNoise(lw: number, r: number, surfaces: number, hasBarrier: boolean, batten: number): number {
  const D = 3  // Standard ground reflection always applies
  const R = Math.min(surfaces, 3) * 3  // +3dB per reflective surface
  const B = hasBarrier ? batten : 0
  return Math.round((lw - 20 * Math.log10(Math.max(r, 0.1)) - 8 + D + R - B) * 10) / 10
}

type AssessmentPoint = {
  id: string
  description: string
  distanceM: number
  surfaces: number
  hasBarrier: boolean
  barrierAttenuation: number
  result: number
  pass: boolean
}

type NoiseData = {
  hpSoundPowerDb: number
  hpModel: string
  installationAddress: string
  assessorName: string
  assessmentDate: string
  hpLocation: string
  hpOrientation: string
  assessmentPoints: AssessmentPoint[]
  overallPass: boolean
  notes: string
  pdpReference: string  // MCS Product Directory reference
}

const defaultPoint = (id: string): AssessmentPoint => ({
  id, description: 'Nearest habitable room window/door', distanceM: 3,
  surfaces: 1, hasBarrier: false, barrierAttenuation: 0, result: 0, pass: true,
})

export default function NoiseAssessmentPage() {
  const params = useParams()
  const jobId = params.id as string

  const [customer, setCustomer] = useState<any>(null)
  const [job, setJob] = useState<any>(null)
  const [noise, setNoise] = useState<NoiseData>({
    hpSoundPowerDb: 63,
    hpModel: '',
    installationAddress: '',
    assessorName: '',
    assessmentDate: new Date().toISOString().split('T')[0],
    hpLocation: '',
    hpOrientation: '',
    assessmentPoints: [defaultPoint('ap1')],
    overallPass: true,
    notes: '',
    pdpReference: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [jobId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }
    setJob(jd)
    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)
    const { data: sd } = await (supabase as any).from('system_designs').select('*').eq('job_id', jobId).single()
    if (sd) {
      const di = sd.design_inputs || {}
      // Pre-fill from HP selection
      if (di.systemSpec?.hpSoundPowerDb) {
        setNoise(prev => ({ ...prev, hpSoundPowerDb: di.systemSpec.hpSoundPowerDb }))
      }
      if (di.systemSpec?.hpModel) {
        setNoise(prev => ({ ...prev, hpModel: di.systemSpec.hpModel }))
      }
      if (di.noiseAssessment) {
        setNoise(di.noiseAssessment)
      }
    }
    if (cd) {
      const addr = [cd.address_line1, cd.address_line2, cd.city, cd.postcode].filter(Boolean).join(', ')
      setNoise(prev => ({ ...prev, installationAddress: addr }))
    }
    setLoading(false)
  }

  // Recalculate all assessment points when inputs change
  function recalcPoints(points: AssessmentPoint[], lw: number): AssessmentPoint[] {
    return points.map(p => {
      const result = calcNoise(lw, p.distanceM, p.surfaces, p.hasBarrier, p.barrierAttenuation)
      return { ...p, result, pass: result <= 37 }
    })
  }

  function updNoise(updates: Partial<NoiseData>) {
    setNoise(prev => {
      const next = { ...prev, ...updates }
      // Recalc all points if Lw changed
      if (updates.hpSoundPowerDb !== undefined) {
        next.assessmentPoints = recalcPoints(next.assessmentPoints, updates.hpSoundPowerDb)
      }
      next.overallPass = next.assessmentPoints.every(p => p.pass)
      return next
    })
  }

  function updPoint(id: string, updates: Partial<AssessmentPoint>) {
    setNoise(prev => {
      const points = prev.assessmentPoints.map(p => {
        if (p.id !== id) return p
        const updated = { ...p, ...updates }
        updated.result = calcNoise(prev.hpSoundPowerDb, updated.distanceM, updated.surfaces, updated.hasBarrier, updated.barrierAttenuation)
        updated.pass = updated.result <= 37
        return updated
      })
      return { ...prev, assessmentPoints: points, overallPass: points.every(p => p.pass) }
    })
  }

  function addPoint() {
    const id = `ap_${Date.now()}`
    const pt = defaultPoint(id)
    pt.result = calcNoise(noise.hpSoundPowerDb, pt.distanceM, pt.surfaces, pt.hasBarrier, pt.barrierAttenuation)
    pt.pass = pt.result <= 37
    setNoise(prev => ({ ...prev, assessmentPoints: [...prev.assessmentPoints, pt], overallPass: [...prev.assessmentPoints, pt].every(p => p.pass) }))
  }

  function removePoint(id: string) {
    setNoise(prev => {
      const points = prev.assessmentPoints.filter(p => p.id !== id)
      return { ...prev, assessmentPoints: points, overallPass: points.every(p => p.pass) }
    })
  }

  async function save(redirect?: string) {
    setSaving(true); setSaveError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: sd } = await (supabase as any).from('system_designs').select('design_inputs').eq('job_id', jobId).single()
      const existing = sd?.design_inputs || {}
      const payload = {
        design_inputs: { ...existing, noiseAssessment: noise },
        noise_level_db: Math.max(...noise.assessmentPoints.map(p => p.result)),
        noise_compliant: noise.overallPass,
        updated_at: new Date().toISOString(),
      }
      const { error } = await (supabase as any).from('system_designs').update(payload).eq('job_id', jobId)
      if (error) { setSaveError(error.message); setSaving(false); return }
      // Mark noise stage complete on job stages if passing
      if (noise.overallPass) {
        await (supabase as any).from('job_stages').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('job_id', jobId).eq('stage', 'design')
      }
      await (supabase as any).from('audit_log').insert({
        job_id: jobId, user_id: session.user.id, action: 'noise_assessment_saved', stage: 'design',
        entity_type: 'system_design',
        description: `MCS 020(a) noise: ${noise.assessmentPoints.length} point(s), max ${Math.max(...noise.assessmentPoints.map(p => p.result))}dB — ${noise.overallPass ? 'PASS' : 'FAIL'}`,
      })
      setSaving(false); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      if (redirect) window.location.href = redirect
    } catch (e: any) { setSaveError(e.message); setSaving(false) }
  }

  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const sel = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"
  const maxDb = noise.assessmentPoints.length > 0 ? Math.max(...noise.assessmentPoints.map(p => p.result)) : 0

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">MCS 020(a) Noise Assessment</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.address_line1}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">← Job</a>
          {saveError && <span className="text-xs text-red-600">{saveError}</span>}
          <button onClick={() => save()} disabled={saving}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Compliance banner */}
      <div className={`px-4 py-2 text-xs flex items-center gap-4 ${noise.overallPass ? 'bg-emerald-700 text-white' : 'bg-red-600 text-white'}`}>
        <span className="font-medium">MCS 020(a) Issue 2</span>
        <span>Permitted Development Right compliance</span>
        <span>Limit: 37 dB(A) at assessment point</span>
        <span className="ml-auto font-semibold">
          {noise.assessmentPoints.length > 0 ? `Worst case: ${maxDb} dB — ${noise.overallPass ? '✓ COMPLIANT' : '✗ NON-COMPLIANT'}` : 'No assessment points added'}
        </span>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left: Installation details ──────────────────────────────────── */}
          <div className="space-y-4">

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Installation details</div>
              <div className="space-y-3">
                <div>
                  <label className={lbl}>Installation address</label>
                  <input type="text" className={inp} value={noise.installationAddress}
                    onChange={e => updNoise({ installationAddress: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Heat pump model</label>
                  <input type="text" className={inp} value={noise.hpModel} placeholder="e.g. Vaillant aroTHERM plus 7kW"
                    onChange={e => updNoise({ hpModel: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>MCS Product Directory reference</label>
                  <input type="text" className={inp} value={noise.pdpReference} placeholder="e.g. VWF 87/4"
                    onChange={e => updNoise({ pdpReference: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Sound power level Lw dB(A)</label>
                  <input type="number" className={inp} value={noise.hpSoundPowerDb} step={0.5}
                    onChange={e => updNoise({ hpSoundPowerDb: parseFloat(e.target.value) || 63 })}/>
                  <div className="text-xs text-gray-400 mt-0.5">From MCS Product Directory datasheet</div>
                </div>
                <div>
                  <label className={lbl}>HP proposed location</label>
                  <input type="text" className={inp} value={noise.hpLocation} placeholder="e.g. Rear of property, north elevation"
                    onChange={e => updNoise({ hpLocation: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>HP orientation / fan discharge direction</label>
                  <select className={sel} value={noise.hpOrientation} onChange={e => updNoise({ hpOrientation: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="away_from_neighbour">Fan discharge away from neighbour</option>
                    <option value="towards_neighbour">Fan discharge towards neighbour</option>
                    <option value="parallel">Fan discharge parallel to boundary</option>
                    <option value="upward">Fan discharge upward</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Assessment details</div>
              <div className="space-y-3">
                <div>
                  <label className={lbl}>Assessor name</label>
                  <input type="text" className={inp} value={noise.assessorName}
                    onChange={e => updNoise({ assessorName: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Assessment date</label>
                  <input type="date" className={inp} value={noise.assessmentDate}
                    onChange={e => updNoise({ assessmentDate: e.target.value })}/>
                </div>
                <div>
                  <label className={lbl}>Additional notes</label>
                  <textarea className={`${inp} h-20 resize-none`} value={noise.notes}
                    placeholder="Site-specific conditions, mitigation measures considered, etc."
                    onChange={e => updNoise({ notes: e.target.value })}/>
                </div>
              </div>
            </div>

            {/* Formula reference */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-700 mb-2">MCS 020(a) formula</div>
              <div className="font-mono text-xs text-gray-600 bg-white rounded-lg p-3 border border-gray-200">
                Lp = Lw − 20·log₁₀(r) − 8 + D + R − B
              </div>
              <div className="mt-2 space-y-1 text-xs text-gray-500">
                <div><span className="font-medium w-4 inline-block">Lp</span> Sound pressure at assessment point</div>
                <div><span className="font-medium w-4 inline-block">Lw</span> HP sound power level dB(A)</div>
                <div><span className="font-medium w-4 inline-block">r</span> Distance to assessment point (m)</div>
                <div><span className="font-medium w-4 inline-block">D</span> Ground reflection +3 dB (always)</div>
                <div><span className="font-medium w-4 inline-block">R</span> +3 dB per reflective surface</div>
                <div><span className="font-medium w-4 inline-block">B</span> Barrier attenuation (dB)</div>
              </div>
              <div className="mt-2 text-xs text-gray-400">Limit: ≤ 37 dB(A) for PDR in England (Sept 2025)</div>
            </div>
          </div>

          {/* ── Right: Assessment points ────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Assessment points</h2>
                <p className="text-xs text-gray-400 mt-0.5">Add one point per neighbouring habitable room window/door. All must pass.</p>
              </div>
              <button onClick={addPoint} className="text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-800">
                + Add point
              </button>
            </div>

            {noise.assessmentPoints.map((pt, pi) => (
              <div key={pt.id} className={`bg-white border-2 rounded-xl overflow-hidden ${pt.pass ? 'border-gray-200' : 'border-red-300'}`}>
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="text-xs font-semibold text-gray-700">Assessment Point {pi + 1}</div>
                  <div className="flex items-center gap-3">
                    <div className={`text-sm font-bold ${pt.pass ? 'text-emerald-700' : 'text-red-600'}`}>
                      {pt.result} dB — {pt.pass ? '✓ PASS' : '✗ FAIL'}
                    </div>
                    {noise.assessmentPoints.length > 1 && (
                      <button onClick={() => removePoint(pt.id)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                    )}
                  </div>
                </div>

                <div className="px-4 py-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                    <div className="col-span-2 md:col-span-3">
                      <label className={lbl}>Description of assessment location</label>
                      <input type="text" className={inp} value={pt.description}
                        placeholder="e.g. Rear bedroom window of No.14"
                        onChange={e => updPoint(pt.id, { description: e.target.value })}/>
                    </div>
                    <div>
                      <label className={lbl}>Distance from HP (m)</label>
                      <input type="number" className={inp} value={pt.distanceM} step={0.5} min={0.1}
                        onChange={e => updPoint(pt.id, { distanceM: parseFloat(e.target.value) || 1 })}/>
                    </div>
                    <div>
                      <label className={lbl}>Reflective surfaces</label>
                      <select className={sel} value={pt.surfaces} onChange={e => updPoint(pt.id, { surfaces: parseInt(e.target.value) })}>
                        <option value={0}>0 — Free field</option>
                        <option value={1}>1 — One wall (+3dB)</option>
                        <option value={2}>2 — Corner (+6dB)</option>
                        <option value={3}>3 — Three surfaces (+9dB)</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Acoustic barrier</label>
                      <select className={sel} value={pt.hasBarrier ? 'yes' : 'no'} onChange={e => updPoint(pt.id, { hasBarrier: e.target.value === 'yes' })}>
                        <option value="no">No barrier</option>
                        <option value="yes">Barrier present</option>
                      </select>
                    </div>
                    {pt.hasBarrier && (
                      <div>
                        <label className={lbl}>Barrier attenuation (dB)</label>
                        <input type="number" className={inp} value={pt.barrierAttenuation} step={0.5}
                          onChange={e => updPoint(pt.id, { barrierAttenuation: parseFloat(e.target.value) || 0 })}/>
                      </div>
                    )}
                  </div>

                  {/* Calculation breakdown */}
                  <div className="bg-gray-50 rounded-xl p-3 font-mono text-xs">
                    <div className="text-gray-500 mb-2">Calculation breakdown:</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div className="flex justify-between"><span>Lw (sound power)</span><span className="font-semibold">{noise.hpSoundPowerDb} dB</span></div>
                      <div className="flex justify-between"><span>−20·log₁₀({pt.distanceM})</span><span className="font-semibold">−{(20 * Math.log10(pt.distanceM)).toFixed(1)} dB</span></div>
                      <div className="flex justify-between"><span>−8 (free field)</span><span className="font-semibold">−8 dB</span></div>
                      <div className="flex justify-between"><span>+D (ground reflection)</span><span className="font-semibold">+3 dB</span></div>
                      <div className="flex justify-between"><span>+R ({pt.surfaces} surfaces)</span><span className="font-semibold">+{pt.surfaces * 3} dB</span></div>
                      <div className="flex justify-between"><span>−B (barrier)</span><span className="font-semibold">−{pt.hasBarrier ? pt.barrierAttenuation : 0} dB</span></div>
                    </div>
                    <div className={`flex justify-between mt-2 pt-2 border-t border-gray-200 font-bold text-sm ${pt.pass ? 'text-emerald-700' : 'text-red-600'}`}>
                      <span>Result Lp</span><span>{pt.result} dB {pt.pass ? '≤ 37 ✓' : '> 37 ✗'}</span>
                    </div>
                  </div>

                  {/* Fail advice */}
                  {!pt.pass && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
                      <div className="font-semibold mb-1">Mitigation required — options:</div>
                      <div className="space-y-0.5">
                        <div>• Increase distance from HP to assessment point</div>
                        <div>• Install acoustic barrier (manufacturer-certified)</div>
                        <div>• Reposition HP to face away from the assessment point</div>
                        <div>• Select a quieter HP model from MCS Product Directory</div>
                        <div>• Consider Quiet Mode operation (check HP datasheet)</div>
                      </div>
                      <div className="mt-2 font-medium">Shortfall: {(pt.result - 37).toFixed(1)} dB above limit</div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Overall result */}
            {noise.assessmentPoints.length > 0 && (
              <div className={`rounded-xl p-5 border-2 ${noise.overallPass ? 'bg-emerald-50 border-emerald-400' : 'bg-red-50 border-red-400'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className={`text-lg font-bold ${noise.overallPass ? 'text-emerald-700' : 'text-red-700'}`}>
                      {noise.overallPass ? '✓ MCS 020(a) Compliant' : '✗ MCS 020(a) Non-Compliant'}
                    </div>
                    <div className={`text-xs mt-1 ${noise.overallPass ? 'text-emerald-600' : 'text-red-600'}`}>
                      {noise.assessmentPoints.length} assessment point{noise.assessmentPoints.length !== 1 ? 's' : ''} · 
                      Worst case: {maxDb} dB(A) · 
                      Limit: 37 dB(A)
                    </div>
                  </div>
                  <div className={`text-3xl font-bold ${noise.overallPass ? 'text-emerald-700' : 'text-red-700'}`}>
                    {maxDb} dB
                  </div>
                </div>
                {noise.overallPass && (
                  <div className="mt-3 text-xs text-emerald-700">
                    This installation meets the MCS 020(a) Issue 2 noise requirements for Permitted Development Rights in England (mandatory from 20 September 2025). This assessment should be retained as part of the MCS technical file.
                  </div>
                )}
              </div>
            )}

            {/* Save and continue */}
            <button onClick={() => save(`/jobs/${jobId}`)} disabled={saving}
              className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-sm font-semibold py-3 rounded-xl transition-colors">
              {saving ? 'Saving...' : `Save assessment & return to job →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}