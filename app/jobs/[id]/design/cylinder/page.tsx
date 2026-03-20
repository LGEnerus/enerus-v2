'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CYLINDERS, HEAT_PUMPS, getHpOutput, calcReheatTime, minCylinderSize, getCompatibleCylinders, type Cylinder, type HeatPump } from '@/lib/products'

export default function CylinderSelectionPage() {
  const params = useParams()
  const jobId = params.id as string

  const [customer, setCustomer] = useState<any>(null)
  const [numBedrooms, setNumBedrooms] = useState(3)
  const [numOccupants, setNumOccupants] = useState(4)
  const [flowTemp, setFlowTemp] = useState(50)
  const [inletTempC, setInletTempC] = useState(10)
  const [targetTempC, setTargetTempC] = useState(55)
  const [selectedHp, setSelectedHp] = useState<HeatPump | null>(null)
  const [selectedCylinderId, setSelectedCylinderId] = useState<string | null>(null)
  const [brandFilter, setBrandFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

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
      const di = sd.design_inputs || {}
      if (di.settings) {
        setNumBedrooms(di.settings.numBedrooms || 3)
        setNumOccupants(di.settings.numBedrooms ? di.settings.numBedrooms + 1 : 4)
      }
      if (di.hpSelection) {
        setFlowTemp(di.hpSelection.flowTemp || 50)
        const hp = HEAT_PUMPS.find(h => h.id === di.hpSelection.hpId)
        if (hp) setSelectedHp(hp)
      }
      if (di.cylinderSelection) setSelectedCylinderId(di.cylinderSelection.cylinderId)
    }
    setLoading(false)
  }

  const minL = minCylinderSize(numBedrooms)
  const selectedCyl = CYLINDERS.find(c => c.id === selectedCylinderId) || null
  const compatibleCylinders = getCompatibleCylinders(selectedHp)

  // DHW demand calculation (MIS 3005-D method)
  // 45L per person per day at 60°C, mixed to 40°C = ~68L usable at 40°C
  const dailyDemandL = numOccupants * 45
  // Energy to heat per day
  const dhwEnergyKwh = (dailyDemandL * 4.186 * (targetTempC - inletTempC)) / 3600

  const filtered = compatibleCylinders.filter(c => brandFilter === 'all' || c.brand === brandFilter)
  const brands = ['all', ...Array.from(new Set(compatibleCylinders.map(c => c.brand)))]

  const reheatTime = selectedCyl && selectedHp
    ? calcReheatTime(selectedCyl, selectedHp, flowTemp, inletTempC, targetTempC)
    : null

  async function save(redirect?: string) {
    if (!selectedCylinderId) return
    setSaving(true); setSaveError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: sd } = await (supabase as any).from('system_designs').select('design_inputs').eq('job_id', jobId).single()
      const existing = sd?.design_inputs || {}
      const cyl = CYLINDERS.find(c => c.id === selectedCylinderId)!
      const payload = {
        design_inputs: {
          ...existing,
          cylinderSelection: {
            cylinderId: selectedCylinderId,
            inletTempC, targetTempC,
            numOccupants, dailyDemandL, dhwEnergyKwh,
          },
          systemSpec: {
            ...(existing.systemSpec || {}),
            cylinderSizeLitres: cyl.capacityL,
            cylinderManufacturer: cyl.brand,
            cylinderModel: `${cyl.range} ${cyl.model}`,
            cylinderType: cyl.type,
          },
        },
        cylinder_size_l: cyl.capacityL,
        cylinder_manufacturer: cyl.brand,
        cylinder_model: `${cyl.range} ${cyl.model}`,
        updated_at: new Date().toISOString(),
      }
      const { error } = await (supabase as any).from('system_designs').update(payload).eq('job_id', jobId)
      if (error) { setSaveError(error.message); setSaving(false); return }
      await (supabase as any).from('audit_log').insert({
        job_id: jobId, user_id: session.user.id, action: 'cylinder_selected', stage: 'design',
        entity_type: 'system_design',
        description: `Cylinder selected: ${cyl.brand} ${cyl.range} ${cyl.model} ${cyl.capacityL}L`,
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
            <div className="text-xs font-semibold text-gray-900">Hot Water Cylinder</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/jobs/${jobId}/design/heatpump`} className="text-xs text-gray-400 hover:text-gray-600">← Heat pump</a>
          {saveError && <span className="text-xs text-red-600">{saveError}</span>}
          <button onClick={() => save()} disabled={saving || !selectedCylinderId}
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
            { label: 'Heat pump', href: `/jobs/${jobId}/design/heatpump` },
            { label: 'Hot water', href: '#', active: true },
          ].map((step, i) => (
            <span key={step.label} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300">›</span>}
              <a href={step.href} className={`${step.active ? 'text-emerald-700 font-semibold' : 'text-gray-400 hover:text-gray-600'}`}>{step.label}</a>
            </span>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

          {/* ── Left panel ───────────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* DHW demand */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Hot water demand</div>
              <div className="space-y-3">
                <div>
                  <label className={lbl}>Bedrooms</label>
                  <input type="number" className={inp} value={numBedrooms} min={1} max={8}
                    onChange={e => setNumBedrooms(parseInt(e.target.value)||3)}/>
                </div>
                <div>
                  <label className={lbl}>Occupants</label>
                  <input type="number" className={inp} value={numOccupants} min={1} max={12}
                    onChange={e => setNumOccupants(parseInt(e.target.value)||4)}/>
                </div>
                <div>
                  <label className={lbl}>Incoming cold water temp (°C)</label>
                  <input type="number" className={inp} value={inletTempC} step={1}
                    onChange={e => setInletTempC(parseInt(e.target.value)||10)}/>
                </div>
                <div>
                  <label className={lbl}>Target stored temp (°C)</label>
                  <input type="number" className={inp} value={targetTempC} step={1}
                    onChange={e => setTargetTempC(parseInt(e.target.value)||55)}/>
                  <div className="text-xs text-gray-400 mt-0.5">Min 60°C for Legionella compliance</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-blue-700 font-medium">Daily DHW demand</span><span className="font-bold">{dailyDemandL}L</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">DHW energy/day</span><span>{dhwEnergyKwh.toFixed(2)} kWh</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">MIS 3005-D min size</span><span className="font-semibold text-emerald-700">{minL}L</span></div>
                </div>
              </div>
            </div>

            {/* HP context */}
            {selectedHp && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-gray-700 mb-2">Selected heat pump</div>
                <div className="text-xs text-gray-900 font-medium">{selectedHp.brand} {selectedHp.range}</div>
                <div className="text-xs text-gray-600">{selectedHp.model}</div>
                <div className="text-xs text-gray-400 mt-1">
                  DHW output: ~{getHpOutput(selectedHp, 55).toFixed(1)}kW at 55°C
                </div>
                {selectedHp.compatibleCylinders?.includes('vaillant') && (
                  <div className="mt-2 text-xs bg-amber-50 text-amber-700 px-2 py-1.5 rounded-lg">
                    ⚠ Vaillant HP — uniSTOR pure cylinders are optimised for this HP
                  </div>
                )}
              </div>
            )}

            {/* Brand filter */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-700 mb-2">Filter by brand</div>
              {brands.map(b => (
                <button key={b} onClick={() => setBrandFilter(b)}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg mb-0.5 transition-colors capitalize ${brandFilter === b ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {b === 'all' ? 'All brands' : b}
                </button>
              ))}
            </div>

            {/* Selected cylinder summary */}
            {selectedCyl && (
              <div className="bg-white border-2 border-emerald-500 rounded-xl p-4">
                <div className="text-xs font-semibold text-emerald-700 mb-2">Selected cylinder</div>
                <div className="text-sm font-bold text-gray-900">{selectedCyl.brand}</div>
                <div className="text-xs text-gray-600">{selectedCyl.range}</div>
                <div className="text-xs text-gray-600 mb-2">{selectedCyl.model}</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-400">Capacity</span><span className="font-bold text-emerald-700">{selectedCyl.capacityL}L</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">HP coil area</span><span>{selectedCyl.coilAreaM2}m²</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Standing loss</span><span>{selectedCyl.standingLossKwhDay} kWh/day</span></div>
                  {reheatTime && <div className="flex justify-between"><span className="text-gray-400">Reheat time</span><span className="font-semibold text-blue-700">{reheatTime} min</span></div>}
                  <div className="flex justify-between"><span className="text-gray-400">Guarantee</span><span>{selectedCyl.guaranteeYears >= 99 ? 'Lifetime' : `${selectedCyl.guaranteeYears}yr`}</span></div>
                  {selectedCyl.vaillantOnly && <div className="text-xs text-amber-600 mt-1">Vaillant heat pumps only</div>}
                </div>
                {selectedCyl.capacityL < minL && (
                  <div className="mt-2 bg-red-50 text-red-700 text-xs px-2 py-1.5 rounded">
                    ⚠ Below MIS 3005-D minimum ({minL}L for {numBedrooms} beds)
                  </div>
                )}
                <button onClick={() => save(`/jobs/${jobId}`)} disabled={saving}
                  className="mt-3 w-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold py-2.5 rounded-lg">
                  {saving ? 'Saving...' : 'Save & complete design →'}
                </button>
              </div>
            )}
          </div>

          {/* ── Cylinder cards ─────────────────────────────────────────────── */}
          <div className="lg:col-span-3">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Select a hot water cylinder</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                MIS 3005-D minimum: {minL}L for {numBedrooms} bedrooms · {numOccupants} occupants · {dailyDemandL}L/day demand
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(cyl => {
                const isSelected = cyl.id === selectedCylinderId
                const meetsMin = cyl.capacityL >= minL
                const reheat = selectedHp ? calcReheatTime(cyl, selectedHp, 55, inletTempC, targetTempC) : null

                return (
                  <button key={cyl.id} onClick={() => setSelectedCylinderId(cyl.id === selectedCylinderId ? null : cyl.id)}
                    className={`text-left rounded-xl border-2 p-4 transition-all hover:shadow-md ${isSelected ? 'border-emerald-500 bg-emerald-50' : meetsMin ? 'border-gray-200 bg-white hover:border-emerald-300' : 'border-gray-200 bg-white opacity-70 hover:border-gray-300'}`}>

                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-xs font-bold text-gray-900">{cyl.brand}</div>
                        <div className="text-xs text-gray-500">{cyl.range}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {meetsMin
                          ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ Meets MIS 3005-D</span>
                          : <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Below minimum</span>
                        }
                        {isSelected && <span className="text-xs bg-emerald-700 text-white px-2 py-0.5 rounded-full">✓ Selected</span>}
                        {cyl.vaillantOnly && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">Vaillant only</span>}
                      </div>
                    </div>

                    <div className="text-sm font-semibold text-gray-800 mb-3">{cyl.model}</div>

                    {/* Main stat */}
                    <div className="bg-gray-50 rounded-lg p-3 text-center mb-3">
                      <div className="text-2xl font-bold text-emerald-700">{cyl.capacityL}L</div>
                      <div className="text-xs text-gray-400">{cyl.coilAreaM2}m² HP coil</div>
                    </div>

                    {/* Key metrics */}
                    <div className="space-y-1 text-xs">
                      {reheat && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Reheat time (full)</span>
                          <span className="font-bold text-blue-700">{reheat} min</span>
                        </div>
                      )}
                      <div className="flex justify-between"><span className="text-gray-400">Reheat from 70% drawoff</span><span>{cyl.reheatMinFrom70} min</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Standing loss</span><span>{cyl.standingLossKwhDay} kWh/24h</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">ErP band</span><span className="font-medium">{cyl.erpBand}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Max pressure</span><span>{cyl.maxPressureBar} bar</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Immersion backup</span><span>{cyl.immersionKw}kW</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Dimensions (H×D)</span><span>{cyl.heightMm}×{cyl.diameterMm}mm</span></div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Guarantee</span>
                        <span className="font-medium">{cyl.guaranteeYears >= 99 ? 'Lifetime' : `${cyl.guaranteeYears}yr`}</span>
                      </div>
                      <div className="flex justify-between"><span className="text-gray-400">Product code</span><span className="font-mono text-xs">{cyl.productCode}</span></div>
                    </div>

                    {cyl.notes && (
                      <div className="mt-2 text-xs text-gray-400 italic leading-relaxed">{cyl.notes}</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}