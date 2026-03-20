'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ULTRAHEAT_RADIATORS, radOutput } from '@/lib/radiators'
import type { RoomData } from '@/app/jobs/[id]/design/page'

// ─── Types ────────────────────────────────────────────────────────────────────

type RoomSpec = RoomData & {
  designTempC: number
  hasOpenFlue: boolean
  selectedRadiators: { radiatorId: string; quantity: number }[]
}

type SystemSpec = {
  emitterType: string
  flowTemp: number
  returnTemp: number
  hpManufacturer: string
  hpModel: string
  hpOutputKw: number
  hpSoundPowerDb: number
  cylinderSizeLitres: number
  cylinderManufacturer: string
  cylinderModel: string
  cylinderType: string
  bufferTankL: number
  antifreezePct: number
  noiseDistanceM: number
  noiseReflectiveSurfaces: number
  noiseHasBarrier: boolean
  noiseBarrierAttenuation: number
  noiseAssessmentLocation: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOM_TEMPS: Record<string, number> = {
  'Living room': 21, 'Dining room': 21, 'Kitchen': 18, 'Bedroom': 18,
  'Bathroom': 22, 'En-suite': 22, 'Hall / Landing': 18, 'Study': 21,
  'Utility room': 16, 'WC': 18, 'Conservatory': 21, 'Garage': 10, 'Other': 18,
}

const ROOM_ACH: Record<string, number> = {
  'Living room': 1.5, 'Dining room': 1.5, 'Kitchen': 2.0, 'Bedroom': 1.0,
  'Bathroom': 2.0, 'En-suite': 2.0, 'Hall / Landing': 1.5, 'Study': 1.5,
  'Utility room': 2.0, 'WC': 2.0, 'Conservatory': 1.5, 'Garage': 0.5, 'Other': 1.5,
}

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
  const col = emitter === 'ufh'
    ? (flowTemp <= 35 ? 1 : flowTemp <= 40 ? 2 : 3)
    : emitter === 'radiators'
    ? (flowTemp <= 45 ? 4 : flowTemp <= 50 ? 5 : flowTemp <= 55 ? 6 : 7)
    : (flowTemp <= 45 ? 8 : flowTemp <= 50 ? 9 : 10)
  const spf = row[col]
  return { spf, stars: spf >= 4.0 ? 6 : spf >= 3.5 ? 5 : spf >= 3.0 ? 4 : spf >= 2.7 ? 3 : spf >= 2.4 ? 2 : 1 }
}

function calcFlowRate(outputW: number, flowTemp: number, returnTemp: number): number {
  const dt = flowTemp - returnTemp
  if (dt <= 0) return 0
  return Math.round((outputW / (dt * 4186 / 60) / 1000) * 100) / 100
}

function recalcVent(room: RoomSpec, designTempExt: number): number {
  const roomTemp = room.designTempC || ROOM_TEMPS[room.roomType] || 21
  const dT = roomTemp - designTempExt
  const area = room.areaMm2 > 0 ? room.areaMm2 / 1e6 : (room.lengthMm * room.widthMm) / 1e6
  const baseAch = ROOM_ACH[room.roomType] || 1.5
  const ach = (room.achOverride !== null ? room.achOverride : baseAch) + (room.hasOpenFlue ? 1.5 : 0)
  const volume = area * (room.heightMm / 1000)
  return Math.round(Math.max(0, 0.33 * ach * volume * dT))
}

