'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─── CIBSE Design Temperatures by UK region ───────────────────────────────────
const DESIGN_TEMPS: Record<string, { temp: number; label: string }> = {
  'London':         { temp: -3.0, label: 'London / SE England' },
  'Birmingham':     { temp: -4.0, label: 'Birmingham / Midlands' },
  'Manchester':     { temp: -4.0, label: 'Manchester / NW England' },
  'Leeds':          { temp: -4.0, label: 'Leeds / Yorkshire' },
  'Newcastle':      { temp: -5.0, label: 'Newcastle / NE England' },
  'Bristol':        { temp: -3.0, label: 'Bristol / SW England' },
  'Cardiff':        { temp: -3.0, label: 'Cardiff / Wales' },
  'Edinburgh':      { temp: -6.0, label: 'Edinburgh / Central Scotland' },
  'Glasgow':        { temp: -5.0, label: 'Glasgow / W Scotland' },
  'Aberdeen':       { temp: -7.0, label: 'Aberdeen / N Scotland' },
  'Belfast':        { temp: -3.0, label: 'Belfast / N Ireland' },
  'Norwich':        { temp: -4.0, label: 'Norwich / East Anglia' },
  'Plymouth':       { temp: -2.0, label: 'Plymouth / Cornwall' },
  'Sheffield':      { temp: -4.0, label: 'Sheffield / S Yorkshire' },
  'Nottingham':     { temp: -4.0, label: 'Nottingham / E Midlands' },
}

// ─── MCS Room Temperature Requirements (MIS 3005-D Table 1) ──────────────────
const ROOM_DESIGN_TEMPS: Record<string, number> = {
  'Living room':      21,
  'Dining room':      21,
  'Kitchen':          18,
  'Bedroom':          18,
  'Bathroom':         22,
  'En-suite':         22,
  'Hall / Landing':   18,
  'Study':            21,
  'Utility room':     16,
  'WC':               18,
  'Conservatory':     21,
  'Garage':           10,
  'Other':            18,
}

// ─── U-Value defaults by construction era and element ─────────────────────────
const U_VALUE_DEFAULTS: Record<string, Record<string, number>> = {
  'pre_1920':     { ext_wall: 1.7,  roof: 2.0,  ground_floor: 0.7,  window: 4.8,  door: 3.0 },
  '1920_1945':    { ext_wall: 1.5,  roof: 1.5,  ground_floor: 0.7,  window: 4.8,  door: 3.0 },
  '1945_1965':    { ext_wall: 1.0,  roof: 1.0,  ground_floor: 0.7,  window: 4.8,  door: 3.0 },
  '1965_1975':    { ext_wall: 1.0,  roof: 0.6,  ground_floor: 0.7,  window: 3.1,  door: 3.0 },
  '1976_1990':    { ext_wall: 0.6,  roof: 0.35, ground_floor: 0.45, window: 2.8,  door: 3.0 },
  '1991_2002':    { ext_wall: 0.35, roof: 0.20, ground_floor: 0.25, window: 1.8,  door: 2.0 },
  '2003_2011':    { ext_wall: 0.27, roof: 0.16, ground_floor: 0.22, window: 1.6,  door: 1.8 },
  '2012_present': { ext_wall: 0.18, roof: 0.13, ground_floor: 0.15, window: 1.4,  door: 1.4 },
}

// Insulation improvements
const WALL_U_OVERRIDES: Record<string, number> = {
  'solid_uninsulated':      1.7,
  'solid_ext_insulation':   0.28,
  'solid_int_insulation':   0.30,
  'cavity_uninsulated':     1.0,
  'cavity_partial_fill':    0.60,
  'cavity_full_fill':       0.32,
  'cavity_ext_insulation':  0.18,
  'timber_frame_insulated': 0.25,
}
const ROOF_U_OVERRIDES: Record<string, number> = {
  'flat_no_insulation':     2.0,
  'pitched_no_insulation':  2.0,
  'pitched_25mm':           0.68,
  'pitched_50mm':           0.41,
  'pitched_100mm':          0.25,
  'pitched_150mm':          0.16,
  'pitched_200mm':          0.13,
  'pitched_250mm_plus':     0.11,
}
const WINDOW_U_VALUES: Record<string, number> = {
  'single':           4.8,
  'secondary':        2.4,
  'double_pre2002':   2.8,
  'double_post2002':  2.0,
  'double_low_e':     1.4,
  'triple':           0.8,
}

// ─── ACH by room type (CIBSE Domestic Heating Design Guide Table 3.8) ─────────
const ACH_BY_ROOM: Record<string, number> = {
  'Living room':    1.5,
  'Dining room':    1.5,
  'Kitchen':        2.0,
  'Bedroom':        1.0,
  'Bathroom':       2.0,
  'En-suite':       2.0,
  'Hall / Landing': 1.5,
  'Study':          1.5,
  'Utility room':   2.0,
  'WC':             2.0,
  'Conservatory':   1.5,
  'Garage':         0.5,
  'Other':          1.5,
}

// ─── MCS 031 Issue 4.0 SPF Lookup Table 2 (Heat Emitter Guide) ────────────────
// Rows: specific heat loss bands (W/m²), Cols: emitter type + flow temp
// Structure: [specific_heat_loss_max, UFH_35, UFH_40, UFH_45, RAD_45, RAD_50, RAD_55, RAD_60, MIX_45, MIX_50, MIX_55]
const MCS031_SPF_TABLE = [
  // [max_W_m2, UFH_35, UFH_40, UFH_45, RAD_45, RAD_50, RAD_55, RAD_60, MIX_45, MIX_50, MIX_55]
  [20,  4.5, 4.2, 3.9, 3.6, 3.3, 3.0, 2.7, 3.8, 3.5, 3.2],
  [30,  4.3, 4.0, 3.7, 3.4, 3.1, 2.8, 2.6, 3.6, 3.3, 3.0],
  [40,  4.1, 3.8, 3.5, 3.2, 2.9, 2.7, 2.5, 3.4, 3.1, 2.8],
  [50,  3.9, 3.6, 3.3, 3.0, 2.8, 2.6, 2.4, 3.2, 2.9, 2.7],
  [60,  3.7, 3.4, 3.1, 2.9, 2.7, 2.5, 2.3, 3.0, 2.8, 2.6],
  [80,  3.5, 3.2, 2.9, 2.7, 2.6, 2.4, 2.2, 2.8, 2.6, 2.4],
  [100, 3.3, 3.0, 2.8, 2.6, 2.5, 2.3, 2.1, 2.7, 2.5, 2.3],
  [120, 3.1, 2.9, 2.7, 2.5, 2.4, 2.2, 2.0, 2.6, 2.4, 2.2],
  [999, 2.9, 2.7, 2.5, 2.4, 2.3, 2.1, 1.9, 2.5, 2.3, 2.1],
]

