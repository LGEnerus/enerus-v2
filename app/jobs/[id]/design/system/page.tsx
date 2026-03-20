'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ULTRAHEAT_RADIATORS, radOutput, type Radiator } from '@/lib/radiators'

// ─── Types ────────────────────────────────────────────────────────────────────

type RoomSpec = {
  id: string
  name: string
  roomType: string
  floor: number
  areaMm2: number
  lengthMm: number
  widthMm: number
  heightMm: number
  totalLossW: number
  fabricLossW: number
  ventLossW: number
  // Editable parameters
  designTempC: number
  achOverride: number | null
  hasOpenFlue: boolean
  floorPreset: string
  ceilingPreset: string
  // Radiator selection
  selectedRadiators: { radiatorId: string; quantity: number }[]
}

type SystemSpec = {
  hpModel: string
  hpOutputKw: number
  hpSoundPowerDb: number
  emitterType: string
  flowTemp: number
  returnTemp: number
  cylinderSizeLitres: number
  cylinderType: string
  noiseDistanceM: number
  noiseReflectiveSurfaces: number
  noiseHasBarrier: boolean
  noiseBarrierAttenuation: number
  noiseAssessmentLocation: string
  location: string
  designTempExt: number
  totalFloorAreaM2: number
  numBedrooms: number
}

const ROOM_DESIGN_TEMPS: Record<string, number> = {
  'Living room': 21, 'Dining room': 21, 'Kitchen': 18, 'Bedroom': 18,
  'Bathroom': 22, 'En-suite': 22, 'Hall / Landing': 18, 'Study': 21,
  'Utility room': 16, 'WC': 18, 'Conservatory': 21, 'Garage': 10, 'Other': 18,
}

const ROOM_ACH: Record<string, number> = {
  'Living room': 1.5, 'Dining room': 1.5, 'Kitchen': 2.0, 'Bedroom': 1.0,
  'Bathroom': 2.0, 'En-suite': 2.0, 'Hall / Landing': 1.5, 'Study': 1.5,
  'Utility room': 2.0, 'WC': 2.0, 'Conservatory': 1.5, 'Garage': 0.5, 'Other': 1.5,
}

// Open flued appliances increase ACH significantly
const OPEN_FLUE_ACH_ADDITION = 1.5

const MCS031_SPF: number[][] = [
  [20,4.5,4.2,3.9,3.6,3.3,3.0,2.7,3.8,3.5,3.2],
  [30,4.3,4.0,3.7,3.4,3.1,2.8,2.6,3.6,3.3,3.0],
  [40,4.1,3.8,3.5,3.2,2.9,2.7,2.5,3.4,3.1,2.8],
  [50,3.9,3.6,3.3,3.0,2.8,2.6,2.4,3.2,2.9,2.7],
  [60,3.7,3.4,3.1,2.9,2.7,2.5,2.3,3.0,2.8,2.6],
  [80,3.5,3.2,2.9,2.7,2.6,2.4,2.2,2.8,2.6,2.4],
  [100,3.3,3.0,2.8,2.6,2.5,2.3,2.1,2.7,2.5,2.3],
  [120,3.1,2.9,2.7,2.5,2.4,2.2,2.0,2.6,2.4,2.2],
  [999,2.9,2.7,2.5,2.4,2.3,2.1,1.9,2.5,2.3,2.1],
]

function getSPF(shl: number, emitter: string, flowTemp: number): { spf: number; stars: number } {
  const row = MCS031_SPF.find(r => shl <= r[0]) || MCS031_SPF[MCS031_SPF.length - 1]
  const col = emitter === 'ufh' ? (flowTemp <= 35 ? 1 : flowTemp <= 40 ? 2 : 3)
    : emitter === 'radiators' ? (flowTemp <= 45 ? 4 : flowTemp <= 50 ? 5 : flowTemp <= 55 ? 6 : 7)
    : (flowTemp <= 45 ? 8 : flowTemp <= 50 ? 9 : 10)
  const spf = row[col]
  return { spf, stars: spf >= 4.0 ? 6 : spf >= 3.5 ? 5 : spf >= 3.0 ? 4 : spf >= 2.7 ? 3 : spf >= 2.4 ? 2 : 1 }
}

