'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { HEAT_PUMPS, getHpOutput, getHpCoP, suggestHeatPumps, getHpBrands, type HeatPump } from '@/lib/products'

const BRAND_LOGOS: Record<string, string> = {
  'Vaillant': '🟩',
  'Samsung': '⬛',
  'Ideal': '🟦',
  'Warmflow': '🟧',
}

function StarRating({ spf }: { spf: number }) {
  const stars = spf >= 4.0 ? 6 : spf >= 3.5 ? 5 : spf >= 3.0 ? 4 : spf >= 2.7 ? 3 : spf >= 2.4 ? 2 : 1
  return (
    <span className="text-amber-400">
      {'★'.repeat(stars)}<span className="text-gray-200">{'★'.repeat(6 - stars)}</span>
    </span>
  )
}

export default function HeatPumpSelectionPage() {
  const params = useParams()
  const jobId = params.id as string

  const [customer, setCustomer] = useState<any>(null)
  const [totalHeatLossW, setTotalHeatLossW] = useState(0)
  const [shlWm2, setShlWm2] = useState(0)
  const [flowTemp, setFlowTemp] = useState(50)
  const [returnTemp, setReturnTemp] = useState(40)
  const [emitterType, setEmitterType] = useState('radiators')
  const [numBedrooms, setNumBedrooms] = useState(3)
  const [designTempExt, setDesignTempExt] = useState(-4)

  const [selectedHpId, setSelectedHpId] = useState<string | null>(null)
  const [brandFilter, setBrandFilter] = useState<string>('all')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const brands = ['all', ...getHpBrands()]

  useEffect(() => { load() }, [jobId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }
    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)
    const { data: sd } = await (supabase as any).from('system_designs').select('*').eq('job_id', jobId).single()
    if (sd) {
      setTotalHeatLossW(sd.total_heat_loss_w || 0)
      setShlWm2(sd.specific_heat_loss_w_m2 || 0)
      const di = sd.design_inputs || {}
      if (di.settings) {
        setDesignTempExt(di.settings.designTempExt || -4)
        setNumBedrooms(di.settings.numBedrooms || 3)
      }
      if (di.systemSpec) {
        setFlowTemp(di.systemSpec.flowTemp || 50)
        setReturnTemp(di.systemSpec.returnTemp || 40)
        setEmitterType(di.systemSpec.emitterType || 'radiators')
      }
      if (di.hpSelection) setSelectedHpId(di.hpSelection.hpId)
    }
    setLoading(false)
  }

  const recKw = Math.ceil(totalHeatLossW / 1000)
  const selectedHp = HEAT_PUMPS.find(hp => hp.id === selectedHpId) || null

  // MCS 031 SPF lookup
  const MCS031: number[][] = [
    [20,4.5,4.2,3.9,3.6,3.3,3.0,2.7],
    [30,4.3,4.0,3.7,3.4,3.1,2.8,2.6],
    [40,4.1,3.8,3.5,3.2,2.9,2.7,2.5],
    [50,3.9,3.6,3.3,3.0,2.8,2.6,2.4],
    [60,3.7,3.4,3.1,2.9,2.7,2.5,2.3],
    [80,3.5,3.2,2.9,2.7,2.6,2.4,2.2],
    [100,3.3,3.0,2.8,2.6,2.5,2.3,2.1],
    [120,3.1,2.9,2.7,2.5,2.4,2.2,2.0],
    [999,2.9,2.7,2.5,2.4,2.3,2.1,1.9],
  ]
  function getSpf(shl: number, emitter: string, ft: number) {
    const row = MCS031.find(r => shl <= r[0]) || MCS031[MCS031.length-1]
    const col = emitter === 'ufh' ? (ft<=35?1:ft<=40?2:3) : emitter === 'radiators' ? (ft<=45?4:ft<=50?5:ft<=55?6:7) : 6
    return row[col]
  }

  const spf = getSpf(shlWm2, emitterType, flowTemp)
  const stars = spf >= 4.0 ? 6 : spf >= 3.5 ? 5 : spf >= 3.0 ? 4 : spf >= 2.7 ? 3 : spf >= 2.4 ? 2 : 1
  const annualHeat = Math.round((totalHeatLossW / ((21 - designTempExt) * 1000)) * 2200 * 24)

  // Filter and sort HPs
  const minKw = recKw
  const filtered = HEAT_PUMPS
    .filter(hp => brandFilter === 'all' || hp.brand === brandFilter)
    .sort((a, b) => {
      const aOut = getHpOutput(a, flowTemp)
      const bOut = getHpOutput(b, flowTemp)
      const aAdequate = aOut >= minKw
      const bAdequate = bOut >= minKw
      if (aAdequate && !bAdequate) return -1
      if (!aAdequate && bAdequate) return 1
      return aOut - bOut
    })
  const adequate = filtered.filter(hp => getHpOutput(hp, flowTemp) >= minKw)
  const displayed = showAll ? filtered : (adequate.length > 0 ? adequate : filtered).slice(0, 9)

  async function save(redirect?: string) {
    if (!selectedHpId) return
    setSaving(true); setSaveError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: sd } = await (supabase as any).from('system_designs').select('design_inputs').eq('job_id', jobId).single()
      const existing = sd?.design_inputs || {}
      const hp = HEAT_PUMPS.find(h => h.id === selectedHpId)!
      const payload = {
        design_inputs: {
          ...existing,
          hpSelection: {
            hpId: selectedHpId,
            flowTemp, returnTemp, emitterType,
          },
          systemSpec: {
            ...(existing.systemSpec || {}),
            flowTemp, returnTemp, emitterType,
            hpManufacturer: hp.brand,
            hpModel: `${hp.range} ${hp.model}`,
            hpOutputKw: getHpOutput(hp, flowTemp),
            hpSoundPowerDb: hp.soundPowerDb,
          },
        },
        flow_temp_c: flowTemp,
        return_temp_c: returnTemp,
        emitter_type: emitterType,
        hp_manufacturer: hp.brand,
        hp_model: `${hp.range} ${hp.model}`,
        hp_size_kw: getHpOutput(hp, flowTemp),
        hp_cop_a7w35: hp.copW35,
        scop_estimate: spf,
        updated_at: new Date().toISOString(),
      }
      const { error } = await (supabase as any).from('system_designs').update(payload).eq('job_id', jobId)
      if (error) { setSaveError(error.message); setSaving(false); return }
      await (supabase as any).from('audit_log').insert({
        job_id: jobId, user_id: session.user.id, action: 'hp_selected', stage: 'design',
        entity_type: 'system_design',
        description: `HP selected: ${hp.brand} ${hp.range} ${hp.model} — ${getHpOutput(hp, flowTemp).toFixed(1)}kW at ${flowTemp}°C`,
      })
      setSaving(false); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      if (redirect) window.location.href = redirect
    } catch (e: any) { setSaveError(e.message); setSaving(false) }
  }

  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const sel = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"

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
            <div className="text-xs font-semibold text-gray-900">Heat Pump Selection</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.address_line1}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/jobs/${jobId}/design/system`} className="text-xs text-gray-400 hover:text-gray-600">← Radiators</a>
          {saveError && <span className="text-xs text-red-600">{saveError}</span>}
          <button onClick={() => save()} disabled={saving || !selectedHpId}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Progress steps */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="max-w-6xl mx-auto flex items-center gap-1 text-xs">
          {[
            { label: 'Floor plan', href: `/jobs/${jobId}/design` },
            { label: 'Radiators', href: `/jobs/${jobId}/design/system` },
            { label: 'Heat pump', href: '#', active: true },
            { label: 'Hot water', href: `/jobs/${jobId}/design/cylinder` },
          ].map((step, i) => (
            <span key={step.label} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300">›</span>}
              <a href={step.href} className={`${step.active ? 'text-emerald-700 font-semibold' : 'text-gray-400 hover:text-gray-600'}`}>{step.label}</a>
            </span>
          ))}
        </div>
      </div>

      {/* MCS strip */}
      <div className="bg-emerald-700 text-white px-4 py-1 flex items-center gap-4 text-xs">
        <span className="font-medium">MCS 031</span>
        <span>SPF {spf} · {'★'.repeat(stars)}{'☆'.repeat(6-stars)} {stars}/6</span>
        <span className="ml-auto">Design: {recKw}kW min · {totalHeatLossW}W total · {designTempExt}°C ext</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

          {/* ── Filters + settings ──────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Flow temperature */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">System design</div>
              <div className="space-y-3">
                <div>
                  <label className={lbl}>Emitter type</label>
                  <select className={sel} value={emitterType} onChange={e => setEmitterType(e.target.value)}>
                    <option value="radiators">Radiators</option>
                    <option value="ufh">Underfloor heating</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-gray-500">Flow temperature</label>
                    <span className="text-xs font-bold text-emerald-700">{flowTemp}°C</span>
                  </div>
                  <input type="range" min={35} max={65} step={1} value={flowTemp}
                    className="w-full accent-emerald-700"
                    onChange={e => setFlowTemp(parseInt(e.target.value))}/>
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>35°C (UFH)</span><span>65°C</span>
                  </div>
                  <div className="mt-2 bg-gray-50 rounded-lg p-2 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">Return temp</span>
                      <input type="number" className="w-14 text-right border-0 bg-transparent font-semibold text-gray-900 text-xs" value={returnTemp} step={1}
                        onChange={e => setReturnTemp(parseInt(e.target.value)||40)}/><span className="text-gray-400">°C</span>
                    </div>
                    <div className="flex justify-between mt-1"><span className="text-gray-400">MCS 031 SPF</span><span className="font-semibold">{spf}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Star rating</span><span>{'★'.repeat(stars)}{'☆'.repeat(6-stars)}</span></div>
                  </div>
                </div>

                {/* Heat loss summary */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-emerald-700 font-medium">Minimum HP size</span><span className="font-bold text-emerald-700">{recKw} kW</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Total heat loss</span><span>{(totalHeatLossW/1000).toFixed(2)} kW</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Annual heat demand</span><span>~{annualHeat.toLocaleString()} kWh</span></div>
                </div>
              </div>
            </div>

            {/* Brand filter */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-700 mb-2">Filter by brand</div>
              <div className="space-y-1">
                {brands.map(b => (
                  <button key={b} onClick={() => setBrandFilter(b)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors capitalize flex items-center gap-2 ${brandFilter === b ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {b !== 'all' && <span>{BRAND_LOGOS[b]}</span>}
                    {b === 'all' ? 'All brands' : b}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected HP summary */}
            {selectedHp && (
              <div className="bg-white border-2 border-emerald-500 rounded-xl p-4">
                <div className="text-xs font-semibold text-emerald-700 mb-2">Selected heat pump</div>
                <div className="text-sm font-bold text-gray-900">{selectedHp.brand}</div>
                <div className="text-xs text-gray-600">{selectedHp.range}</div>
                <div className="text-xs text-gray-600 mb-2">{selectedHp.model}</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-400">Output at {flowTemp}°C</span><span className="font-semibold">{getHpOutput(selectedHp, flowTemp).toFixed(1)} kW</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">CoP at {flowTemp}°C</span><span className="font-semibold">{getHpCoP(selectedHp, flowTemp).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Sound power</span><span>{selectedHp.soundPowerDb} dB(A)</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Refrigerant</span><span>{selectedHp.refrigerant}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Warranty</span><span>{selectedHp.warrantyYears}yr</span></div>
                </div>
                <button onClick={() => save(`/jobs/${jobId}/design/cylinder`)}
                  disabled={saving}
                  className="mt-3 w-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold py-2.5 rounded-lg">
                  {saving ? 'Saving...' : 'Save & continue to cylinder →'}
                </button>
              </div>
            )}
          </div>

          {/* ── Product cards ───────────────────────────────────────────────── */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {adequate.length > 0 ? `${adequate.length} units meet your ${recKw}kW requirement` : `No units in range — showing closest matches`}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Output shown at {flowTemp}°C flow temperature. All units MCS listed, BUS eligible.</p>
              </div>
              <button onClick={() => setShowAll(!showAll)} className="text-xs text-emerald-700 hover:underline">
                {showAll ? 'Show recommended only' : `Show all ${filtered.length}`}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {displayed.map(hp => {
                const outputAtFlow = getHpOutput(hp, flowTemp)
                const copAtFlow = getHpCoP(hp, flowTemp)
                const adequate = outputAtFlow >= minKw
                const isSelected = hp.id === selectedHpId
                const headroom = adequate ? Math.round((outputAtFlow / minKw - 1) * 100) : null

                return (
                  <button key={hp.id} onClick={() => setSelectedHpId(hp.id === selectedHpId ? null : hp.id)}
                    className={`text-left rounded-xl border-2 p-4 transition-all hover:shadow-md ${isSelected ? 'border-emerald-500 bg-emerald-50' : adequate ? 'border-gray-200 bg-white hover:border-emerald-300' : 'border-gray-200 bg-white opacity-60 hover:border-gray-300'}`}>

                    {/* Brand + badge */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span>{BRAND_LOGOS[hp.brand]}</span>
                          <span className="text-xs font-bold text-gray-900">{hp.brand}</span>
                        </div>
                        <div className="text-xs text-gray-500">{hp.range}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {adequate && headroom !== null && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                            +{headroom}% headroom
                          </span>
                        )}
                        {!adequate && (
                          <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                            Undersized
                          </span>
                        )}
                        {isSelected && <span className="text-xs bg-emerald-700 text-white px-2 py-0.5 rounded-full">✓ Selected</span>}
                      </div>
                    </div>

                    {/* Model */}
                    <div className="text-sm font-semibold text-gray-800 mb-3">{hp.model}</div>

                    {/* Key metrics */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <div className="text-xs text-gray-400">Output @{flowTemp}°C</div>
                        <div className={`text-base font-bold ${adequate ? 'text-emerald-700' : 'text-red-600'}`}>{outputAtFlow.toFixed(1)}kW</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <div className="text-xs text-gray-400">CoP @{flowTemp}°C</div>
                        <div className="text-base font-bold text-gray-900">{copAtFlow.toFixed(2)}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <div className="text-xs text-gray-400">Sound power</div>
                        <div className="text-sm font-bold text-gray-900">{hp.soundPowerDb}dB</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <div className="text-xs text-gray-400">Refrigerant</div>
                        <div className="text-sm font-bold text-gray-900">{hp.refrigerant}</div>
                      </div>
                    </div>

                    {/* CoP curve — simple bar chart */}
                    <div className="mb-3">
                      <div className="text-xs text-gray-400 mb-1">Performance curve (A7)</div>
                      <div className="flex items-end gap-1 h-8">
                        {[35, 45, 55].map(ft => {
                          const cop = getHpCoP(hp, ft)
                          const h = Math.max(20, (cop / 6) * 100)
                          return (
                            <div key={ft} className="flex-1 flex flex-col items-center gap-0.5">
                              <div className="text-xs text-gray-500 font-mono" style={{ fontSize: '9px' }}>{cop.toFixed(1)}</div>
                              <div className={`w-full rounded-t ${ft === flowTemp ? 'bg-emerald-500' : 'bg-gray-200'}`} style={{ height: `${h}%` }}/>
                              <div className="text-xs text-gray-400" style={{ fontSize: '9px' }}>W{ft}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-0.5 text-xs text-gray-500">
                      <div className="flex justify-between"><span>SCOP @35°C</span><span className="font-medium">{hp.scopW35}</span></div>
                      <div className="flex justify-between"><span>SCOP @55°C</span><span className="font-medium">{hp.scopW55}</span></div>
                      <div className="flex justify-between"><span>Min outdoor</span><span>{hp.minOutdoorC}°C</span></div>
                      <div className="flex justify-between"><span>Max flow</span><span>{hp.maxFlowC}°C</span></div>
                      <div className="flex justify-between"><span>Dimensions</span><span>{hp.widthMm}×{hp.heightMm}×{hp.depthMm}mm</span></div>
                      <div className="flex justify-between"><span>Warranty</span><span>{hp.warrantyYears}yr</span></div>
                      {hp.productCode && <div className="flex justify-between"><span>Product code</span><span className="font-mono">{hp.productCode}</span></div>}
                    </div>

                    {/* Notes */}
                    {hp.notes && (
                      <div className="mt-2 text-xs text-gray-400 italic leading-relaxed">{hp.notes}</div>
                    )}
                    {hp.compatibleCylinders && (
                      <div className="mt-1.5 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                        Pairs with Vaillant uniSTOR cylinder
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {!showAll && filtered.length > displayed.length && (
              <div className="mt-4 text-center">
                <button onClick={() => setShowAll(true)} className="text-xs text-emerald-700 hover:underline">
                  Show all {filtered.length} heat pumps →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}