function getSPF(specificHeatLoss: number, emitterType: string, flowTemp: number): { spf: number; stars: number; warning: string } {
  const row = MCS031_SPF_TABLE.find(r => specificHeatLoss <= r[0]) || MCS031_SPF_TABLE[MCS031_SPF_TABLE.length - 1]
  let colIndex = 1
  let warning = ''

  if (emitterType === 'ufh') {
    if (flowTemp <= 35) colIndex = 1
    else if (flowTemp <= 40) colIndex = 2
    else colIndex = 3
  } else if (emitterType === 'radiators') {
    if (flowTemp <= 45) colIndex = 4
    else if (flowTemp <= 50) colIndex = 5
    else if (flowTemp <= 55) colIndex = 6
    else { colIndex = 7; warning = 'High flow temperature reduces efficiency. Consider radiator upgrades to allow lower flow temp.' }
  } else { // mixed
    if (flowTemp <= 45) colIndex = 8
    else if (flowTemp <= 50) colIndex = 9
    else colIndex = 10
  }

  const spf = row[colIndex] as number

  // Star rating: 1-6 based on SPF
  let stars = 1
  if (spf >= 4.0) stars = 6
  else if (spf >= 3.5) stars = 5
  else if (spf >= 3.0) stars = 4
  else if (spf >= 2.7) stars = 3
  else if (spf >= 2.4) stars = 2

  return { spf, stars, warning }
}