// Flow rate in litres/min for a given radiator output
// Q(l/min) = Power(W) / (ΔT_water × 4186 / 60) / 1000
// ΔT_water = flow temp - return temp
function calcFlowRate(outputW: number, flowTemp: number, returnTemp: number): number {
  const dtWater = flowTemp - returnTemp
  if (dtWater <= 0) return 0
  return Math.round((outputW / (dtWater * 4186 / 60) / 1000) * 100) / 100
}

// Recalculate room heat loss with updated parameters
function recalcRoom(room: RoomSpec, designTempExt: number): number {
  const roomTemp = room.designTempC
  const dT = roomTemp - designTempExt
  const area = room.areaMm2 > 0 ? room.areaMm2 / 1_000_000 : (room.lengthMm * room.widthMm) / 1_000_000
  const baseAch = ROOM_ACH[room.roomType] || 1.5
  const ach = (room.achOverride !== null ? room.achOverride : baseAch) + (room.hasOpenFlue ? OPEN_FLUE_ACH_ADDITION : 0)
  const volume = area * (room.heightMm / 1000)
  const ventLoss = 0.33 * ach * volume * dT
  // Use stored fabric loss and recalculate vent
  return Math.round(room.fabricLossW + ventLoss)
}

// Suggest matching radiators
function suggestRads(lossW: number, deltaT: number): Radiator[] {
  return ULTRAHEAT_RADIATORS
    .filter(r => {
      const out = radOutput(r, deltaT)
      return out >= lossW * 0.85 && out <= lossW * 2.5
    })
    .sort((a, b) => Math.abs(radOutput(a, deltaT) - lossW) - Math.abs(radOutput(b, deltaT) - lossW))
    .slice(0, 8)
}