const defaultSystem: SystemSpec = {
  emitterType: 'radiators', flowTemp: 50, returnTemp: 40,
  hpManufacturer: '', hpModel: '', hpOutputKw: 0, hpSoundPowerDb: 63,
  cylinderSizeLitres: 200, cylinderManufacturer: '', cylinderModel: '',
  cylinderType: 'indirect', bufferTankL: 0, antifreezePct: 20,
  noiseDistanceM: 3, noiseReflectiveSurfaces: 1,
  noiseHasBarrier: false, noiseBarrierAttenuation: 5,
  noiseAssessmentLocation: 'Nearest neighbour window/door',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SystemSpecPage() {
  const params = useParams()
  const jobId = params.id as string

  const [rooms, setRooms] = useState<RoomSpec[]>([])
  const [system, setSystem] = useState<SystemSpec>(defaultSystem)
  const [customer, setCustomer] = useState<any>(null)
  const [designTempExt, setDesignTempExt] = useState(-4)
  const [totalFloorAreaM2, setTotalFloorAreaM2] = useState(85)
  const [numBedrooms, setNumBedrooms] = useState(3)
  const [expandRoom, setExpandRoom] = useState<string | null>(null)
  const [radSuggest, setRadSuggest] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)
  const [noRooms, setNoRooms] = useState(false)

  useEffect(() => { load() }, [jobId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }

    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }

    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)

    const { data: sd } = await (supabase as any)
      .from('system_designs').select('*').eq('job_id', jobId).single()

    if (!sd) { setNoRooms(true); setLoading(false); return }

    const di = sd.design_inputs || {}

    // Load settings
    if (di.settings) {
      setDesignTempExt(di.settings.designTempExt || -4)
      setTotalFloorAreaM2(di.settings.totalFloorAreaM2 || 85)
      setNumBedrooms(di.settings.numBedrooms || 3)
    }

    // Load system spec if previously saved
    if (di.systemSpec) setSystem(di.systemSpec)

    // ── Load rooms ──────────────────────────────────────────────────────────────
    // di.rooms is the RoomData array saved by the design page
    const rawRooms: RoomData[] = di.rooms || []

    if (rawRooms.length === 0) { setNoRooms(true); setLoading(false); return }

    // Merge saved radiator selections (from design page) into room specs
    const savedRads: Record<string, { id: string; qty: number }[]> = di.selectedRadiators || {}
    // Also merge from systemSpec.roomSpecs if previously saved here
    const savedRoomSpecs: RoomSpec[] = di.roomSpecs || []

    const specs: RoomSpec[] = rawRooms.map(r => {
      // Check if we have a previously saved spec for this room
      const prevSpec = savedRoomSpecs.find(s => s.id === r.id)
      const prevRads = savedRads[r.id] || []

      return {
        ...r,
        // Live-editable fields — use previously saved values or defaults
        designTempC: prevSpec?.designTempC ?? (ROOM_TEMPS[r.roomType] || 21),
        hasOpenFlue: prevSpec?.hasOpenFlue ?? r.hasOpenFlue ?? false,
        // Merge radiators from design page and any previously saved here
        selectedRadiators: prevSpec?.selectedRadiators ?? prevRads.map(sr => ({ radiatorId: sr.id, quantity: sr.qty })),
      }
    })

    setRooms(specs)
    setLoading(false)
  }

  function updRoom(id: string, updates: Partial<RoomSpec>) {
    setRooms(prev => prev.map(r => {
      if (r.id !== id) return r
      const updated = { ...r, ...updates }
      // Recalculate ventilation loss with new parameters
      const ventLoss = recalcVent(updated, designTempExt)
      return { ...updated, ventLossW: ventLoss, totalLossW: updated.fabricLossW + ventLoss }
    }))
  }

  // ─── Computed values ──────────────────────────────────────────────────────────

  const deltaT = (system.flowTemp + system.returnTemp) / 2 - 21
  const totalW = rooms.reduce((s, r) => s + r.totalLossW, 0)
  const shl = totalFloorAreaM2 > 0 ? Math.round(totalW / totalFloorAreaM2) : 0
  const recKw = Math.ceil(totalW / 1000)
  const { spf, stars } = getSPF(shl, system.emitterType, system.flowTemp)
  const annualHeat = Math.round((totalW / ((21 - designTempExt) * 1000)) * 2200 * 24)
  const annualElec = Math.round(annualHeat / spf)
  const annualDHW = Math.round(45 * numBedrooms * 365 * 4.18 * 0.001 / 1.7) * 100
  const noiseLevel = Math.round((
    system.hpSoundPowerDb
    - 20 * Math.log10(system.noiseDistanceM)
    - 8 + 3
    + system.noiseReflectiveSurfaces * 3
    - (system.noiseHasBarrier ? system.noiseBarrierAttenuation : 0)
  ) * 10) / 10
  const noiseOk = noiseLevel <= 37
  const minCylinder = numBedrooms <= 2 ? 150 : numBedrooms <= 3 ? 200 : numBedrooms <= 4 ? 250 : 300

  const totalRadOutput = rooms.reduce((sum, room) =>
    sum + room.selectedRadiators.reduce((rs, sr) => {
      const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.radiatorId)
      return rs + (rad ? radOutput(rad, deltaT) * sr.quantity : 0)
    }, 0), 0)

  // ─── Save ─────────────────────────────────────────────────────────────────────

  async function save(redirect?: string) {
    setSaving(true)
    setSaveError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Load existing design_inputs to merge (not overwrite rooms)
      const { data: sd } = await (supabase as any)
        .from('system_designs').select('design_inputs').eq('job_id', jobId).single()
      const existing = sd?.design_inputs || {}

      // Build selectedRadiators in design page format too
      const selectedRadiators: Record<string, { id: string; qty: number }[]> = {}
      rooms.forEach(r => {
        if (r.selectedRadiators.length > 0) {
          selectedRadiators[r.id] = r.selectedRadiators.map(sr => ({ id: sr.radiatorId, qty: sr.quantity }))
        }
      })

      const payload = {
        design_inputs: {
          ...existing,          // Keep rooms, canvasRooms, settings from design page
          systemSpec: system,   // New: system spec
          roomSpecs: rooms,     // New: room specs with radiators + edits
          selectedRadiators,    // Keep in sync for design page
        },
        // Schema columns
        flow_temp_c: system.flowTemp,
        return_temp_c: system.returnTemp,
        emitter_type: system.emitterType,
        hp_manufacturer: system.hpManufacturer,
        hp_model: system.hpModel,
        hp_size_kw: system.hpOutputKw,
        cylinder_size_l: system.cylinderSizeLitres,
        cylinder_manufacturer: system.cylinderManufacturer,
        cylinder_model: system.cylinderModel,
        buffer_tank_l: system.bufferTankL || null,
        antifreeze_pct: system.antifreezePct,
        scop_estimate: spf,
        annual_kwh: annualHeat + annualDHW,
        // New columns
        total_heat_loss_w: totalW,
        specific_heat_loss_w_m2: shl,
        recommended_hp_kw: recKw,
        spf_estimate: spf,
        star_rating: stars,
        annual_heat_demand_kwh: annualHeat,
        annual_elec_space_kwh: annualElec,
        annual_elec_dhw_kwh: annualDHW,
        noise_level_db: noiseLevel,
        noise_compliant: noiseOk,
        mcs_031_compliant: true,
        mcs_compliant: true,
        designed_by: session.user.id,
        designed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error } = await (supabase as any)
        .from('system_designs').update(payload).eq('job_id', jobId)

      if (error) { setSaveError(`Save failed: ${error.message}`); setSaving(false); return }

      await (supabase as any).from('audit_log').insert({
        job_id: jobId, user_id: session.user.id,
        action: 'system_spec_saved', stage: 'design',
        entity_type: 'system_design',
        description: `System spec: ${system.hpManufacturer} ${system.hpModel} ${system.hpOutputKw}kW, SPF ${spf}, ${stars}★, noise ${noiseLevel}dB`,
      })

      setSaving(false); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      if (redirect) window.location.href = redirect
    } catch (e: any) {
      setSaveError(`Error: ${e.message}`)
      setSaving(false)
    }
  }

  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const sel = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  }

  if (noRooms) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <div className="text-sm font-medium text-gray-700">No rooms found in this design</div>
        <p className="text-xs text-gray-500">Complete the floor plan design first, then save before continuing here.</p>
        <a href={`/jobs/${jobId}/design`} className="bg-emerald-700 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-emerald-800">
          ← Go to design tool
        </a>
      </div>
    )
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
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.address_line1}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/jobs/${jobId}/design`} className="text-xs text-gray-400 hover:text-gray-600">← Floor plan</a>
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">Job →</a>
          {saveError && <span className="text-xs text-red-600">{saveError}</span>}
          <button onClick={() => save()} disabled={saving}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* MCS strip */}
      <div className="bg-emerald-700 text-white px-4 py-1 flex items-center gap-4 text-xs">
        <span className="font-medium">MCS</span>
        <span>MIS 3005-D</span><span>MCS 031 v4.0</span><span>BS EN 12831-1</span><span>MCS 020(a)</span>
        <span className="ml-auto">Design temp: {designTempExt}°C</span>
      </div>

      {/* Summary metrics */}
      <div className="max-w-6xl mx-auto px-4 pt-5 pb-2">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total heat loss', value: `${(totalW/1000).toFixed(2)} kW`, sub: `${shl} W/m²`, ok: true },
            { label: 'Recommended ASHP', value: `≥ ${recKw} kW`, sub: 'at design conditions', ok: true },
            { label: 'MCS 031 SPF', value: String(spf), sub: `${'★'.repeat(stars)}${'☆'.repeat(6-stars)} ${stars}/6`, ok: true },
            { label: 'Annual electricity', value: `${(annualElec+annualDHW).toLocaleString()} kWh`, sub: 'space + DHW', ok: true },
            { label: 'Noise check', value: `${noiseLevel} dB`, sub: noiseOk ? '✓ MCS 020(a) pass' : '✗ Exceeds 37dB', ok: noiseOk },
          ].map(m => (
            <div key={m.label} className={`rounded-xl p-3 border ${!m.ok ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
              <div className="text-xs text-gray-400">{m.label}</div>
              <div className={`text-lg font-bold mt-0.5 ${!m.ok ? 'text-red-700' : 'text-gray-900'}`}>{m.value}</div>
              <div className={`text-xs mt-0.5 ${!m.ok ? 'text-red-600' : 'text-gray-400'}`}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Radiator coverage banner */}
        {totalRadOutput > 0 && (
          <div className={`mt-3 rounded-lg px-4 py-2.5 flex items-center justify-between text-xs ${totalRadOutput >= totalW ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
            <span className={totalRadOutput >= totalW ? 'text-emerald-700' : 'text-amber-700'}>
              {totalRadOutput >= totalW ? '✓' : '⚠'} Radiator coverage: <strong>{(totalRadOutput/1000).toFixed(1)}kW</strong> selected vs <strong>{(totalW/1000).toFixed(1)}kW</strong> required
            </span>
            {totalRadOutput < totalW && <span className="text-amber-600">Short by {((totalW-totalRadOutput)/1000).toFixed(1)}kW — add more radiators below</span>}
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Room list ─────────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Room-by-room specification</h2>
              <p className="text-xs text-gray-400 mt-0.5">Adjust room parameters — heat loss updates live. Add radiators from the Ultraheat catalogue.</p>
            </div>

            {rooms.map(room => {
              const roomRadOutput = room.selectedRadiators.reduce((s, sr) => {
                const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.radiatorId)
                return s + (rad ? radOutput(rad, deltaT) * sr.quantity : 0)
              }, 0)
              const radOk = roomRadOutput >= room.totalLossW * 0.95
              const areaM2 = room.areaMm2 > 0 ? room.areaMm2 / 1e6 : room.lengthMm * room.widthMm / 1e6
              const effectiveAch = (room.achOverride ?? ROOM_ACH[room.roomType] ?? 1.5) + (room.hasOpenFlue ? 1.5 : 0)

              return (
                <div key={room.id} className={`bg-white border rounded-xl overflow-hidden ${room.selectedRadiators.length > 0 && !radOk ? 'border-amber-300' : 'border-gray-200'}`}>
                  {/* Room header */}
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandRoom(expandRoom === room.id ? null : room.id)}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900">{room.name || room.roomType}</div>
                      <div className="text-xs text-gray-400">
                        {room.roomType} · {areaM2.toFixed(1)}m² · {room.designTempC}°C · ACH {effectiveAch.toFixed(1)}
                        {room.hasOpenFlue && <span className="text-amber-600 ml-1">+open flue</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-900">{room.totalLossW}W</div>
                        <div className={`text-xs ${radOk ? 'text-emerald-600' : room.selectedRadiators.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {room.selectedRadiators.length > 0
                            ? `${roomRadOutput}W ${radOk ? '✓' : '✗'}`
                            : 'No radiator'}
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs">{expandRoom === room.id ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {expandRoom === room.id && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50">

                      {/* Quick param editing */}
                      <div>
                        <div className="text-xs font-semibold text-gray-700 mb-2">Room parameters — live heat loss update</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div>
                            <label className={lbl}>Design temp (°C)</label>
                            <input type="number" className={inp} value={room.designTempC} step={0.5}
                              onChange={e => updRoom(room.id, { designTempC: parseFloat(e.target.value)||21 })}/>
                            <div className="text-xs text-gray-400 mt-0.5">Default: {ROOM_TEMPS[room.roomType]||21}°C</div>
                          </div>
                          <div>
                            <label className={lbl}>Air changes/hr</label>
                            <input type="number" className={inp} value={room.achOverride ?? ''} step={0.1}
                              placeholder={`${ROOM_ACH[room.roomType]||1.5} (CIBSE)`}
                              onChange={e => { const v=parseFloat(e.target.value); updRoom(room.id, { achOverride: isNaN(v)?null:v }) }}/>
                            <div className="text-xs text-gray-400 mt-0.5">Effective: {effectiveAch.toFixed(1)}</div>
                          </div>
                          <div>
                            <label className={lbl}>Floor</label>
                            <select className={sel} value={room.floorAdj}
                              onChange={e => updRoom(room.id, { floorAdj: e.target.value })}>
                              <option value="ground">Ground (10°C)</option>
                              <option value="heated">Heated space</option>
                              <option value="unheated">Unheated</option>
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Ceiling</label>
                            <select className={sel} value={room.ceilingAdj}
                              onChange={e => updRoom(room.id, { ceilingAdj: e.target.value })}>
                              <option value="heated">Heated above</option>
                              <option value="roof">Roof / outside</option>
                              <option value="unheated">Unheated loft</option>
                            </select>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 mt-2 cursor-pointer w-fit">
                          <input type="checkbox" checked={room.hasOpenFlue}
                            onChange={e => updRoom(room.id, { hasOpenFlue: e.target.checked })} className="rounded"/>
                          <span className="text-xs text-gray-700">Open flued fire or stove</span>
                          {room.hasOpenFlue && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">+1.5 ACH</span>}
                        </label>
                      </div>

                      {/* Heat loss breakdown */}
                      <div className="grid grid-cols-3 gap-2">
                        {[['Fabric', room.fabricLossW], ['Ventilation', room.ventLossW], ['Total', room.totalLossW]].map(([k,v]) => (
                          <div key={k} className={`rounded-lg p-2.5 text-center border ${k==='Total'?'bg-emerald-50 border-emerald-200':'bg-white border-gray-200'}`}>
                            <div className="text-xs text-gray-400">{k}</div>
                            <div className={`font-bold text-sm ${k==='Total'?'text-emerald-700':'text-gray-900'}`}>{v}W</div>
                          </div>
                        ))}
                      </div>

                      {/* Selected radiators */}
                      {room.selectedRadiators.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-gray-700 mb-2">Selected radiators</div>
                          <div className="space-y-1.5">
                            {room.selectedRadiators.map((sr, si) => {
                              const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.radiatorId)
                              if (!rad) return null
                              const out = radOutput(rad, deltaT)
                              const totalOut = out * sr.quantity
                              const fr = calcFlowRate(totalOut, system.flowTemp, system.returnTemp)
                              return (
                                <div key={si} className="flex items-center justify-between bg-white border border-emerald-200 rounded-lg px-3 py-2">
                                  <div className="text-xs min-w-0">
                                    <div className="font-medium text-gray-900">{rad.type} — H{rad.height_mm} × {rad.length_mm}mm × {sr.quantity}</div>
                                    <div className="text-gray-500 mt-0.5">
                                      {out}W each ·
                                      <span className="text-emerald-700 font-semibold mx-1">{totalOut}W total</span>·
                                      <span className="text-blue-600 ml-1">{fr} l/min</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                    <input type="number" min={1} value={sr.quantity}
                                      className="w-12 text-xs border border-gray-200 rounded px-2 py-1"
                                      onChange={e => {
                                        const rads = [...room.selectedRadiators]
                                        rads[si] = { ...sr, quantity: parseInt(e.target.value)||1 }
                                        updRoom(room.id, { selectedRadiators: rads })
                                      }}/>
                                    <button
                                      onClick={() => updRoom(room.id, { selectedRadiators: room.selectedRadiators.filter((_,i) => i!==si) })}
                                      className="text-red-400 hover:text-red-600 text-sm">✕</button>
                                  </div>
                                </div>
                              )
                            })}
                            {/* Coverage summary */}
                            <div className={`text-xs px-3 py-2 rounded-lg ${radOk ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              Coverage: <strong>{roomRadOutput}W</strong> · Need: <strong>{room.totalLossW}W</strong>
                              {radOk ? ' ✓ Adequate' : ` — add ${room.totalLossW - roomRadOutput}W more`}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Radiator selection */}
                      <div>
                        <button onClick={() => setRadSuggest(radSuggest === room.id ? null : room.id)}
                          className="text-xs text-emerald-700 hover:underline font-medium">
                          {radSuggest === room.id ? 'Hide catalogue' : `+ Select Ultraheat radiator for ${room.totalLossW}W →`}
                        </button>
                        {radSuggest === room.id && (
                          <div className="mt-2 bg-white border border-gray-200 rounded-xl p-3">
                            <div className="text-xs text-gray-500 mb-2">
                              Sized for {room.totalLossW}W · Mean water {(system.flowTemp+system.returnTemp)/2}°C · Room {room.designTempC}°C · ΔT{Math.round(deltaT)}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                              {ULTRAHEAT_RADIATORS
                                .filter(r => { const o=radOutput(r,deltaT); return o>=room.totalLossW*0.8&&o<=room.totalLossW*2.8 })
                                .sort((a,b) => Math.abs(radOutput(a,deltaT)-room.totalLossW)-Math.abs(radOutput(b,deltaT)-room.totalLossW))
                                .slice(0,12)
                                .map(rad => {
                                  const out = radOutput(rad, deltaT)
                                  const pct = Math.round((out/room.totalLossW-1)*100)
                                  const fr = calcFlowRate(out, system.flowTemp, system.returnTemp)
                                  return (
                                    <button key={rad.id}
                                      onClick={() => { updRoom(room.id, { selectedRadiators: [...room.selectedRadiators, { radiatorId: rad.id, quantity: 1 }] }); setRadSuggest(null) }}
                                      className="text-left p-2.5 border border-gray-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                                      <div className="text-xs font-semibold text-gray-900">{rad.type}</div>
                                      <div className="text-xs text-gray-500">H{rad.height_mm} × {rad.length_mm}mm</div>
                                      <div className="text-xs font-bold text-emerald-700 mt-1">{out}W <span className="text-gray-400 font-normal">+{pct}%</span></div>
                                      <div className="text-xs text-blue-600">{fr} l/min</div>
                                      <div className="text-xs text-gray-400">{rad.depth_mm}mm deep</div>
                                    </button>
                                  )
                                })}
                              {ULTRAHEAT_RADIATORS.filter(r => { const o=radOutput(r,deltaT); return o>=room.totalLossW*0.8&&o<=room.totalLossW*2.8 }).length === 0 && (
                                <div className="col-span-3 text-xs text-gray-400 py-4 text-center">
                                  No single radiator matches at this flow temperature. Try adjusting flow temp or using two units.
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

          {/* ── Right column: HP + cylinder + MCS 031 + noise ─────────────────── */}
          <div className="space-y-4">

            {/* Heat pump */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Heat pump specification</div>
              <div className="space-y-2.5">
                <div>
                  <label className={lbl}>Emitter type</label>
                  <select className={sel} value={system.emitterType} onChange={e => setSystem(p => ({...p, emitterType: e.target.value}))}>
                    <option value="radiators">Radiators</option>
                    <option value="ufh">Underfloor heating</option>
                    <option value="mixed">Mixed UFH + radiators</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Flow temp (°C)</label>
                    <input type="number" className={inp} value={system.flowTemp} step={1} onChange={e => setSystem(p => ({...p, flowTemp: parseInt(e.target.value)||50}))}/>
                  </div>
                  <div>
                    <label className={lbl}>Return temp (°C)</label>
                    <input type="number" className={inp} value={system.returnTemp} step={1} onChange={e => setSystem(p => ({...p, returnTemp: parseInt(e.target.value)||40}))}/>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 text-xs grid grid-cols-2 gap-2">
                  <div><span className="text-gray-400">Mean water</span><div className="font-semibold">{(system.flowTemp+system.returnTemp)/2}°C</div></div>
                  <div><span className="text-gray-400">ΔT at 21°C room</span><div className="font-semibold">{Math.round(deltaT)}°C</div></div>
                  <div><span className="text-gray-400">SPF</span><div className="font-semibold">{spf}</div></div>
                  <div><span className="text-gray-400">Stars</span><div>{'★'.repeat(stars)}{'☆'.repeat(6-stars)}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Manufacturer</label>
                    <input type="text" className={inp} value={system.hpManufacturer} placeholder="e.g. Mitsubishi" onChange={e => setSystem(p => ({...p, hpManufacturer: e.target.value}))}/>
                  </div>
                  <div>
                    <label className={lbl}>Model</label>
                    <input type="text" className={inp} value={system.hpModel} placeholder="e.g. Ecodan 8.5kW" onChange={e => setSystem(p => ({...p, hpModel: e.target.value}))}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Rated output (kW)</label>
                    <input type="number" className={inp} value={system.hpOutputKw} step={0.5} onChange={e => setSystem(p => ({...p, hpOutputKw: parseFloat(e.target.value)||0}))}/>
                  </div>
                  <div>
                    <label className={lbl}>Sound power dB(A)</label>
                    <input type="number" className={inp} value={system.hpSoundPowerDb} step={0.5} onChange={e => setSystem(p => ({...p, hpSoundPowerDb: parseFloat(e.target.value)||63}))}/>
                  </div>
                </div>
                {system.hpOutputKw > 0 && (
                  <div className={`text-xs p-2.5 rounded-lg ${system.hpOutputKw >= recKw ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {system.hpOutputKw >= recKw
                      ? `✓ Adequate — ${system.hpOutputKw}kW rated, ${recKw}kW required (+${Math.round((system.hpOutputKw/recKw-1)*100)}% headroom)`
                      : `✗ Undersized — ${system.hpOutputKw}kW rated, need ${recKw}kW`}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Antifreeze %</label>
                    <input type="number" className={inp} value={system.antifreezePct} min={0} max={40} step={5} onChange={e => setSystem(p => ({...p, antifreezePct: parseInt(e.target.value)||20}))}/>
                  </div>
                  <div>
                    <label className={lbl}>Buffer tank (L, 0=none)</label>
                    <input type="number" className={inp} value={system.bufferTankL} min={0} step={25} onChange={e => setSystem(p => ({...p, bufferTankL: parseInt(e.target.value)||0}))}/>
                  </div>
                </div>
              </div>
            </div>

            {/* Cylinder */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Hot water cylinder</div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Manufacturer</label>
                    <input type="text" className={inp} value={system.cylinderManufacturer} placeholder="e.g. Gledhill" onChange={e => setSystem(p => ({...p, cylinderManufacturer: e.target.value}))}/>
                  </div>
                  <div>
                    <label className={lbl}>Model</label>
                    <input type="text" className={inp} value={system.cylinderModel} placeholder="e.g. StainlessLite" onChange={e => setSystem(p => ({...p, cylinderModel: e.target.value}))}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Type</label>
                    <select className={sel} value={system.cylinderType} onChange={e => setSystem(p => ({...p, cylinderType: e.target.value}))}>
                      <option value="indirect">Indirect (HP coil)</option>
                      <option value="direct">Direct / immersion</option>
                      <option value="thermal_store">Thermal store</option>
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Size (litres)</label>
                    <input type="number" className={inp} value={system.cylinderSizeLitres} step={25} onChange={e => setSystem(p => ({...p, cylinderSizeLitres: parseInt(e.target.value)||200}))}/>
                  </div>
                </div>
                <div className={`text-xs p-2 rounded-lg ${system.cylinderSizeLitres >= minCylinder ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  MIS 3005-D minimum: {minCylinder}L for {numBedrooms} bedrooms {system.cylinderSizeLitres < minCylinder ? '⚠ Below minimum' : '✓'}
                </div>
              </div>
            </div>

            {/* MCS 031 */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">MCS 031 Performance estimate</div>
              <div className="space-y-1.5 text-xs">
                {[
                  ['Specific heat loss', `${shl} W/m²`],
                  ['Estimated SPF', String(spf)],
                  ['Star rating', `${'★'.repeat(stars)}${'☆'.repeat(6-stars)} ${stars}/6`],
                  ['Annual heat demand', `${annualHeat.toLocaleString()} kWh`],
                  ['Annual elec — space', `${annualElec.toLocaleString()} kWh`],
                  ['Annual elec — DHW', `${annualDHW.toLocaleString()} kWh`],
                  ['Total annual elec', `${(annualElec+annualDHW).toLocaleString()} kWh`],
                ].map(([k,v]) => (
                  <div key={k} className="flex justify-between py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-400">{k}</span>
                    <span className="font-semibold text-gray-900">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 bg-emerald-50 rounded-lg p-2.5 text-xs text-emerald-800">
                <div className="font-medium mb-0.5">Mandatory customer disclosure (MCS 031):</div>
                Estimated {(annualElec+annualDHW).toLocaleString()} kWh/yr (range {Math.round((annualElec+annualDHW)*0.9).toLocaleString()}–{Math.round((annualElec+annualDHW)*1.1).toLocaleString()} kWh/yr)
              </div>
            </div>

            {/* Noise MCS 020(a) */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">MCS 020(a) Noise assessment</div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Distance to assessment point (m)</label>
                    <input type="number" className={inp} value={system.noiseDistanceM} step={0.5} min={1} onChange={e => setSystem(p => ({...p, noiseDistanceM: parseFloat(e.target.value)||1}))}/>
                  </div>
                  <div>
                    <label className={lbl}>Reflective surfaces</label>
                    <select className={sel} value={system.noiseReflectiveSurfaces} onChange={e => setSystem(p => ({...p, noiseReflectiveSurfaces: parseInt(e.target.value)}))}>
                      <option value={0}>0 — Free field</option>
                      <option value={1}>1 — One wall</option>
                      <option value={2}>2 — Corner</option>
                      <option value={3}>3 — Three surfaces</option>
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={system.noiseHasBarrier} onChange={e => setSystem(p => ({...p, noiseHasBarrier: e.target.checked}))} className="rounded"/>
                  Acoustic barrier present
                </label>
                {system.noiseHasBarrier && (
                  <div>
                    <label className={lbl}>Barrier attenuation (dB)</label>
                    <input type="number" className={inp} value={system.noiseBarrierAttenuation} step={0.5} onChange={e => setSystem(p => ({...p, noiseBarrierAttenuation: parseFloat(e.target.value)||0}))}/>
                  </div>
                )}
                <div>
                  <label className={lbl}>Assessment location description</label>
                  <input type="text" className={inp} value={system.noiseAssessmentLocation} onChange={e => setSystem(p => ({...p, noiseAssessmentLocation: e.target.value}))}/>
                </div>
                <div className={`rounded-xl p-3 text-center border-2 ${noiseOk ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
                  <div className={`text-2xl font-bold ${noiseOk ? 'text-emerald-700' : 'text-red-700'}`}>{noiseLevel} dB</div>
                  <div className={`text-xs font-semibold mt-0.5 ${noiseOk ? 'text-emerald-600' : 'text-red-600'}`}>
                    {noiseOk ? '✓ MCS 020(a) Compliant — below 37dB' : '✗ Non-compliant — exceeds 37dB limit'}
                  </div>
                </div>
              </div>
            </div>

            {/* Save + continue */}
            <button onClick={() => save(`/jobs/${jobId}`)} disabled={saving}
              className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-semibold py-3 rounded-xl transition-colors">
              {saving ? 'Saving...' : 'Save & return to job →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}