// ─── MCS 020(a) Noise Calculation ─────────────────────────────────────────────
function calcNoise(soundPowerDb: number, distanceM: number, reflectiveSurfaces: number, hasBarrier: boolean, barrierAttenuation: number): number {
  // MCS 020(a) formula: Lp = Lw - 20*log10(r) - 8 + D + R - B
  // D = directivity correction (0 for free field, 3 for ground reflection)
  // R = reflective surface correction
  // B = barrier attenuation
  const D = 3 // near ground level
  const R = reflectiveSurfaces * 3
  const B = hasBarrier ? barrierAttenuation : 0
  const result = soundPowerDb - (20 * Math.log10(distanceM)) - 8 + D + R - B
  return Math.round(result * 10) / 10
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Room = {
  id: string
  name: string
  type: string
  floor: number
  length: number
  width: number
  height: number
  ext_wall_area: number
  ext_wall_u: number
  window_area: number
  window_u: number
  door_area: number
  door_u: number
  floor_area_exposed: number
  floor_u: number
  ceiling_area_exposed: number
  ceiling_u: number
  // Adjacent space types
  floor_adj: string    // 'ground', 'heated', 'unheated', 'outside'
  ceiling_adj: string  // 'heated', 'unheated', 'outside', 'roof'
  // Calculated
  fabric_loss: number
  ventilation_loss: number
  total_loss: number
}

type DesignData = {
  // Property
  location: string
  design_temp_ext: number
  construction_era: string
  property_type: string
  storeys: number
  num_bedrooms: number
  total_floor_area: number
  // Fabric defaults
  wall_type: string
  roof_type: string
  window_type: string
  // Ventilation
  sheltered: string
  air_tightness_measured: boolean
  air_tightness_value: number
  // Rooms
  rooms: Room[]
  // System
  emitter_type: string
  flow_temp: number
  hp_model: string
  hp_output_kw: number
  cylinder_size_litres: number
  cylinder_type: string
  // Noise
  hp_sound_power_db: number
  noise_distance_m: number
  noise_reflective_surfaces: number
  noise_has_barrier: boolean
  noise_barrier_attenuation: number
  noise_assessment_location: string
}

const defaultRoom = (id: string): Room => ({
  id,
  name: '',
  type: 'Living room',
  floor: 0,
  length: 4.0,
  width: 3.5,
  height: 2.4,
  ext_wall_area: 10.0,
  ext_wall_u: 0.6,
  window_area: 2.0,
  window_u: 2.0,
  door_area: 0,
  door_u: 3.0,
  floor_area_exposed: 0,
  floor_u: 0.45,
  ceiling_area_exposed: 0,
  ceiling_u: 0.25,
  floor_adj: 'ground',
  ceiling_adj: 'heated',
  fabric_loss: 0,
  ventilation_loss: 0,
  total_loss: 0,
})

const defaultDesign: DesignData = {
  location: 'Birmingham',
  design_temp_ext: -4.0,
  construction_era: '1976_1990',
  property_type: 'semi_detached',
  storeys: 2,
  num_bedrooms: 3,
  total_floor_area: 85,
  wall_type: 'cavity_uninsulated',
  roof_type: 'pitched_100mm',
  window_type: 'double_post2002',
  sheltered: 'normal',
  air_tightness_measured: false,
  air_tightness_value: 5.0,
  rooms: [],
  emitter_type: 'radiators',
  flow_temp: 50,
  hp_model: '',
  hp_output_kw: 0,
  cylinder_size_litres: 200,
  cylinder_type: 'indirect',
  hp_sound_power_db: 63,
  noise_distance_m: 3,
  noise_reflective_surfaces: 1,
  noise_has_barrier: false,
  noise_barrier_attenuation: 5,
  noise_assessment_location: 'Nearest neighbour window/door',
}

function calcRoom(room: Room, designTempExt: number, sheltered: string): Room {
  const roomTemp = ROOM_DESIGN_TEMPS[room.type] || 21
  const deltaT = roomTemp - designTempExt

  // Adjacent space temperatures
  const adjTempMap: Record<string, number> = {
    'ground': 10,
    'heated': roomTemp,
    'unheated': (roomTemp + designTempExt) / 2,
    'outside': designTempExt,
    'roof': designTempExt,
  }

  const floorDelta = roomTemp - (adjTempMap[room.floor_adj] || 10)
  const ceilingDelta = roomTemp - (adjTempMap[room.ceiling_adj] || roomTemp)

  // Fabric losses
  const wallLoss = room.ext_wall_area * room.ext_wall_u * deltaT
  const windowLoss = room.window_area * room.window_u * deltaT
  const doorLoss = room.door_area * room.door_u * deltaT
  const floorLoss = room.floor_area_exposed * room.floor_u * floorDelta
  const ceilingLoss = room.ceiling_area_exposed * room.ceiling_u * ceilingDelta

  const fabricLoss = Math.max(0, wallLoss + windowLoss + doorLoss + floorLoss + ceilingLoss)

  // Ventilation loss — BS EN 12831-1:2017
  const ach = ACH_BY_ROOM[room.type] || 1.5
  const volume = room.length * room.width * room.height
  const shelterFactor = sheltered === 'very_sheltered' ? 0.8 : sheltered === 'sheltered' ? 0.9 : sheltered === 'exposed' ? 1.2 : 1.0
  const ventLoss = 0.33 * ach * shelterFactor * volume * deltaT

  const totalLoss = Math.round(fabricLoss + ventLoss)

  return {
    ...room,
    fabric_loss: Math.round(fabricLoss),
    ventilation_loss: Math.round(ventLoss),
    total_loss: totalLoss,
  }
}

// DHW cylinder sizing (MIS 3005-D guidance)
function calcCylinderSize(bedrooms: number): number {
  if (bedrooms <= 2) return 150
  if (bedrooms <= 3) return 200
  if (bedrooms <= 4) return 250
  return 300
}

// Annual heat demand from degree days (UK avg ~2200 HDD base 15.5)
function calcAnnualHeatDemand(totalHeatLossW: number, designDeltaT: number): number {
  const degreeDays = 2200
  const hours = 24
  return Math.round((totalHeatLossW / (designDeltaT * 1000)) * degreeDays * hours)
}

export default function DesignToolPage() {
  const params = useParams()
  const jobId = params.id as string

  const [design, setDesign] = useState<DesignData>(defaultDesign)
  const [activeSection, setActiveSection] = useState<'property' | 'rooms' | 'system' | 'performance' | 'noise'>('property')
  const [editingRoom, setEditingRoom] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [epcData, setEpcData] = useState<any>(null)

  useEffect(() => {
    loadJob()
  }, [jobId])

  async function loadJob() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }

    const { data: jobData } = await (supabase as any)
      .from('jobs').select('*').eq('id', jobId).single()
    if (!jobData) { window.location.replace('/jobs'); return }
    setJob(jobData)

    const { data: custData } = await (supabase as any)
      .from('customers').select('*').eq('id', jobData.customer_id).single()
    setCustomer(custData)

    // Load existing design if saved
    const { data: designData } = await (supabase as any)
      .from('system_designs').select('*').eq('job_id', jobId).single()

    if (designData?.design_inputs) {
      setDesign(designData.design_inputs)
    } else if (custData) {
      // Pre-populate from EPC / customer data
      const era = mapEraFromEpc(custData.notes || '')
      const loc = guessLocation(custData.postcode || '')
      setDesign(prev => ({
        ...prev,
        location: loc,
        design_temp_ext: DESIGN_TEMPS[loc]?.temp || -4.0,
        total_floor_area: custData.floor_area_m2 || 85,
        construction_era: era,
        num_bedrooms: 3,
      }))
    }
  }

  function mapEraFromEpc(notes: string): string {
    const n = notes.toLowerCase()
    if (n.includes('2012') || n.includes('2007')) return '2012_present'
    if (n.includes('2003') || n.includes('2000')) return '2003_2011'
    if (n.includes('1991') || n.includes('1996')) return '1991_2002'
    if (n.includes('1976') || n.includes('1983')) return '1976_1990'
    if (n.includes('1967') || n.includes('1965')) return '1965_1975'
    if (n.includes('1945') || n.includes('1950')) return '1945_1965'
    if (n.includes('1920') || n.includes('1930')) return '1920_1945'
    return '1976_1990'
  }

  function guessLocation(postcode: string): string {
    const prefix = postcode.slice(0, 2).toUpperCase()
    const map: Record<string, string> = {
      'EC': 'London', 'WC': 'London', 'E': 'London', 'N': 'London', 'NW': 'London',
      'SE': 'London', 'SW': 'London', 'W': 'London', 'BR': 'London', 'CR': 'London',
      'B': 'Birmingham', 'WS': 'Birmingham', 'WV': 'Birmingham', 'DY': 'Birmingham',
      'M': 'Manchester', 'OL': 'Manchester', 'BL': 'Manchester', 'SK': 'Manchester',
      'L': 'Manchester', 'WA': 'Manchester', 'CH': 'Manchester',
      'LS': 'Leeds', 'WF': 'Leeds', 'BD': 'Leeds', 'HX': 'Leeds',
      'NE': 'Newcastle', 'SR': 'Newcastle', 'DH': 'Newcastle',
      'BS': 'Bristol', 'BA': 'Bristol',
      'CF': 'Cardiff', 'NP': 'Cardiff',
      'EH': 'Edinburgh', 'FK': 'Edinburgh',
      'G': 'Glasgow', 'PA': 'Glasgow',
      'AB': 'Aberdeen', 'DD': 'Aberdeen',
      'BT': 'Belfast',
      'NR': 'Norwich', 'IP': 'Norwich',
      'PL': 'Plymouth', 'TR': 'Plymouth', 'EX': 'Plymouth',
      'S': 'Sheffield', 'DN': 'Sheffield',
      'NG': 'Nottingham', 'DE': 'Nottingham', 'LE': 'Nottingham',
    }
    for (const [k, v] of Object.entries(map)) {
      if (prefix.startsWith(k)) return v
    }
    return 'Birmingham'
  }

  // Recalculate all rooms when design params change
  const recalcRooms = useCallback((d: DesignData) => {
    return {
      ...d,
      rooms: d.rooms.map(r => calcRoom(r, d.design_temp_ext, d.sheltered))
    }
  }, [])

  function updateDesign(updates: Partial<DesignData>) {
    setDesign(prev => {
      const next = { ...prev, ...updates }
      return recalcRooms(next)
    })
  }

  function updateLocation(loc: string) {
    setDesign(prev => recalcRooms({
      ...prev,
      location: loc,
      design_temp_ext: DESIGN_TEMPS[loc]?.temp || -4.0,
    }))
  }

  function updateEra(era: string) {
    const defaults = U_VALUE_DEFAULTS[era] || U_VALUE_DEFAULTS['1976_1990']
    setDesign(prev => recalcRooms({
      ...prev,
      construction_era: era,
      rooms: prev.rooms.map(r => ({
        ...r,
        ext_wall_u: prev.wall_type === 'cavity_uninsulated' ? defaults.ext_wall : WALL_U_OVERRIDES[prev.wall_type] || defaults.ext_wall,
        floor_u: defaults.ground_floor,
        ceiling_u: defaults.roof,
        window_u: WINDOW_U_VALUES[prev.window_type] || defaults.window,
        door_u: defaults.door,
      }))
    }))
  }

  function addRoom() {
    const id = Date.now().toString()
    const defaults = U_VALUE_DEFAULTS[design.construction_era] || U_VALUE_DEFAULTS['1976_1990']
    const newRoom: Room = {
      ...defaultRoom(id),
      name: `Room ${design.rooms.length + 1}`,
      ext_wall_u: WALL_U_OVERRIDES[design.wall_type] || defaults.ext_wall,
      window_u: WINDOW_U_VALUES[design.window_type] || defaults.window,
      floor_u: defaults.ground_floor,
      ceiling_u: defaults.roof,
      door_u: defaults.door,
      floor_adj: design.rooms.filter(r => r.floor === 0).length > 0 ? 'heated' : 'ground',
    }
    const calculated = calcRoom(newRoom, design.design_temp_ext, design.sheltered)
    setDesign(prev => ({ ...prev, rooms: [...prev.rooms, calculated] }))
    setEditingRoom(id)
  }

  function updateRoom(id: string, updates: Partial<Room>) {
    setDesign(prev => ({
      ...prev,
      rooms: prev.rooms.map(r => {
        if (r.id !== id) return r
        const updated = { ...r, ...updates }
        return calcRoom(updated, prev.design_temp_ext, prev.sheltered)
      })
    }))
  }

  function removeRoom(id: string) {
    setDesign(prev => ({ ...prev, rooms: prev.rooms.filter(r => r.id !== id) }))
    if (editingRoom === id) setEditingRoom(null)
  }

  // ─── Totals ──────────────────────────────────────────────────────────────────
  const totalHeatLossW = design.rooms.reduce((sum, r) => sum + r.total_loss, 0)
  const totalFabricW = design.rooms.reduce((sum, r) => sum + r.fabric_loss, 0)
  const totalVentW = design.rooms.reduce((sum, r) => sum + r.ventilation_loss, 0)
  const specificHeatLoss = design.total_floor_area > 0 ? Math.round(totalHeatLossW / design.total_floor_area) : 0
  const recommendedKw = Math.ceil(totalHeatLossW / 1000)
  const designDeltaT = 21 - design.design_temp_ext
  const annualHeatKwh = calcAnnualHeatDemand(totalHeatLossW, designDeltaT)
  const { spf, stars, warning: spfWarning } = getSPF(specificHeatLoss, design.emitter_type, design.flow_temp)
  const annualElecSpace = Math.round(annualHeatKwh / spf)
  const annualElecDHW = Math.round(45 * design.num_bedrooms * 365 * 4.18 * 0.001 / 1.7 * 10) * 100 // kWh
  const annualElecTotal = annualElecSpace + annualElecDHW
  const cylinderSize = calcCylinderSize(design.num_bedrooms)

  // Noise
  const noiseLevel = calcNoise(
    design.hp_sound_power_db,
    design.noise_distance_m,
    design.noise_reflective_surfaces,
    design.noise_has_barrier,
    design.noise_barrier_attenuation
  )
  const noiseCompliant = noiseLevel <= 37

  async function saveDesign() {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const designPayload = {
      job_id: jobId,
      design_inputs: design,
      total_heat_loss_w: totalHeatLossW,
      specific_heat_loss_w_m2: specificHeatLoss,
      recommended_hp_kw: recommendedKw,
      flow_temp_c: design.flow_temp,
      emitter_type: design.emitter_type,
      spf_estimate: spf,
      star_rating: stars,
      annual_heat_demand_kwh: annualHeatKwh,
      annual_elec_space_kwh: annualElecSpace,
      annual_elec_dhw_kwh: annualElecDHW,
      cylinder_size_litres: cylinderSize,
      noise_level_db: noiseLevel,
      noise_compliant: noiseCompliant,
      mcs_031_compliant: true,
      designed_by: session.user.id,
      designed_at: new Date().toISOString(),
    }

    const { data: existing } = await (supabase as any)
      .from('system_designs').select('id').eq('job_id', jobId).single()

    if (existing) {
      await (supabase as any).from('system_designs').update(designPayload).eq('job_id', jobId)
    } else {
      await (supabase as any).from('system_designs').insert(designPayload)
    }

    await (supabase as any).from('audit_log').insert({
      job_id: jobId,
      user_id: session.user.id,
      action: 'design_saved',
      stage: 'design',
      entity_type: 'system_design',
      description: `System design saved: ${recommendedKw}kW ASHP, flow temp ${design.flow_temp}°C, SPF ${spf}, ${stars}★`,
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // ─── Input styling ─────────────────────────────────────────────────────────
  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const sel = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const label = "block text-xs font-medium text-gray-500 mb-1"

  const sections = [
    { key: 'property', label: 'Property' },
    { key: 'rooms', label: `Rooms (${design.rooms.length})` },
    { key: 'system', label: 'System' },
    { key: 'performance', label: 'Performance' },
    { key: 'noise', label: 'Noise check' },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z" /></svg>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">Design tool</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.postcode}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">← Back to job</a>
          <button
            onClick={saveDesign}
            disabled={saving}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save design'}
          </button>
        </div>
      </div>

      {/* MCS compliance banner */}
      <div className="bg-emerald-700 text-white px-6 py-2 flex items-center gap-6 text-xs">
        <span className="font-medium">MCS Compliance</span>
        <span>MIS 3005-D ✓</span>
        <span>MCS 031 Issue 4.0 ✓</span>
        <span>BS EN 12831-1:2017 ✓</span>
        <span>MCS 020(a) ✓</span>
        <span className="ml-auto">Design temp: {design.design_temp_ext}°C ({DESIGN_TEMPS[design.location]?.label})</span>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-6">

          {/* Left nav */}
          <div className="w-44 flex-shrink-0">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
              {sections.map(s => (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`w-full text-left px-4 py-3 text-xs font-medium border-b border-gray-50 last:border-0 transition-colors ${activeSection === s.key ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Summary card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="text-xs font-medium text-gray-600">Summary</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Heat loss</span>
                  <span className="font-semibold text-gray-900">{(totalHeatLossW / 1000).toFixed(1)} kW</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Recommended</span>
                  <span className="font-semibold text-emerald-700">{recommendedKw} kW</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Specific loss</span>
                  <span className="font-semibold">{specificHeatLoss} W/m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">SPF</span>
                  <span className="font-semibold">{spf}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Star rating</span>
                  <span className="font-semibold">{'★'.repeat(stars)}{'☆'.repeat(6 - stars)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Flow temp</span>
                  <span className="font-semibold">{design.flow_temp}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Noise</span>
                  <span className={`font-semibold ${noiseCompliant ? 'text-emerald-700' : 'text-red-600'}`}>
                    {noiseLevel} dB {noiseCompliant ? '✓' : '✗'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">

            {/* ─── PROPERTY SECTION ─────────────────────────────────────────── */}
            {activeSection === 'property' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-4">Property details</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={label}>Location (design temperature)</label>
                      <select className={sel} value={design.location} onChange={e => updateLocation(e.target.value)}>
                        {Object.entries(DESIGN_TEMPS).map(([k, v]) => (
                          <option key={k} value={k}>{v.label} ({v.temp}°C)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Property type</label>
                      <select className={sel} value={design.property_type} onChange={e => updateDesign({ property_type: e.target.value })}>
                        <option value="detached">Detached</option>
                        <option value="semi_detached">Semi-detached</option>
                        <option value="terraced">Mid-terraced</option>
                        <option value="end_terrace">End-terraced</option>
                        <option value="flat">Flat / apartment</option>
                        <option value="bungalow">Bungalow</option>
                      </select>
                    </div>
                    <div>
                      <label className={label}>Construction era</label>
                      <select className={sel} value={design.construction_era} onChange={e => updateEra(e.target.value)}>
                        <option value="pre_1920">Pre-1920</option>
                        <option value="1920_1945">1920–1945</option>
                        <option value="1945_1965">1945–1965</option>
                        <option value="1965_1975">1965–1975</option>
                        <option value="1976_1990">1976–1990</option>
                        <option value="1991_2002">1991–2002</option>
                        <option value="2003_2011">2003–2011</option>
                        <option value="2012_present">2012–present</option>
                      </select>
                    </div>
                    <div>
                      <label className={label}>Total floor area (m²)</label>
                      <input type="number" className={inp} value={design.total_floor_area} onChange={e => updateDesign({ total_floor_area: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className={label}>Number of bedrooms</label>
                      <input type="number" className={inp} value={design.num_bedrooms} min={1} max={8} onChange={e => updateDesign({ num_bedrooms: parseInt(e.target.value) || 3 })} />
                    </div>
                    <div>
                      <label className={label}>Number of storeys</label>
                      <input type="number" className={inp} value={design.storeys} min={1} max={4} onChange={e => updateDesign({ storeys: parseInt(e.target.value) || 2 })} />
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-4">Fabric construction</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={label}>Wall type / insulation</label>
                      <select className={sel} value={design.wall_type} onChange={e => {
                        const u = WALL_U_OVERRIDES[e.target.value]
                        updateDesign({
                          wall_type: e.target.value,
                          rooms: design.rooms.map(r => ({ ...r, ext_wall_u: u || r.ext_wall_u }))
                        })
                      }}>
                        <option value="solid_uninsulated">Solid brick/stone — uninsulated (1.7)</option>
                        <option value="solid_ext_insulation">Solid — external insulation (0.28)</option>
                        <option value="solid_int_insulation">Solid — internal insulation (0.30)</option>
                        <option value="cavity_uninsulated">Cavity — uninsulated (1.0)</option>
                        <option value="cavity_partial_fill">Cavity — partial fill (0.60)</option>
                        <option value="cavity_full_fill">Cavity — full fill (0.32)</option>
                        <option value="cavity_ext_insulation">Cavity — external insulation (0.18)</option>
                        <option value="timber_frame_insulated">Timber frame — insulated (0.25)</option>
                      </select>
                      <div className="text-xs text-gray-400 mt-1">U-value: {WALL_U_OVERRIDES[design.wall_type]} W/m²K</div>
                    </div>
                    <div>
                      <label className={label}>Roof type / insulation</label>
                      <select className={sel} value={design.roof_type} onChange={e => {
                        const u = ROOF_U_OVERRIDES[e.target.value]
                        updateDesign({
                          roof_type: e.target.value,
                          rooms: design.rooms.map(r => ({ ...r, ceiling_u: r.ceiling_adj === 'roof' ? (u || r.ceiling_u) : r.ceiling_u }))
                        })
                      }}>
                        <option value="flat_no_insulation">Flat — uninsulated (2.0)</option>
                        <option value="pitched_no_insulation">Pitched — no insulation (2.0)</option>
                        <option value="pitched_25mm">Pitched — 25mm (0.68)</option>
                        <option value="pitched_50mm">Pitched — 50mm (0.41)</option>
                        <option value="pitched_100mm">Pitched — 100mm (0.25)</option>
                        <option value="pitched_150mm">Pitched — 150mm (0.16)</option>
                        <option value="pitched_200mm">Pitched — 200mm (0.13)</option>
                        <option value="pitched_250mm_plus">Pitched — 250mm+ (0.11)</option>
                      </select>
                      <div className="text-xs text-gray-400 mt-1">U-value: {ROOF_U_OVERRIDES[design.roof_type]} W/m²K</div>
                    </div>
                    <div>
                      <label className={label}>Window glazing type</label>
                      <select className={sel} value={design.window_type} onChange={e => {
                        const u = WINDOW_U_VALUES[e.target.value]
                        updateDesign({
                          window_type: e.target.value,
                          rooms: design.rooms.map(r => ({ ...r, window_u: u || r.window_u }))
                        })
                      }}>
                        <option value="single">Single glazed (4.8)</option>
                        <option value="secondary">Secondary glazed (2.4)</option>
                        <option value="double_pre2002">Double glazed pre-2002 (2.8)</option>
                        <option value="double_post2002">Double glazed post-2002 (2.0)</option>
                        <option value="double_low_e">Double glazed low-E (1.4)</option>
                        <option value="triple">Triple glazed (0.8)</option>
                      </select>
                      <div className="text-xs text-gray-400 mt-1">U-value: {WINDOW_U_VALUES[design.window_type]} W/m²K</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-4">Ventilation (BS EN 12831-1:2017)</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={label}>Building sheltering</label>
                      <select className={sel} value={design.sheltered} onChange={e => updateDesign({ sheltered: e.target.value })}>
                        <option value="very_sheltered">Very sheltered (urban, enclosed)</option>
                        <option value="sheltered">Sheltered (suburban)</option>
                        <option value="normal">Normal</option>
                        <option value="exposed">Exposed (rural, elevated)</option>
                      </select>
                    </div>
                    <div>
                      <label className={label}>Air tightness</label>
                      <select className={sel} value={design.air_tightness_measured ? 'measured' : 'standard'} onChange={e => updateDesign({ air_tightness_measured: e.target.value === 'measured' })}>
                        <option value="standard">Standard method (assumed)</option>
                        <option value="measured">Measured air permeability test</option>
                      </select>
                    </div>
                    {design.air_tightness_measured && (
                      <div>
                        <label className={label}>Air permeability result (m³/h·m²)</label>
                        <input type="number" className={inp} value={design.air_tightness_value} step={0.5} onChange={e => updateDesign({ air_tightness_value: parseFloat(e.target.value) || 5.0 })} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── ROOMS SECTION ────────────────────────────────────────────── */}
            {activeSection === 'rooms' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">Room-by-room heat loss</div>
                    <div className="text-xs text-gray-400 mt-0.5">BS EN 12831-1:2017 · Internal design temps per MIS 3005-D Table 1</div>
                  </div>
                  <button onClick={addRoom} className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
                    + Add room
                  </button>
                </div>

                {design.rooms.length === 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                    <div className="text-sm text-gray-400 mb-3">No rooms added yet</div>
                    <button onClick={addRoom} className="text-xs text-emerald-700 hover:underline">Add your first room →</button>
                  </div>
                )}

                {design.rooms.map(room => (
                  <div key={room.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    {/* Room header */}
                    <div
                      className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setEditingRoom(editingRoom === room.id ? null : room.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-sm font-medium text-gray-900">{room.name || room.type}</div>
                        <div className="text-xs text-gray-400">{room.type} · Floor {room.floor}</div>
                        <div className="text-xs text-gray-500">{room.length}×{room.width}×{room.height}m</div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Fabric</div>
                          <div className="text-xs font-medium">{room.fabric_loss} W</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Vent</div>
                          <div className="text-xs font-medium">{room.ventilation_loss} W</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Total</div>
                          <div className="text-sm font-semibold text-emerald-700">{room.total_loss} W</div>
                        </div>
                        <div className="text-xs text-gray-400">
                          {ROOM_DESIGN_TEMPS[room.type] || 21}°C
                        </div>
                        <button onClick={e => { e.stopPropagation(); removeRoom(room.id) }} className="text-xs text-red-400 hover:text-red-600 ml-2">✕</button>
                      </div>
                    </div>

                    {/* Room editor */}
                    {editingRoom === room.id && (
                      <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                        <div className="grid grid-cols-4 gap-3 mb-4">
                          <div>
                            <label className={label}>Room name</label>
                            <input type="text" className={inp} value={room.name} placeholder={room.type} onChange={e => updateRoom(room.id, { name: e.target.value })} />
                          </div>
                          <div>
                            <label className={label}>Room type</label>
                            <select className={sel} value={room.type} onChange={e => updateRoom(room.id, { type: e.target.value })}>
                              {Object.keys(ROOM_DESIGN_TEMPS).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={label}>Floor level</label>
                            <select className={sel} value={room.floor} onChange={e => updateRoom(room.id, { floor: parseInt(e.target.value) })}>
                              <option value={0}>Ground floor</option>
                              <option value={1}>First floor</option>
                              <option value={2}>Second floor</option>
                              <option value={3}>Loft</option>
                            </select>
                          </div>
                          <div />
                        </div>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div>
                            <label className={label}>Length (m)</label>
                            <input type="number" className={inp} value={room.length} step={0.1} onChange={e => updateRoom(room.id, { length: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div>
                            <label className={label}>Width (m)</label>
                            <input type="number" className={inp} value={room.width} step={0.1} onChange={e => updateRoom(room.id, { width: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div>
                            <label className={label}>Ceiling height (m)</label>
                            <input type="number" className={inp} value={room.height} step={0.1} onChange={e => updateRoom(room.id, { height: parseFloat(e.target.value) || 0 })} />
                          </div>
                        </div>

                        <div className="text-xs font-medium text-gray-600 mb-2">Fabric elements</div>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div>
                            <label className={label}>Exposed wall area (m²)</label>
                            <input type="number" className={inp} value={room.ext_wall_area} step={0.5} onChange={e => updateRoom(room.id, { ext_wall_area: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div>
                            <label className={label}>Wall U-value (W/m²K)</label>
                            <input type="number" className={inp} value={room.ext_wall_u} step={0.01} onChange={e => updateRoom(room.id, { ext_wall_u: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div />
                          <div>
                            <label className={label}>Window area (m²)</label>
                            <input type="number" className={inp} value={room.window_area} step={0.1} onChange={e => updateRoom(room.id, { window_area: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div>
                            <label className={label}>Window U-value (W/m²K)</label>
                            <input type="number" className={inp} value={room.window_u} step={0.1} onChange={e => updateRoom(room.id, { window_u: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div />
                          <div>
                            <label className={label}>Door area (m²)</label>
                            <input type="number" className={inp} value={room.door_area} step={0.1} onChange={e => updateRoom(room.id, { door_area: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div>
                            <label className={label}>Door U-value (W/m²K)</label>
                            <input type="number" className={inp} value={room.door_u} step={0.1} onChange={e => updateRoom(room.id, { door_u: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div />
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-4">
                          <div>
                            <div className="text-xs font-medium text-gray-600 mb-2">Floor</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={label}>Exposed floor area (m²)</label>
                                <input type="number" className={inp} value={room.floor_area_exposed} step={0.5} onChange={e => updateRoom(room.id, { floor_area_exposed: parseFloat(e.target.value) || 0 })} />
                              </div>
                              <div>
                                <label className={label}>Floor U-value</label>
                                <input type="number" className={inp} value={room.floor_u} step={0.01} onChange={e => updateRoom(room.id, { floor_u: parseFloat(e.target.value) || 0 })} />
                              </div>
                              <div className="col-span-2">
                                <label className={label}>Floor below</label>
                                <select className={sel} value={room.floor_adj} onChange={e => updateRoom(room.id, { floor_adj: e.target.value })}>
                                  <option value="ground">Ground (10°C)</option>
                                  <option value="heated">Heated space</option>
                                  <option value="unheated">Unheated space</option>
                                  <option value="outside">Outside</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-600 mb-2">Ceiling</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={label}>Exposed ceiling area (m²)</label>
                                <input type="number" className={inp} value={room.ceiling_area_exposed} step={0.5} onChange={e => updateRoom(room.id, { ceiling_area_exposed: parseFloat(e.target.value) || 0 })} />
                              </div>
                              <div>
                                <label className={label}>Ceiling U-value</label>
                                <input type="number" className={inp} value={room.ceiling_u} step={0.01} onChange={e => updateRoom(room.id, { ceiling_u: parseFloat(e.target.value) || 0 })} />
                              </div>
                              <div className="col-span-2">
                                <label className={label}>Above ceiling</label>
                                <select className={sel} value={room.ceiling_adj} onChange={e => updateRoom(room.id, { ceiling_adj: e.target.value })}>
                                  <option value="heated">Heated space</option>
                                  <option value="roof">Roof / loft (outside temp)</option>
                                  <option value="unheated">Unheated loft</option>
                                  <option value="outside">Outside</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Room result */}
                        <div className="bg-white border border-emerald-200 rounded-lg p-3 grid grid-cols-4 gap-3 text-xs">
                          <div>
                            <div className="text-gray-400">Design temp</div>
                            <div className="font-semibold">{ROOM_DESIGN_TEMPS[room.type] || 21}°C</div>
                          </div>
                          <div>
                            <div className="text-gray-400">Fabric loss</div>
                            <div className="font-semibold">{room.fabric_loss} W</div>
                          </div>
                          <div>
                            <div className="text-gray-400">Ventilation loss</div>
                            <div className="font-semibold">{room.ventilation_loss} W</div>
                          </div>
                          <div>
                            <div className="text-gray-400">Total room loss</div>
                            <div className="text-base font-bold text-emerald-700">{room.total_loss} W</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Totals */}
                {design.rooms.length > 0 && (
                  <div className="bg-emerald-700 text-white rounded-xl p-5">
                    <div className="text-sm font-medium mb-3">Building totals</div>
                    <div className="grid grid-cols-5 gap-4 text-sm">
                      <div>
                        <div className="text-emerald-200 text-xs mb-1">Fabric loss</div>
                        <div className="font-semibold">{(totalFabricW / 1000).toFixed(2)} kW</div>
                      </div>
                      <div>
                        <div className="text-emerald-200 text-xs mb-1">Ventilation loss</div>
                        <div className="font-semibold">{(totalVentW / 1000).toFixed(2)} kW</div>
                      </div>
                      <div>
                        <div className="text-emerald-200 text-xs mb-1">Total heat loss</div>
                        <div className="text-xl font-bold">{(totalHeatLossW / 1000).toFixed(2)} kW</div>
                      </div>
                      <div>
                        <div className="text-emerald-200 text-xs mb-1">Specific loss</div>
                        <div className="font-semibold">{specificHeatLoss} W/m²</div>
                      </div>
                      <div>
                        <div className="text-emerald-200 text-xs mb-1">Recommended ASHP</div>
                        <div className="text-xl font-bold">{recommendedKw} kW</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── SYSTEM SECTION ───────────────────────────────────────────── */}
            {activeSection === 'system' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-4">Heat emitter specification</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={label}>Emitter type</label>
                      <select className={sel} value={design.emitter_type} onChange={e => updateDesign({ emitter_type: e.target.value })}>
                        <option value="ufh">Underfloor heating (UFH) only</option>
                        <option value="radiators">Radiators only</option>
                        <option value="mixed">Mixed — UFH + radiators</option>
                      </select>
                    </div>
                    <div>
                      <label className={label}>Proposed flow temperature (°C)</label>
                      <select className={sel} value={design.flow_temp} onChange={e => updateDesign({ flow_temp: parseInt(e.target.value) })}>
                        {design.emitter_type === 'ufh' ? (
                          <>
                            <option value={35}>35°C (UFH — excellent efficiency)</option>
                            <option value={40}>40°C (UFH — good efficiency)</option>
                            <option value={45}>45°C (UFH — moderate efficiency)</option>
                          </>
                        ) : design.emitter_type === 'radiators' ? (
                          <>
                            <option value={45}>45°C (upgraded radiators — excellent)</option>
                            <option value={50}>50°C (upgraded radiators — good)</option>
                            <option value={55}>55°C (existing radiators — moderate)</option>
                            <option value={60}>60°C (existing radiators — poor efficiency)</option>
                          </>
                        ) : (
                          <>
                            <option value={45}>45°C (mixed — excellent)</option>
                            <option value={50}>50°C (mixed — good)</option>
                            <option value={55}>55°C (mixed — moderate)</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-2">MCS 031 Issue 4.0 — SPF estimate</div>
                      <div className="text-2xl font-bold text-gray-900">{spf}</div>
                      <div className="text-xs text-gray-500 mt-1">{'★'.repeat(stars)}{'☆'.repeat(6 - stars)} ({stars}/6 stars)</div>
                      {spfWarning && <div className="text-xs text-amber-700 mt-2 bg-amber-50 rounded px-2 py-1">{spfWarning}</div>}
                    </div>
                  </div>
                  {design.emitter_type === 'radiators' && design.flow_temp >= 55 && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                      <div className="text-xs font-medium text-amber-900">Radiator sizing check required</div>
                      <div className="text-xs text-amber-700 mt-0.5">MCS 021 Heat Emitter Guide requires existing radiators to be checked for output at the proposed flow temperature. Document the check in the design record.</div>
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-4">Heat pump specification</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={label}>Heat pump model</label>
                      <input type="text" className={inp} value={design.hp_model} placeholder="e.g. Mitsubishi Ecodan 8.5kW" onChange={e => updateDesign({ hp_model: e.target.value })} />
                    </div>
                    <div>
                      <label className={label}>Rated output at A7/W{design.flow_temp} (kW)</label>
                      <input type="number" className={inp} value={design.hp_output_kw} step={0.5} onChange={e => updateDesign({ hp_output_kw: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className={`rounded-lg p-3 ${design.hp_output_kw > 0 && design.hp_output_kw >= recommendedKw ? 'bg-emerald-50 border border-emerald-200' : design.hp_output_kw > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                      <div className="text-xs text-gray-500 mb-1">Sizing check</div>
                      {design.hp_output_kw > 0 ? (
                        <>
                          <div className={`text-sm font-semibold ${design.hp_output_kw >= recommendedKw ? 'text-emerald-700' : 'text-red-700'}`}>
                            {design.hp_output_kw >= recommendedKw ? '✓ Adequate' : '✗ Undersized'}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {design.hp_output_kw}kW rated vs {recommendedKw}kW required
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-400">Enter HP output to check</div>
                      )}
                    </div>
                    <div>
                      <label className={label}>Sound power level (dBA)</label>
                      <input type="number" className={inp} value={design.hp_sound_power_db} step={0.5} onChange={e => updateDesign({ hp_sound_power_db: parseFloat(e.target.value) || 63 })} />
                      <div className="text-xs text-gray-400 mt-1">From MCS product directory</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-4">Hot water cylinder</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={label}>Cylinder type</label>
                      <select className={sel} value={design.cylinder_type} onChange={e => updateDesign({ cylinder_type: e.target.value })}>
                        <option value="indirect">Indirect (heat pump coil)</option>
                        <option value="direct">Direct (immersion only)</option>
                        <option value="thermal_store">Thermal store</option>
                        <option value="combi_buffer">Combi heat pump + buffer</option>
                      </select>
                    </div>
                    <div>
                      <label className={label}>Cylinder size (litres)</label>
                      <input type="number" className={inp} value={design.cylinder_size_litres} step={25} onChange={e => updateDesign({ cylinder_size_litres: parseInt(e.target.value) || 200 })} />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">MIS 3005-D recommended minimum</div>
                      <div className="text-sm font-semibold text-gray-900">{cylinderSize} litres</div>
                      <div className="text-xs text-gray-400 mt-0.5">For {design.num_bedrooms} bedrooms</div>
                      {design.cylinder_size_litres < cylinderSize && (
                        <div className="text-xs text-red-600 mt-1">⚠ Below recommended minimum</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── PERFORMANCE SECTION (MCS 031) ───────────────────────────── */}
            {activeSection === 'performance' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">MCS 031 Issue 4.0 — System performance estimate</div>
                      <div className="text-xs text-gray-400 mt-0.5">Mandatory from 18 March 2025 · Must be provided to customer before contract</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400 mb-1">Star rating</div>
                      <div className="text-2xl">{'★'.repeat(stars)}{'☆'.repeat(6 - stars)}</div>
                      <div className="text-xs text-gray-500">{stars}/6 stars</div>
                    </div>
                  </div>

                  {/* Specific heat loss band */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-4">
                    <div className="text-xs font-medium text-gray-600 mb-3">Step 1 — Specific heat loss</div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-gray-400">Total heat loss</div>
                        <div className="font-semibold">{(totalHeatLossW / 1000).toFixed(2)} kW</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Floor area</div>
                        <div className="font-semibold">{design.total_floor_area} m²</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Specific heat loss</div>
                        <div className="text-xl font-bold text-emerald-700">{specificHeatLoss} W/m²</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      Band: {specificHeatLoss <= 30 ? 'Very low (≤30)' : specificHeatLoss <= 60 ? 'Low–medium (31–60)' : specificHeatLoss <= 100 ? 'Medium–high (61–100)' : 'High (>100)'} W/m² ·
                      Note: 0–30 W/m² very efficient · 120–150 W/m² very high heat loss
                    </div>
                  </div>

                  {/* SPF lookup */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-4">
                    <div className="text-xs font-medium text-gray-600 mb-3">Step 2 — SPF from Table 2 (Heat Emitter Guide)</div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-gray-400">Emitter type</div>
                        <div className="font-semibold capitalize">{design.emitter_type.replace('_', ' ')}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Flow temperature</div>
                        <div className="font-semibold">{design.flow_temp}°C</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Estimated SPF</div>
                        <div className="text-xl font-bold text-emerald-700">{spf}</div>
                      </div>
                    </div>
                    {spfWarning && (
                      <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">⚠ {spfWarning}</div>
                    )}
                  </div>

                  {/* Energy estimates */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="text-xs font-medium text-emerald-800 mb-3">Step 3 — Annual energy estimates (MCS 031 output)</div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Annual heat demand (space)</span>
                          <span className="font-semibold">{annualHeatKwh.toLocaleString()} kWh</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">SPF (space heating)</span>
                          <span className="font-semibold">{spf}</span>
                        </div>
                        <div className="flex justify-between border-t border-emerald-200 pt-2">
                          <span className="text-gray-600">Annual electricity (space)</span>
                          <span className="font-semibold">{annualElecSpace.toLocaleString()} kWh</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">SPF (hot water) — SAP 10.2</span>
                          <span className="font-semibold">1.70</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Annual electricity (DHW)</span>
                          <span className="font-semibold">{annualElecDHW.toLocaleString()} kWh</span>
                        </div>
                        <div className="flex justify-between border-t border-emerald-200 pt-2 font-semibold text-emerald-800">
                          <span>Total annual electricity</span>
                          <span>{annualElecTotal.toLocaleString()} kWh</span>
                        </div>
                      </div>
                      <div className="space-y-3 text-sm">
                        <div className="text-xs font-medium text-gray-600 mb-2">MCS 031 mandatory disclosure text</div>
                        <div className="bg-white rounded-lg p-3 text-xs text-gray-600 leading-relaxed border border-emerald-200">
                          <p className="mb-2">This is not a detailed system design. It offers a reasonable estimate of likely performance and a description of the likely design. Details may change after the heat loss survey.</p>
                          <p className="mb-2">The estimated annual electricity consumption is: <strong>{annualElecTotal.toLocaleString()} kWh/year</strong> (range: {Math.round(annualElecTotal * 0.9).toLocaleString()}–{Math.round(annualElecTotal * 1.1).toLocaleString()} kWh/year).</p>
                          <p>System performance may vary due to climate, occupancy, controls settings and installation quality.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── NOISE SECTION (MCS 020a) ─────────────────────────────────── */}
            {activeSection === 'noise' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-1">MCS 020(a) — Noise assessment</div>
                  <div className="text-xs text-gray-400 mb-4">Mandatory for permitted development installations in England from 20 September 2025. Pass threshold: ≤37 dB at assessment position.</div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className={label}>Heat pump sound power level (dBA)</label>
                        <input type="number" className={inp} value={design.hp_sound_power_db} step={0.5} onChange={e => updateDesign({ hp_sound_power_db: parseFloat(e.target.value) || 63 })} />
                        <div className="text-xs text-gray-400 mt-1">Available from MCS Product Directory for your chosen heat pump model</div>
                      </div>
                      <div>
                        <label className={label}>Assessment position description</label>
                        <input type="text" className={inp} value={design.noise_assessment_location} onChange={e => updateDesign({ noise_assessment_location: e.target.value })} placeholder="e.g. Nearest neighbour window" />
                      </div>
                      <div>
                        <label className={label}>Distance to assessment position (m)</label>
                        <input type="number" className={inp} value={design.noise_distance_m} step={0.5} min={1} onChange={e => updateDesign({ noise_distance_m: parseFloat(e.target.value) || 1 })} />
                      </div>
                      <div>
                        <label className={label}>Number of reflective surfaces (walls/fences near HP)</label>
                        <select className={sel} value={design.noise_reflective_surfaces} onChange={e => updateDesign({ noise_reflective_surfaces: parseInt(e.target.value) })}>
                          <option value={0}>0 — Free field</option>
                          <option value={1}>1 — One wall/fence</option>
                          <option value={2}>2 — Two walls/fences (corner)</option>
                          <option value={3}>3 — Three surfaces</option>
                        </select>
                      </div>
                      <div>
                        <label className={label}>Acoustic barrier present?</label>
                        <select className={sel} value={design.noise_has_barrier ? 'yes' : 'no'} onChange={e => updateDesign({ noise_has_barrier: e.target.value === 'yes' })}>
                          <option value="no">No barrier</option>
                          <option value="yes">Yes — barrier present</option>
                        </select>
                      </div>
                      {design.noise_has_barrier && (
                        <div>
                          <label className={label}>Barrier attenuation (dB)</label>
                          <input type="number" className={inp} value={design.noise_barrier_attenuation} step={0.5} onChange={e => updateDesign({ noise_barrier_attenuation: parseFloat(e.target.value) || 0 })} />
                        </div>
                      )}
                    </div>

                    <div>
                      <div className={`rounded-xl p-6 border-2 text-center ${noiseCompliant ? 'bg-emerald-50 border-emerald-400' : 'bg-red-50 border-red-400'}`}>
                        <div className={`text-xs font-medium mb-2 ${noiseCompliant ? 'text-emerald-700' : 'text-red-700'}`}>
                          MCS 020(a) result
                        </div>
                        <div className={`text-5xl font-bold mb-2 ${noiseCompliant ? 'text-emerald-700' : 'text-red-700'}`}>
                          {noiseLevel} dB
                        </div>
                        <div className={`text-sm font-semibold mb-3 ${noiseCompliant ? 'text-emerald-700' : 'text-red-700'}`}>
                          {noiseCompliant ? '✓ COMPLIANT' : '✗ NON-COMPLIANT'}
                        </div>
                        <div className="text-xs text-gray-500">Limit: 37 dB</div>
                        {!noiseCompliant && (
                          <div className="mt-3 text-xs text-red-700 bg-red-100 rounded-lg px-3 py-2">
                            Consider: increasing distance, adding acoustic barrier, selecting quieter model, or repositioning unit.
                          </div>
                        )}
                      </div>

                      <div className="mt-4 bg-gray-50 rounded-xl p-4 text-xs space-y-2">
                        <div className="font-medium text-gray-700">Calculation (MCS 020a)</div>
                        <div className="text-gray-500">Lp = Lw − 20·log₁₀(r) − 8 + D + R − B</div>
                        <div className="space-y-1 text-gray-600">
                          <div className="flex justify-between"><span>Lw (sound power)</span><span>{design.hp_sound_power_db} dB</span></div>
                          <div className="flex justify-between"><span>Distance correction</span><span>−{(20 * Math.log10(design.noise_distance_m)).toFixed(1)} dB</span></div>
                          <div className="flex justify-between"><span>Free field correction</span><span>−8 dB</span></div>
                          <div className="flex justify-between"><span>Ground reflection (D)</span><span>+3 dB</span></div>
                          <div className="flex justify-between"><span>Reflective surfaces (R)</span><span>+{design.noise_reflective_surfaces * 3} dB</span></div>
                          <div className="flex justify-between"><span>Barrier attenuation (B)</span><span>−{design.noise_has_barrier ? design.noise_barrier_attenuation : 0} dB</span></div>
                          <div className="flex justify-between font-semibold border-t border-gray-200 pt-1 mt-1">
                            <span>Calculated level</span><span>{noiseLevel} dB</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}