export default function SystemSpecPage() {
  const params = useParams()
  const jobId = params.id as string

  const [roomSpecs, setRoomSpecs] = useState<RoomSpec[]>([])
  const [system, setSystem] = useState<SystemSpec>({
    hpModel: '', hpOutputKw: 0, hpSoundPowerDb: 63,
    emitterType: 'radiators', flowTemp: 50, returnTemp: 40,
    cylinderSizeLitres: 200, cylinderType: 'indirect',
    noiseDistanceM: 3, noiseReflectiveSurfaces: 1, noiseHasBarrier: false,
    noiseBarrierAttenuation: 5, noiseAssessmentLocation: 'Nearest neighbour window/door',
    location: 'Birmingham', designTempExt: -4, totalFloorAreaM2: 85, numBedrooms: 3,
  })
  const [customer, setCustomer] = useState<any>(null)
  const [expandRoom, setExpandRoom] = useState<string | null>(null)
  const [radSuggest, setRadSuggest] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

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
      // Load system settings from existing design
      const di = sd.design_inputs || {}
      if (di.system) setSystem(prev => ({ ...prev, ...di.system }))

      // Build room specs from stored rooms
      const storedRooms: any[] = di.rooms || []
      const specs: RoomSpec[] = storedRooms.map(r => ({
        id: r.id,
        name: r.name || '',
        roomType: r.roomType || r.room_type || 'Living room',
        floor: r.floor || 0,
        areaMm2: r.areaMm2 || 0,
        lengthMm: r.lengthMm || 4000,
        widthMm: r.widthMm || 3500,
        heightMm: r.heightMm || 2400,
        totalLossW: r.totalLossW || 0,
        fabricLossW: r.fabricLossW || 0,
        ventLossW: r.ventLossW || 0,
        designTempC: ROOM_DESIGN_TEMPS[r.roomType || 'Living room'] || 21,
        achOverride: r.achOverride || null,
        hasOpenFlue: false,
        floorPreset: r.floorPreset || r.floor_preset || 'solid_unins',
        ceilingPreset: r.ceilingPreset || r.ceiling_preset || 'pitched_100mm',
        selectedRadiators: (di.selectedRadiators?.[r.id] || []).map((sr: any) => ({ radiatorId: sr.id, quantity: sr.qty })),
      }))
      setRoomSpecs(specs)
    }
    setLoading(false)
  }

  function updRoom(id: string, updates: Partial<RoomSpec>) {
    setRoomSpecs(prev => prev.map(r => {
      if (r.id !== id) return r
      const updated = { ...r, ...updates }
      const newLoss = recalcRoom(updated, system.designTempExt)
      return { ...updated, totalLossW: newLoss }
    }))
  }

  const deltaT = (system.flowTemp + system.returnTemp) / 2 - 21
  const totalW = roomSpecs.reduce((s, r) => s + r.totalLossW, 0)
  const shl = system.totalFloorAreaM2 > 0 ? Math.round(totalW / system.totalFloorAreaM2) : 0
  const recKw = Math.ceil(totalW / 1000)
  const { spf, stars } = getSPF(shl, system.emitterType, system.flowTemp)
  const annualHeat = Math.round((totalW / ((21 - system.designTempExt) * 1000)) * 2200 * 24)
  const annualElec = Math.round(annualHeat / spf)
  const annualDHW = Math.round(45 * system.numBedrooms * 365 * 4.18 * 0.001 / 1.7) * 100
  const noiseLevel = Math.round((system.hpSoundPowerDb - 20 * Math.log10(system.noiseDistanceM) - 8 + 3 + system.noiseReflectiveSurfaces * 3 - (system.noiseHasBarrier ? system.noiseBarrierAttenuation : 0)) * 10) / 10
  const noiseOk = noiseLevel <= 37
  const minCylinder = system.numBedrooms <= 2 ? 150 : system.numBedrooms <= 3 ? 200 : system.numBedrooms <= 4 ? 250 : 300

  // Total radiator output vs total heat loss
  const totalRadOutput = roomSpecs.reduce((sum, room) => {
    return sum + room.selectedRadiators.reduce((rs, sr) => {
      const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.radiatorId)
      return rs + (rad ? radOutput(rad, deltaT) * sr.quantity : 0)
    }, 0)
  }, 0)

  async function save() {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: sd } = await (supabase as any).from('system_designs').select('design_inputs').eq('job_id', jobId).single()
    const existing = sd?.design_inputs || {}

    // Build selectedRadiators in the format the design page expects
    const selectedRadiators: Record<string, { id: string; qty: number }[]> = {}
    roomSpecs.forEach(r => {
      if (r.selectedRadiators.length > 0) {
        selectedRadiators[r.id] = r.selectedRadiators.map(sr => ({ id: sr.radiatorId, qty: sr.quantity }))
      }
    })

    const payload = {
      design_inputs: {
        ...existing,
        system,
        roomSpecs,
        selectedRadiators,
      },
      total_heat_loss_w: totalW,
      specific_heat_loss_w_m2: shl,
      recommended_hp_kw: recKw,
      flow_temp_c: system.flowTemp,
      emitter_type: system.emitterType,
      spf_estimate: spf,
      star_rating: stars,
      annual_heat_demand_kwh: annualHeat,
      annual_elec_space_kwh: annualElec,
      annual_elec_dhw_kwh: annualDHW,
      cylinder_size_litres: system.cylinderSizeLitres,
      noise_level_db: noiseLevel,
      noise_compliant: noiseOk,
      mcs_031_compliant: true,
      designed_by: session.user.id,
      designed_at: new Date().toISOString(),
    }

    const { data: ex } = await (supabase as any).from('system_designs').select('id').eq('job_id', jobId).single()
    if (ex) await (supabase as any).from('system_designs').update(payload).eq('job_id', jobId)
    else await (supabase as any).from('system_designs').insert({ job_id: jobId, ...payload })

    await (supabase as any).from('audit_log').insert({
      job_id: jobId,
      user_id: session.user.id,
      action: 'system_spec_saved',
      stage: 'design',
      entity_type: 'system_design',
      description: `System spec saved: ${system.hpModel || 'HP not selected'}, ${recKw}kW, SPF ${spf}, ${stars}★, noise ${noiseLevel}dB`,
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const sel = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">System & Radiator Specification</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/jobs/${jobId}/design`} className="text-xs text-gray-400 hover:text-gray-600">← Floor plan</a>
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">Job →</a>
          <button onClick={save} disabled={saving} className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save design'}
          </button>
        </div>
      </div>

      {/* MCS strip */}
      <div className="bg-emerald-700 text-white px-4 py-1 flex items-center gap-4 text-xs">
        <span className="font-medium">MCS</span>
        <span>MIS 3005-D</span><span>MCS 031 v4.0</span><span>BS EN 12831-1:2017</span><span>MCS 020(a)</span>
        <span className="ml-auto">{system.location} · {system.designTempExt}°C</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* Summary metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total heat loss', value: `${(totalW/1000).toFixed(2)} kW`, sub: `${shl} W/m²`, highlight: false },
            { label: 'Recommended ASHP', value: `${recKw} kW`, sub: 'minimum output', highlight: true },
            { label: 'MCS 031 SPF', value: String(spf), sub: `${'★'.repeat(stars)}${'☆'.repeat(6-stars)} ${stars}/6 stars`, highlight: false },
            { label: 'Annual electricity', value: `${(annualElec+annualDHW).toLocaleString()} kWh`, sub: 'space + DHW', highlight: false },
            { label: 'Noise level', value: `${noiseLevel} dB`, sub: noiseOk ? '✓ MCS 020(a) pass' : '✗ Exceeds 37dB limit', highlight: !noiseOk },
          ].map(m => (
            <div key={m.label} className={`rounded-xl p-4 border ${m.highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}>
              <div className="text-xs text-gray-400 mb-1">{m.label}</div>
              <div className={`text-xl font-bold ${m.highlight ? 'text-emerald-700' : 'text-gray-900'}`}>{m.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{m.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Room-by-room heat loss + radiator selection */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-gray-900">Room-by-room specification</h2>
                <p className="text-xs text-gray-400 mt-0.5">Adjust room parameters and select radiators. Changes update heat loss in real time.</p>
              </div>
              <div className={`text-xs font-medium px-3 py-1.5 rounded-full ${totalRadOutput >= totalW ? 'bg-emerald-50 text-emerald-700' : totalRadOutput > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
                {totalRadOutput > 0 ? `Radiators: ${(totalRadOutput/1000).toFixed(1)}kW / ${(totalW/1000).toFixed(1)}kW needed` : 'No radiators selected'}
              </div>
            </div>

            {roomSpecs.length === 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                <div className="text-sm text-gray-400 mb-2">No rooms found</div>
                <a href={`/jobs/${jobId}/design`} className="text-xs text-emerald-700 hover:underline">← Go back to floor plan to add rooms</a>
              </div>
            )}

            {roomSpecs.map(room => {
              const roomRadOutput = room.selectedRadiators.reduce((s, sr) => {
                const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.radiatorId)
                return s + (rad ? radOutput(rad, deltaT) * sr.quantity : 0)
              }, 0)
              const radOk = roomRadOutput >= room.totalLossW * 0.95
              const defaultAch = ROOM_ACH[room.roomType] || 1.5
              const effectiveAch = (room.achOverride !== null ? room.achOverride : defaultAch) + (room.hasOpenFlue ? OPEN_FLUE_ACH_ADDITION : 0)
              const areaM2 = room.areaMm2 > 0 ? room.areaMm2 / 1_000_000 : room.lengthMm * room.widthMm / 1_000_000

              return (
                <div key={room.id} className={`bg-white border rounded-xl overflow-hidden ${!radOk && room.selectedRadiators.length > 0 ? 'border-amber-300' : 'border-gray-200'}`}>
                  {/* Row header */}
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandRoom(expandRoom === room.id ? null : room.id)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{room.name || room.roomType}</div>
                        <div className="text-xs text-gray-400">
                          {room.roomType} · {areaM2.toFixed(1)}m² · {room.designTempC}°C · ACH {effectiveAch.toFixed(1)}
                          {room.hasOpenFlue && <span className="text-amber-600 ml-1">+flue</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-900">{room.totalLossW}W</div>
                        <div className={`text-xs ${radOk ? 'text-emerald-600' : room.selectedRadiators.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {room.selectedRadiators.length > 0 ? `${roomRadOutput}W covered${radOk ? ' ✓' : ' ✗'}` : 'No radiator selected'}
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs">{expandRoom === room.id ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {expandRoom === room.id && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50">
                      {/* Quick parameter editing */}
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Room parameters — changes update heat loss live</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div>
                            <label className={lbl}>Design temp (°C)</label>
                            <input type="number" className={inp} value={room.designTempC} step={0.5}
                              onChange={e => updRoom(room.id, { designTempC: parseFloat(e.target.value) || 21 })}/>
                            <div className="text-xs text-gray-400 mt-0.5">Default: {ROOM_DESIGN_TEMPS[room.roomType] || 21}°C</div>
                          </div>
                          <div>
                            <label className={lbl}>Air changes/hr</label>
                            <input type="number" className={inp} value={room.achOverride ?? ''} step={0.1} placeholder={`${defaultAch} (CIBSE)`}
                              onChange={e => { const v = parseFloat(e.target.value); updRoom(room.id, { achOverride: isNaN(v) ? null : v }) }}/>
                            <div className="text-xs text-gray-400 mt-0.5">Effective: {effectiveAch.toFixed(1)}</div>
                          </div>
                          <div>
                            <label className={lbl}>Floor type</label>
                            <select className={sel} value={room.floorPreset} onChange={e => updRoom(room.id, { floorPreset: e.target.value })}>
                              <option value="solid_unins">Solid — uninsulated</option>
                              <option value="solid_50pir">Solid — 50mm PIR</option>
                              <option value="solid_100pir">Solid — 100mm PIR</option>
                              <option value="suspended_unins">Suspended — uninsulated</option>
                              <option value="suspended_100mw">Suspended — 100mm mineral</option>
                              <option value="ufh">UFH screed</option>
                              <option value="heated">Heated space below</option>
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Ceiling type</label>
                            <select className={sel} value={room.ceilingPreset} onChange={e => updRoom(room.id, { ceilingPreset: e.target.value })}>
                              <option value="heated">Heated room above</option>
                              <option value="pitched_100mm">Pitched — 100mm ins</option>
                              <option value="pitched_150mm">Pitched — 150mm ins</option>
                              <option value="pitched_200mm">Pitched — 200mm ins</option>
                              <option value="pitched_no_ins">Pitched — no insulation</option>
                              <option value="flat_insulated">Flat — insulated</option>
                            </select>
                          </div>
                        </div>
                        {/* Open flue toggle */}
                        <label className="flex items-center gap-2 mt-2 cursor-pointer w-fit">
                          <input type="checkbox" checked={room.hasOpenFlue} onChange={e => updRoom(room.id, { hasOpenFlue: e.target.checked })}
                            className="rounded border-gray-300"/>
                          <span className="text-xs text-gray-700 font-medium">Open flued fire or stove present</span>
                          {room.hasOpenFlue && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">+{OPEN_FLUE_ACH_ADDITION} ACH added</span>}
                        </label>
                      </div>

                      {/* Heat loss breakdown */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-white border border-gray-200 rounded-lg p-2.5 text-center">
                          <div className="text-gray-400">Fabric</div>
                          <div className="font-semibold text-gray-900">{room.fabricLossW}W</div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-2.5 text-center">
                          <div className="text-gray-400">Ventilation</div>
                          <div className="font-semibold text-gray-900">{room.totalLossW - room.fabricLossW}W</div>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-center">
                          <div className="text-emerald-600">Total</div>
                          <div className="font-bold text-emerald-700">{room.totalLossW}W</div>
                        </div>
                      </div>

                      {/* Selected radiators */}
                      {room.selectedRadiators.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-2">Selected radiators</div>
                          <div className="space-y-1.5">
                            {room.selectedRadiators.map((sr, si) => {
                              const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.radiatorId)
                              if (!rad) return null
                              const out = radOutput(rad, deltaT)
                              const totalOut = out * sr.quantity
                              const flowRate = calcFlowRate(totalOut, system.flowTemp, system.returnTemp)
                              return (
                                <div key={si} className="flex items-center justify-between bg-white border border-emerald-200 rounded-lg px-3 py-2">
                                  <div className="text-xs">
                                    <div className="font-medium text-gray-900">{rad.type} — H{rad.height_mm}×{rad.length_mm}mm × {sr.quantity}</div>
                                    <div className="text-gray-500 mt-0.5">
                                      {out}W each · <span className="text-emerald-700 font-medium">{totalOut}W total</span>
                                      <span className="text-gray-400 ml-2">Flow rate: {flowRate} l/min</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 ml-3">
                                    <input type="number" min={1} value={sr.quantity}
                                      className="w-12 text-xs border border-gray-200 rounded px-2 py-1"
                                      onChange={e => {
                                        const rads = [...room.selectedRadiators]
                                        rads[si] = { ...sr, quantity: parseInt(e.target.value) || 1 }
                                        updRoom(room.id, { selectedRadiators: rads })
                                      }}/>
                                    <button onClick={() => updRoom(room.id, { selectedRadiators: room.selectedRadiators.filter((_, i) => i !== si) })}
                                      className="text-red-400 hover:text-red-600 text-xs">✕</button>
                                  </div>
                                </div>
                              )
                            })}
                            {/* Room total */}
                            <div className={`text-xs px-3 py-2 rounded-lg ${radOk ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              Total radiator output: <strong>{roomRadOutput}W</strong> · Room needs: <strong>{room.totalLossW}W</strong>
                              {radOk ? ' ✓ Adequate' : ` ✗ Short by ${room.totalLossW - roomRadOutput}W`}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Radiator suggestions */}
                      <div>
                        <button onClick={() => setRadSuggest(radSuggest === room.id ? null : room.id)}
                          className="text-xs text-emerald-700 hover:underline font-medium">
                          {radSuggest === room.id ? 'Hide suggestions' : `+ Add radiator for ${room.totalLossW}W at ${system.flowTemp}/${system.returnTemp}°C →`}
                        </button>
                        {radSuggest === room.id && (
                          <div className="mt-2 bg-white border border-gray-200 rounded-lg p-3">
                            <div className="text-xs text-gray-500 mb-2.5">
                              Ultraheat radiators sized for {room.totalLossW}W · ΔT{Math.round(deltaT)} (mean {(system.flowTemp+system.returnTemp)/2}°C, room {room.designTempC}°C)
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {suggestRads(room.totalLossW, deltaT).map(rad => {
                                const out = radOutput(rad, deltaT)
                                const pct = Math.round((out / room.totalLossW - 1) * 100)
                                const fr = calcFlowRate(out, system.flowTemp, system.returnTemp)
                                return (
                                  <button key={rad.id}
                                    onClick={() => {
                                      updRoom(room.id, { selectedRadiators: [...room.selectedRadiators, { radiatorId: rad.id, quantity: 1 }] })
                                      setRadSuggest(null)
                                    }}
                                    className="text-left p-2.5 border border-gray-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                                    <div className="text-xs font-semibold text-gray-900">{rad.type}</div>
                                    <div className="text-xs text-gray-500">H{rad.height_mm}×{rad.length_mm}mm</div>
                                    <div className="text-xs font-bold text-emerald-700 mt-1">{out}W</div>
                                    <div className="text-xs text-gray-400">+{pct}% · {fr}l/min</div>
                                    <div className="text-xs text-gray-400">{rad.depth_mm}mm deep</div>
                                  </button>
                                )
                              })}
                              {suggestRads(room.totalLossW, deltaT).length === 0 && (
                                <div className="col-span-4 text-xs text-gray-400 py-3 text-center">
                                  No single radiator matches — try adjusting flow temperature or selecting two smaller units.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Right: HP selection + MCS 031 + Noise */}
          <div className="space-y-4">

            {/* Heat pump */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-medium text-gray-900 mb-3">Heat pump</div>
              <div className="space-y-3">
                <div>
                  <label className={lbl}>Emitter type</label>
                  <select className={sel} value={system.emitterType} onChange={e => setSystem(prev => ({ ...prev, emitterType: e.target.value }))}>
                    <option value="radiators">Radiators</option>
                    <option value="ufh">Underfloor heating</option>
                    <option value="mixed">Mixed UFH + radiators</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Flow temp (°C)</label>
                    <input type="number" className={inp} value={system.flowTemp} step={1} onChange={e => setSystem(prev => ({ ...prev, flowTemp: parseInt(e.target.value)||50 }))}/>
                  </div>
                  <div>
                    <label className={lbl}>Return temp (°C)</label>
                    <input type="number" className={inp} value={system.returnTemp} step={1} onChange={e => setSystem(prev => ({ ...prev, returnTemp: parseInt(e.target.value)||40 }))}/>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 text-xs grid grid-cols-2 gap-2">
                  <div><span className="text-gray-400">Mean water temp</span><div className="font-semibold">{(system.flowTemp+system.returnTemp)/2}°C</div></div>
                  <div><span className="text-gray-400">Delta T (room 21°C)</span><div className="font-semibold">{Math.round(deltaT)}°C</div></div>
                  <div><span className="text-gray-400">SPF</span><div className="font-semibold">{spf}</div></div>
                  <div><span className="text-gray-400">Stars</span><div>{'★'.repeat(stars)}{'☆'.repeat(6-stars)}</div></div>
                </div>
                <div>
                  <label className={lbl}>HP model (MCS product directory)</label>
                  <input type="text" className={inp} value={system.hpModel} placeholder="e.g. Mitsubishi Ecodan 8.5kW" onChange={e => setSystem(prev => ({ ...prev, hpModel: e.target.value }))}/>
                </div>
                <div>
                  <label className={lbl}>Rated output at A7/W{system.flowTemp} (kW)</label>
                  <input type="number" className={inp} value={system.hpOutputKw} step={0.5} onChange={e => setSystem(prev => ({ ...prev, hpOutputKw: parseFloat(e.target.value)||0 }))}/>
                </div>
                {system.hpOutputKw > 0 && (
                  <div className={`text-xs p-2.5 rounded-lg ${system.hpOutputKw >= recKw ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {system.hpOutputKw >= recKw
                      ? `✓ Adequate — ${system.hpOutputKw}kW rated, ${recKw}kW required (+${Math.round((system.hpOutputKw/recKw-1)*100)}%)`
                      : `✗ Undersized — ${system.hpOutputKw}kW rated, ${recKw}kW required`}
                  </div>
                )}
              </div>
            </div>

            {/* Cylinder */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-medium text-gray-900 mb-3">Hot water cylinder</div>
              <div className="space-y-2">
                <div>
                  <label className={lbl}>Cylinder type</label>
                  <select className={sel} value={system.cylinderType} onChange={e => setSystem(prev => ({ ...prev, cylinderType: e.target.value }))}>
                    <option value="indirect">Indirect (heat pump coil)</option>
                    <option value="direct">Direct / immersion</option>
                    <option value="thermal_store">Thermal store</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Cylinder size (litres)</label>
                  <input type="number" className={inp} value={system.cylinderSizeLitres} step={25} onChange={e => setSystem(prev => ({ ...prev, cylinderSizeLitres: parseInt(e.target.value)||200 }))}/>
                </div>
                <div className={`text-xs p-2 rounded-lg ${system.cylinderSizeLitres >= minCylinder ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  MIS 3005-D minimum: {minCylinder}L for {system.numBedrooms} bedrooms
                  {system.cylinderSizeLitres < minCylinder ? ' ⚠ Below minimum' : ' ✓'}
                </div>
              </div>
            </div>

            {/* MCS 031 */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-medium text-gray-900 mb-3">MCS 031 Performance estimate</div>
              <div className="space-y-1.5 text-xs">
                {[
                  ['Specific heat loss', `${shl} W/m²`],
                  ['SPF (Table 2 lookup)', String(spf)],
                  ['Star rating', `${'★'.repeat(stars)}${'☆'.repeat(6-stars)} ${stars}/6`],
                  ['Annual heat demand', `${annualHeat.toLocaleString()} kWh`],
                  ['Annual elec — space', `${annualElec.toLocaleString()} kWh`],
                  ['Annual elec — DHW', `${annualDHW.toLocaleString()} kWh`],
                  ['Total annual elec', `${(annualElec+annualDHW).toLocaleString()} kWh`],
                ].map(([k,v]) => (
                  <div key={k} className="flex justify-between py-1 border-b border-gray-50 last:border-0 font-medium last:text-emerald-700">
                    <span className="text-gray-400 font-normal">{k}</span><span>{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 bg-emerald-50 rounded-lg p-2.5 text-xs text-emerald-800">
                MCS 031 mandatory disclosure: estimated {(annualElec+annualDHW).toLocaleString()} kWh/yr
                (range {Math.round((annualElec+annualDHW)*0.9).toLocaleString()}–{Math.round((annualElec+annualDHW)*1.1).toLocaleString()} kWh/yr)
              </div>
            </div>

            {/* Noise MCS 020(a) */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-medium text-gray-900 mb-3">MCS 020(a) Noise check</div>
              <div className="space-y-2">
                <div>
                  <label className={lbl}>HP sound power dB(A)</label>
                  <input type="number" className={inp} value={system.hpSoundPowerDb} step={0.5} onChange={e => setSystem(prev => ({ ...prev, hpSoundPowerDb: parseFloat(e.target.value)||63 }))}/>
                </div>
                <div>
                  <label className={lbl}>Distance to assessment point (m)</label>
                  <input type="number" className={inp} value={system.noiseDistanceM} step={0.5} min={1} onChange={e => setSystem(prev => ({ ...prev, noiseDistanceM: parseFloat(e.target.value)||1 }))}/>
                </div>
                <div>
                  <label className={lbl}>Reflective surfaces</label>
                  <select className={sel} value={system.noiseReflectiveSurfaces} onChange={e => setSystem(prev => ({ ...prev, noiseReflectiveSurfaces: parseInt(e.target.value) }))}>
                    <option value={0}>0 — Free field</option><option value={1}>1</option><option value={2}>2 — Corner</option><option value={3}>3</option>
                  </select>
                </div>
                <div className={`p-3 rounded-xl text-center border-2 ${noiseOk ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
                  <div className={`text-2xl font-bold ${noiseOk ? 'text-emerald-700' : 'text-red-700'}`}>{noiseLevel} dB</div>
                  <div className={`text-xs font-semibold ${noiseOk ? 'text-emerald-600' : 'text-red-600'}`}>{noiseOk ? '✓ MCS 020(a) Compliant' : '✗ Exceeds 37dB limit'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}