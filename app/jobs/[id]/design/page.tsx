'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ULTRAHEAT_RADIATORS, radOutput, type Radiator } from '@/lib/radiators'

// ─── CIBSE Design Temperatures ───────────────────────────────────────────────
const DESIGN_TEMPS: Record<string, { temp: number; label: string }> = {
  'London':     { temp: -3.0, label: 'London / SE England' },
  'Birmingham': { temp: -4.0, label: 'Birmingham / Midlands' },
  'Manchester': { temp: -4.0, label: 'Manchester / NW England' },
  'Leeds':      { temp: -4.0, label: 'Leeds / Yorkshire' },
  'Newcastle':  { temp: -5.0, label: 'Newcastle / NE England' },
  'Bristol':    { temp: -3.0, label: 'Bristol / SW England' },
  'Cardiff':    { temp: -3.0, label: 'Cardiff / Wales' },
  'Edinburgh':  { temp: -6.0, label: 'Edinburgh / Scotland' },
  'Glasgow':    { temp: -5.0, label: 'Glasgow / W Scotland' },
  'Aberdeen':   { temp: -7.0, label: 'Aberdeen / N Scotland' },
  'Belfast':    { temp: -3.0, label: 'Belfast / N Ireland' },
  'Norwich':    { temp: -4.0, label: 'Norwich / East Anglia' },
  'Plymouth':   { temp: -2.0, label: 'Plymouth / Cornwall' },
  'Sheffield':  { temp: -4.0, label: 'Sheffield / S Yorkshire' },
  'Nottingham': { temp: -4.0, label: 'Nottingham / E Midlands' },
}

// ─── MIS 3005-D Table 1 room temps ───────────────────────────────────────────
const ROOM_TEMPS: Record<string, number> = {
  'Living room': 21, 'Dining room': 21, 'Kitchen': 18, 'Bedroom': 18,
  'Bathroom': 22, 'En-suite': 22, 'Hall / Landing': 18, 'Study': 21,
  'Utility room': 16, 'WC': 18, 'Conservatory': 21, 'Garage': 10, 'Other': 18,
}

// ─── CIBSE ACH Table 3.8 ─────────────────────────────────────────────────────
const ROOM_ACH: Record<string, number> = {
  'Living room': 1.5, 'Dining room': 1.5, 'Kitchen': 2.0, 'Bedroom': 1.0,
  'Bathroom': 2.0, 'En-suite': 2.0, 'Hall / Landing': 1.5, 'Study': 1.5,
  'Utility room': 2.0, 'WC': 2.0, 'Conservatory': 1.5, 'Garage': 0.5, 'Other': 1.5,
}

// ─── Wall layer R-values ──────────────────────────────────────────────────────
const WALL_LAYERS: Record<string, { label: string; r: number }> = {
  'brick_102':         { label: 'Brick (102mm)',                    r: 0.12 },
  'brick_215':         { label: 'Brick (215mm)',                    r: 0.24 },
  'stone_300':         { label: 'Stone (300mm)',                    r: 0.20 },
  'stone_450':         { label: 'Stone (450mm)',                    r: 0.30 },
  'block_100_dense':   { label: 'Dense block (100mm)',              r: 0.08 },
  'block_100_light':   { label: 'Lightweight block (100mm)',        r: 0.25 },
  'cavity_air_50':     { label: 'Unventilated air cavity (50mm)',   r: 0.18 },
  'cavity_air_100':    { label: 'Unventilated air cavity (100mm)',  r: 0.18 },
  'insul_mineral_25':  { label: 'Mineral wool (25mm)',              r: 0.63 },
  'insul_mineral_50':  { label: 'Mineral wool (50mm)',              r: 1.25 },
  'insul_mineral_75':  { label: 'Mineral wool (75mm)',              r: 1.88 },
  'insul_mineral_100': { label: 'Mineral wool (100mm)',             r: 2.50 },
  'insul_mineral_150': { label: 'Mineral wool (150mm)',             r: 3.75 },
  'insul_eps_25':      { label: 'EPS board (25mm)',                 r: 0.71 },
  'insul_eps_50':      { label: 'EPS board (50mm)',                 r: 1.43 },
  'insul_eps_75':      { label: 'EPS board (75mm)',                 r: 2.14 },
  'insul_eps_100':     { label: 'EPS board (100mm)',                r: 2.86 },
  'insul_pir_25':      { label: 'PIR board (25mm)',                 r: 1.19 },
  'insul_pir_50':      { label: 'PIR board (50mm)',                 r: 2.38 },
  'insul_pir_75':      { label: 'PIR board (75mm)',                 r: 3.57 },
  'insul_pir_100':     { label: 'PIR board (100mm)',                r: 4.76 },
  'plasterboard_12':   { label: 'Plasterboard (12.5mm)',            r: 0.06 },
  'plaster_13':        { label: 'Plaster (13mm)',                   r: 0.03 },
  'timber_frame_89':   { label: 'Timber studs (89mm)',              r: 0.28 },
  'timber_frame_140':  { label: 'Timber studs (140mm)',             r: 0.44 },
}

const RSI = 0.13
const RSE = 0.04

function calcUFromLayers(layers: string[]): number {
  let totalR = RSI + RSE
  for (const key of layers) {
    totalR += WALL_LAYERS[key]?.r || 0
  }
  return totalR > 0 ? Math.round((1 / totalR) * 1000) / 1000 : 1.0
}

// ─── Wall presets ─────────────────────────────────────────────────────────────
const WALL_PRESETS: Record<string, { label: string; u: number }> = {
  'solid_brick_unins':   { label: 'Solid brick — uninsulated (2.1)',              u: 2.1 },
  'solid_brick_ext_ins': { label: 'Solid brick — external insulation 75mm (0.29)', u: 0.29 },
  'solid_brick_int_ins': { label: 'Solid brick — internal insulation 75mm (0.27)', u: 0.27 },
  'cavity_unins':        { label: 'Cavity wall — uninsulated (1.5)',              u: 1.5 },
  'cavity_full_mineral': { label: 'Cavity wall — full fill mineral wool (0.33)',  u: 0.33 },
  'cavity_partial_pir':  { label: 'Cavity wall — partial fill 50mm PIR (0.25)',   u: 0.25 },
  'timber_frame_ins':    { label: 'Timber frame — 140mm mineral wool (0.22)',     u: 0.22 },
  'modern_new_build':    { label: 'Modern new build post-2012 (0.18)',            u: 0.18 },
  'custom':              { label: 'Custom — enter U-value or build layers',       u: 0 },
}

const WINDOW_PRESETS: Record<string, { label: string; u: number }> = {
  'single':          { label: 'Single glazed (4.8)',          u: 4.8 },
  'secondary':       { label: 'Secondary glazed (2.4)',        u: 2.4 },
  'double_pre2002':  { label: 'Double glazed pre-2002 (2.8)', u: 2.8 },
  'double_post2002': { label: 'Double glazed post-2002 (2.0)', u: 2.0 },
  'double_low_e':    { label: 'Double glazed low-E (1.4)',    u: 1.4 },
  'triple':          { label: 'Triple glazed (0.8)',          u: 0.8 },
  'custom':          { label: 'Custom U-value',               u: 0 },
}

const FLOOR_PRESETS: Record<string, { label: string; u: number }> = {
  'solid_unins':     { label: 'Solid concrete — uninsulated (0.70)',  u: 0.70 },
  'solid_50pir':     { label: 'Solid concrete — 50mm PIR (0.36)',    u: 0.36 },
  'solid_75pir':     { label: 'Solid concrete — 75mm PIR (0.26)',    u: 0.26 },
  'solid_100pir':    { label: 'Solid concrete — 100mm PIR (0.20)',   u: 0.20 },
  'suspended_unins': { label: 'Suspended timber — uninsulated (0.70)', u: 0.70 },
  'suspended_100mw': { label: 'Suspended timber — 100mm mineral (0.28)', u: 0.28 },
  'ufh_screed':      { label: 'UFH screed — insulated (0.18)',       u: 0.18 },
  'custom':          { label: 'Custom U-value',                      u: 0 },
}

const CEILING_PRESETS: Record<string, { label: string; u: number }> = {
  'pitched_no_ins':  { label: 'Pitched — no insulation (2.0)',  u: 2.0 },
  'pitched_100mm':   { label: 'Pitched — 100mm insulation (0.25)', u: 0.25 },
  'pitched_150mm':   { label: 'Pitched — 150mm insulation (0.16)', u: 0.16 },
  'pitched_200mm':   { label: 'Pitched — 200mm insulation (0.13)', u: 0.13 },
  'pitched_250mm':   { label: 'Pitched — 250mm+ insulation (0.11)', u: 0.11 },
  'flat_no_ins':     { label: 'Flat roof — uninsulated (2.0)',   u: 2.0 },
  'flat_insulated':  { label: 'Flat roof — insulated (0.18)',    u: 0.18 },
  'custom':          { label: 'Custom U-value',                  u: 0 },
}

// ─── MCS 031 SPF Table 2 ─────────────────────────────────────────────────────
const MCS031_SPF: number[][] = [
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

function getSPF(shl: number, emitter: string, flowTemp: number): { spf: number; stars: number } {
  const row = MCS031_SPF.find(r => shl <= r[0]) || MCS031_SPF[MCS031_SPF.length - 1]
  let col = 1
  if (emitter === 'ufh') col = flowTemp <= 35 ? 1 : flowTemp <= 40 ? 2 : 3
  else if (emitter === 'radiators') col = flowTemp <= 45 ? 4 : flowTemp <= 50 ? 5 : flowTemp <= 55 ? 6 : 7
  else col = flowTemp <= 45 ? 8 : flowTemp <= 50 ? 9 : 10
  const spf = row[col]
  const stars = spf >= 4.0 ? 6 : spf >= 3.5 ? 5 : spf >= 3.0 ? 4 : spf >= 2.7 ? 3 : spf >= 2.4 ? 2 : 1
  return { spf, stars }
}

function calcNoise(lw: number, dist: number, surfaces: number, hasBarrier: boolean, batten: number): number {
  return Math.round((lw - 20 * Math.log10(dist) - 8 + 3 + surfaces * 3 - (hasBarrier ? batten : 0)) * 10) / 10
}

// ─── Types ────────────────────────────────────────────────────────────────────
type WallWindow = { count: number; width: number; height: number; preset: string; u: number }
type WallDoor   = { count: number; width: number; height: number; u: number }

type WallSegment = {
  id: string
  type: 'external' | 'internal' | 'party' | 'open'
  label: string
  preset: string
  customLayers: string[]
  customU: number
  u_value: number
  length_m: number
  height_m: number
  windows: WallWindow[]
  doors: WallDoor[]
}

type SelectedRadiator = {
  radiator_id: string
  quantity: number
  notes: string
}

type Room = {
  id: string
  name: string
  type: string
  floor: number
  length: number
  width: number
  height: number
  walls: WallSegment[]
  floor_preset: string
  floor_u_custom: number
  floor_adj: string
  ceiling_preset: string
  ceiling_u_custom: number
  ceiling_adj: string
  ceiling_area: number
  floor_area: number
  ach_override: number | null
  selected_radiators: SelectedRadiator[]
  fabric_loss: number
  vent_loss: number
  total_loss: number
}

type Design = {
  location: string
  design_temp_ext: number
  construction_era: string
  property_type: string
  total_floor_area: number
  num_bedrooms: number
  storeys: number
  default_wall_preset: string
  default_window_preset: string
  default_floor_preset: string
  sheltered: string
  rooms: Room[]
  emitter_type: string
  flow_temp: number
  return_temp: number
  hp_model: string
  hp_output_kw: number
  hp_sound_power_db: number
  cylinder_size_litres: number
  cylinder_type: string
  noise_distance_m: number
  noise_reflective_surfaces: number
  noise_has_barrier: boolean
  noise_barrier_attenuation: number
  noise_assessment_location: string
}

// ─── Room calculation ─────────────────────────────────────────────────────────
function calcRoom(room: Room, designTemp: number, sheltered: string): Room {
  const roomTemp = ROOM_TEMPS[room.type] || 21
  const deltaT = roomTemp - designTemp
  const shelterF = sheltered === 'very_sheltered' ? 0.8 : sheltered === 'sheltered' ? 0.9 : sheltered === 'exposed' ? 1.2 : 1.0

  let fabricLoss = 0

  for (const wall of room.walls) {
    if (wall.type !== 'external') continue
    const wallH = wall.height_m > 0 ? wall.height_m : room.height
    let windowArea = 0
    let doorArea = 0
    let windowLoss = 0
    let doorLoss = 0
    for (const w of wall.windows) {
      const area = w.count * w.width * w.height
      windowArea += area
      windowLoss += area * w.u * deltaT
    }
    for (const d of wall.doors) {
      const area = d.count * d.width * d.height
      doorArea += area
      doorLoss += area * d.u * deltaT
    }
    const netWallArea = Math.max(0, wall.length_m * wallH - windowArea - doorArea)
    fabricLoss += netWallArea * wall.u_value * deltaT + windowLoss + doorLoss
  }

  // Floor
  const floorU = room.floor_preset === 'custom' ? room.floor_u_custom : (FLOOR_PRESETS[room.floor_preset]?.u || 0.45)
  const floorArea = room.floor_area > 0 ? room.floor_area : room.length * room.width
  const floorAdjTemp = room.floor_adj === 'ground' ? 10 : room.floor_adj === 'heated' ? roomTemp : room.floor_adj === 'unheated' ? (roomTemp + designTemp) / 2 : designTemp
  fabricLoss += floorArea * floorU * (roomTemp - floorAdjTemp)

  // Ceiling
  const ceilingU = room.ceiling_preset === 'custom' ? room.ceiling_u_custom : (CEILING_PRESETS[room.ceiling_preset]?.u || 0.25)
  const ceilingArea = room.ceiling_area > 0 ? room.ceiling_area : room.length * room.width
  const ceilAdjTemp = room.ceiling_adj === 'roof' ? designTemp : room.ceiling_adj === 'unheated' ? (roomTemp + designTemp) / 2 : room.ceiling_adj === 'outside' ? designTemp : roomTemp
  if (room.ceiling_adj !== 'heated') {
    fabricLoss += ceilingArea * ceilingU * (roomTemp - ceilAdjTemp)
  }

  // Ventilation
  const defaultAch = ROOM_ACH[room.type] || 1.5
  const ach = room.ach_override !== null ? room.ach_override : defaultAch
  const volume = room.length * room.width * room.height
  const ventLoss = 0.33 * ach * shelterF * volume * deltaT

  return {
    ...room,
    fabric_loss: Math.round(Math.max(0, fabricLoss)),
    vent_loss: Math.round(Math.max(0, ventLoss)),
    total_loss: Math.round(Math.max(0, fabricLoss + ventLoss)),
  }
}

function defaultWall(id: string, wallPreset: string, windowPreset: string, height: number): WallSegment {
  const u = WALL_PRESETS[wallPreset]?.u || 1.5
  return {
    id, type: 'external', label: '',
    preset: wallPreset, customLayers: [], customU: u, u_value: u,
    length_m: 4.0, height_m: height,
    windows: [{ count: 1, width: 1.2, height: 1.2, preset: windowPreset, u: WINDOW_PRESETS[windowPreset]?.u || 2.0 }],
    doors: [],
  }
}

function defaultRoom(id: string, d: Design): Room {
  const wall = defaultWall(`${id}_w1`, d.default_wall_preset, d.default_window_preset, 2.4)
  return {
    id, name: '', type: 'Living room', floor: 0,
    length: 4.0, width: 3.5, height: 2.4,
    walls: [wall],
    floor_preset: d.default_floor_preset, floor_u_custom: FLOOR_PRESETS[d.default_floor_preset]?.u || 0.45,
    floor_adj: 'ground',
    ceiling_preset: 'pitched_100mm', ceiling_u_custom: 0.25, ceiling_adj: 'heated',
    ceiling_area: 0, floor_area: 0, ach_override: null,
    selected_radiators: [],
    fabric_loss: 0, vent_loss: 0, total_loss: 0,
  }
}

const defaultDesign: Design = {
  location: 'Birmingham', design_temp_ext: -4.0, construction_era: '1976_1990',
  property_type: 'semi_detached', total_floor_area: 85, num_bedrooms: 3, storeys: 2,
  default_wall_preset: 'cavity_unins', default_window_preset: 'double_post2002', default_floor_preset: 'solid_unins',
  sheltered: 'normal', rooms: [],
  emitter_type: 'radiators', flow_temp: 50, return_temp: 40,
  hp_model: '', hp_output_kw: 0, hp_sound_power_db: 63,
  cylinder_size_litres: 200, cylinder_type: 'indirect',
  noise_distance_m: 3, noise_reflective_surfaces: 1, noise_has_barrier: false,
  noise_barrier_attenuation: 5, noise_assessment_location: 'Nearest neighbour window/door',
}

function flowToDeltaT(flow: number, ret: number, room: number): number {
  return (flow + ret) / 2 - room
}

function suggestRadiators(lossW: number, deltaT: number): Radiator[] {
  return ULTRAHEAT_RADIATORS
    .filter(r => {
      const out = radOutput(r, deltaT)
      return out >= lossW * 0.9 && out <= lossW * 2.5
    })
    .sort((a, b) => Math.abs(radOutput(a, deltaT) - lossW) - Math.abs(radOutput(b, deltaT) - lossW))
    .slice(0, 12)
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DesignToolV2() {
  const params = useParams()
  const jobId = params.id as string

  const [design, setDesign] = useState<Design>(defaultDesign)
  const [section, setSection] = useState<'property' | 'rooms' | 'system' | 'performance' | 'noise'>('property')
  const [editRoom, setEditRoom] = useState<string | null>(null)
  const [editWall, setEditWall] = useState<string | null>(null)
  const [radSuggestRoom, setRadSuggestRoom] = useState<string | null>(null)
  const [wallBuilderWall, setWallBuilderWall] = useState<string | null>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadJob() }, [jobId])

  async function loadJob() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }
    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)
    const { data: sd } = await (supabase as any).from('system_designs').select('*').eq('job_id', jobId).single()
    if (sd?.design_inputs) {
      setDesign(sd.design_inputs)
    } else if (cd) {
      const loc = guessLoc(cd.postcode || '')
      setDesign(prev => ({ ...prev, location: loc, design_temp_ext: DESIGN_TEMPS[loc]?.temp || -4, total_floor_area: cd.floor_area_m2 || 85 }))
    }
  }

  function guessLoc(pc: string): string {
    const p = pc.slice(0, 2).toUpperCase()
    const m: Record<string, string> = {
      EC: 'London', WC: 'London', E: 'London', N: 'London', NW: 'London',
      SE: 'London', SW: 'London', W: 'London', B: 'Birmingham', WS: 'Birmingham',
      M: 'Manchester', L: 'Manchester', LS: 'Leeds', NE: 'Newcastle',
      BS: 'Bristol', CF: 'Cardiff', EH: 'Edinburgh', G: 'Glasgow',
      AB: 'Aberdeen', BT: 'Belfast', NR: 'Norwich', PL: 'Plymouth',
      S: 'Sheffield', NG: 'Nottingham',
    }
    for (const [k, v] of Object.entries(m)) { if (p.startsWith(k)) return v }
    return 'Birmingham'
  }

  const recalc = useCallback((d: Design): Design => ({
    ...d,
    rooms: d.rooms.map(r => calcRoom(r, d.design_temp_ext, d.sheltered))
  }), [])

  function upd(updates: Partial<Design>) {
    setDesign(prev => recalc({ ...prev, ...updates }))
  }

  function updRoom(roomId: string, updates: Partial<Room>) {
    setDesign(prev => recalc({
      ...prev,
      rooms: prev.rooms.map(r => r.id === roomId ? { ...r, ...updates } : r)
    }))
  }

  function updWall(roomId: string, wallId: string, updates: Partial<WallSegment>) {
    setDesign(prev => recalc({
      ...prev,
      rooms: prev.rooms.map(r => r.id !== roomId ? r : {
        ...r,
        walls: r.walls.map(w => w.id !== wallId ? w : { ...w, ...updates })
      })
    }))
  }

  function addRoom() {
    const id = Date.now().toString()
    const room = calcRoom(defaultRoom(id, design), design.design_temp_ext, design.sheltered)
    setDesign(prev => ({ ...prev, rooms: [...prev.rooms, room] }))
    setEditRoom(id)
  }

  function addWall(roomId: string) {
    const room = design.rooms.find(r => r.id === roomId)
    if (!room) return
    const id = `${roomId}_w${Date.now()}`
    const wall = defaultWall(id, design.default_wall_preset, design.default_window_preset, room.height)
    updRoom(roomId, { walls: [...room.walls, wall] })
    setEditWall(id)
  }

  function removeWall(roomId: string, wallId: string) {
    const room = design.rooms.find(r => r.id === roomId)
    if (!room) return
    updRoom(roomId, { walls: room.walls.filter(w => w.id !== wallId) })
  }

  function removeRoom(roomId: string) {
    setDesign(prev => ({ ...prev, rooms: prev.rooms.filter(r => r.id !== roomId) }))
    if (editRoom === roomId) setEditRoom(null)
  }

  function addRadiator(roomId: string, rad: Radiator) {
    const room = design.rooms.find(r => r.id === roomId)
    if (!room) return
    updRoom(roomId, { selected_radiators: [...room.selected_radiators, { radiator_id: rad.id, quantity: 1, notes: '' }] })
    setRadSuggestRoom(null)
  }

  // ─── Totals ──────────────────────────────────────────────────────────────────
  const totalW  = design.rooms.reduce((s, r) => s + r.total_loss, 0)
  const fabricW = design.rooms.reduce((s, r) => s + r.fabric_loss, 0)
  const ventW   = design.rooms.reduce((s, r) => s + r.vent_loss, 0)
  const shl     = design.total_floor_area > 0 ? Math.round(totalW / design.total_floor_area) : 0
  const recKw   = Math.ceil(totalW / 1000)
  const deltaT  = flowToDeltaT(design.flow_temp, design.return_temp, 21)
  const { spf, stars } = getSPF(shl, design.emitter_type, design.flow_temp)
  const annualHeat = Math.round((totalW / ((21 - design.design_temp_ext) * 1000)) * 2200 * 24)
  const annualElec = Math.round(annualHeat / spf)
  const annualDHW  = Math.round(45 * design.num_bedrooms * 365 * 4.18 * 0.001 / 1.7) * 100
  const noiseLevel = calcNoise(design.hp_sound_power_db, design.noise_distance_m, design.noise_reflective_surfaces, design.noise_has_barrier, design.noise_barrier_attenuation)
  const noiseOk    = noiseLevel <= 37

  const minCylinder = design.num_bedrooms <= 2 ? 150 : design.num_bedrooms <= 3 ? 200 : design.num_bedrooms <= 4 ? 250 : 300

  async function save() {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const payload = {
      job_id: jobId, design_inputs: design,
      total_heat_loss_w: totalW, specific_heat_loss_w_m2: shl,
      recommended_hp_kw: recKw, flow_temp_c: design.flow_temp,
      emitter_type: design.emitter_type, spf_estimate: spf, star_rating: stars,
      annual_heat_demand_kwh: annualHeat, annual_elec_space_kwh: annualElec,
      annual_elec_dhw_kwh: annualDHW, cylinder_size_litres: design.cylinder_size_litres,
      noise_level_db: noiseLevel, noise_compliant: noiseOk, mcs_031_compliant: true,
      designed_by: session.user.id, designed_at: new Date().toISOString(),
    }
    const { data: ex } = await (supabase as any).from('system_designs').select('id').eq('job_id', jobId).single()
    if (ex) await (supabase as any).from('system_designs').update(payload).eq('job_id', jobId)
    else await (supabase as any).from('system_designs').insert(payload)
    await (supabase as any).from('audit_log').insert({
      job_id: jobId, user_id: session.user.id, action: 'design_saved', stage: 'design',
      entity_type: 'system_design', description: `Design saved: ${recKw}kW, ${design.flow_temp}°C, SPF ${spf}, ${stars}★`,
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const sel = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">MCS Design Tool</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.postcode}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">← Back to job</a>
          <button onClick={save} disabled={saving} className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save design'}
          </button>
        </div>
      </div>

      {/* MCS banner */}
      <div className="bg-emerald-700 text-white px-6 py-1.5 flex items-center gap-6 text-xs">
        <span className="font-medium">MCS Compliant</span>
        <span>MIS 3005-D</span><span>MCS 031 v4.0</span><span>BS EN 12831-1:2017</span><span>MCS 020(a)</span>
        <span className="ml-auto">Design temp: {design.design_temp_ext}°C · {DESIGN_TEMPS[design.location]?.label}</span>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5">
        <div className="flex gap-5">

          {/* Left nav */}
          <div className="w-44 flex-shrink-0 space-y-3">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {(['property', 'rooms', 'system', 'performance', 'noise'] as const).map(s => (
                <button key={s} onClick={() => setSection(s)} className={`w-full text-left px-4 py-2.5 text-xs font-medium border-b border-gray-50 last:border-0 transition-colors capitalize ${section === s ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {s === 'rooms' ? `Rooms (${design.rooms.length})` : s}
                </button>
              ))}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 text-xs">
              <div className="font-medium text-gray-600">Summary</div>
              {[
                ['Heat loss', `${(totalW / 1000).toFixed(1)} kW`],
                ['Fabric', `${(fabricW / 1000).toFixed(1)} kW`],
                ['Ventilation', `${(ventW / 1000).toFixed(1)} kW`],
                ['Spec. loss', `${shl} W/m²`],
                ['Recommended', `${recKw} kW`],
                ['SPF', String(spf)],
                ['Stars', '★'.repeat(stars) + '☆'.repeat(6 - stars)],
                ['Flow temp', `${design.flow_temp}°C`],
                ['Noise', `${noiseLevel} dB ${noiseOk ? '✓' : '✗'}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-400">{k}</span>
                  <span className={`font-semibold ${k === 'Noise' && !noiseOk ? 'text-red-600' : k === 'Recommended' ? 'text-emerald-700' : 'text-gray-900'}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* ── PROPERTY ──────────────────────────────────────────────────── */}
            {section === 'property' && (
              <>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-4">Property & location</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={lbl}>Location (CIBSE design temp)</label>
                      <select className={sel} value={design.location} onChange={e => upd({ location: e.target.value, design_temp_ext: DESIGN_TEMPS[e.target.value]?.temp || -4 })}>
                        {Object.entries(DESIGN_TEMPS).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.temp}°C)</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>External design temp (°C) — override if needed</label>
                      <input type="number" className={inp} value={design.design_temp_ext} step={0.5} onChange={e => upd({ design_temp_ext: parseFloat(e.target.value) })} />
                    </div>
                    <div>
                      <label className={lbl}>Property type</label>
                      <select className={sel} value={design.property_type} onChange={e => upd({ property_type: e.target.value })}>
                        {['detached', 'semi_detached', 'terraced', 'end_terrace', 'flat', 'bungalow'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Total floor area (m²)</label>
                      <input type="number" className={inp} value={design.total_floor_area} onChange={e => upd({ total_floor_area: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className={lbl}>Bedrooms</label>
                      <input type="number" className={inp} value={design.num_bedrooms} min={1} max={8} onChange={e => upd({ num_bedrooms: parseInt(e.target.value) || 3 })} />
                    </div>
                    <div>
                      <label className={lbl}>Storeys</label>
                      <input type="number" className={inp} value={design.storeys} min={1} max={4} onChange={e => upd({ storeys: parseInt(e.target.value) || 2 })} />
                    </div>
                    <div>
                      <label className={lbl}>Wind sheltering</label>
                      <select className={sel} value={design.sheltered} onChange={e => upd({ sheltered: e.target.value })}>
                        <option value="very_sheltered">Very sheltered (enclosed urban)</option>
                        <option value="sheltered">Sheltered (suburban)</option>
                        <option value="normal">Normal</option>
                        <option value="exposed">Exposed (rural / elevated)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-1">Default fabric construction</div>
                  <div className="text-xs text-gray-400 mb-4">Applied automatically to new rooms — adjustable per room.</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={lbl}>Default wall type</label>
                      <select className={sel} value={design.default_wall_preset} onChange={e => upd({ default_wall_preset: e.target.value })}>
                        {Object.entries(WALL_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Default window glazing</label>
                      <select className={sel} value={design.default_window_preset} onChange={e => upd({ default_window_preset: e.target.value })}>
                        {Object.entries(WINDOW_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Default floor type</label>
                      <select className={sel} value={design.default_floor_preset} onChange={e => upd({ default_floor_preset: e.target.value })}>
                        {Object.entries(FLOOR_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── ROOMS ─────────────────────────────────────────────────────── */}
            {section === 'rooms' && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">Room-by-room heat loss</div>
                    <div className="text-xs text-gray-400 mt-0.5">BS EN 12831-1:2017 · MIS 3005-D room temps · CIBSE ACH defaults</div>
                  </div>
                  <button onClick={addRoom} className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium px-4 py-2 rounded-lg">+ Add room</button>
                </div>

                {design.rooms.length === 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                    <div className="text-sm text-gray-400 mb-3">No rooms added yet</div>
                    <button onClick={addRoom} className="text-xs text-emerald-700 hover:underline">Add your first room →</button>
                  </div>
                )}

                {design.rooms.map(room => {
                  const defaultAch = ROOM_ACH[room.type] || 1.5
                  const achDisplay = room.ach_override !== null ? room.ach_override : defaultAch

                  return (
                    <div key={room.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {/* Room header */}
                      <div className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50" onClick={() => setEditRoom(editRoom === room.id ? null : room.id)}>
                        <div className="flex items-center gap-4">
                          <div className="text-sm font-medium text-gray-900">{room.name || room.type}</div>
                          <div className="text-xs text-gray-400">{room.type}</div>
                          <div className="text-xs text-gray-400">Floor {room.floor}</div>
                          <div className="text-xs text-gray-400">{room.length}×{room.width}m</div>
                          <div className="text-xs text-emerald-600">{room.walls.filter(w => w.type === 'external').length} ext wall{room.walls.filter(w => w.type === 'external').length !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="flex items-center gap-5">
                          <div className="text-right"><div className="text-xs text-gray-400">Fabric</div><div className="text-xs font-medium">{room.fabric_loss}W</div></div>
                          <div className="text-right"><div className="text-xs text-gray-400">Vent</div><div className="text-xs font-medium">{room.vent_loss}W</div></div>
                          <div className="text-right"><div className="text-xs text-gray-400">Total</div><div className="text-sm font-bold text-emerald-700">{room.total_loss}W</div></div>
                          <div className="text-xs text-gray-400">{ROOM_TEMPS[room.type] || 21}°C</div>
                          <button onClick={e => { e.stopPropagation(); removeRoom(room.id) }} className="text-xs text-red-400 hover:text-red-600">✕</button>
                        </div>
                      </div>

                      {editRoom === room.id && (
                        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-4">
                          {/* Basic dimensions */}
                          <div className="grid grid-cols-4 gap-3">
                            <div><label className={lbl}>Room name</label><input type="text" className={inp} value={room.name} placeholder={room.type} onChange={e => updRoom(room.id, { name: e.target.value })} /></div>
                            <div>
                              <label className={lbl}>Room type (sets design temp)</label>
                              <select className={sel} value={room.type} onChange={e => updRoom(room.id, { type: e.target.value })}>
                                {Object.entries(ROOM_TEMPS).map(([t, temp]) => <option key={t} value={t}>{t} ({temp}°C)</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={lbl}>Floor level</label>
                              <select className={sel} value={room.floor} onChange={e => updRoom(room.id, { floor: parseInt(e.target.value) })}>
                                <option value={0}>Ground floor</option><option value={1}>First floor</option><option value={2}>Second floor</option><option value={3}>Loft</option>
                              </select>
                            </div>
                            <div><label className={lbl}>Ceiling height (m)</label><input type="number" className={inp} value={room.height} step={0.1} onChange={e => updRoom(room.id, { height: parseFloat(e.target.value) || 2.4 })} /></div>
                            <div><label className={lbl}>Length (m)</label><input type="number" className={inp} value={room.length} step={0.1} onChange={e => updRoom(room.id, { length: parseFloat(e.target.value) || 0 })} /></div>
                            <div><label className={lbl}>Width (m)</label><input type="number" className={inp} value={room.width} step={0.1} onChange={e => updRoom(room.id, { width: parseFloat(e.target.value) || 0 })} /></div>
                            <div>
                              <label className={lbl}>Air changes/hr (ACH)</label>
                              <input type="number" className={inp} value={achDisplay} step={0.1} onChange={e => updRoom(room.id, { ach_override: parseFloat(e.target.value) || null })} />
                              <div className="text-xs text-gray-400 mt-0.5">CIBSE default: {defaultAch}</div>
                            </div>
                            <div className="flex items-end">
                              <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 w-full">
                                <div className="font-medium">Vent: {room.vent_loss}W</div>
                                <div className="text-gray-400 mt-0.5">0.33 × {achDisplay} × {(room.length * room.width * room.height).toFixed(1)}m³ × {Math.round(ROOM_TEMPS[room.type] || 21 - design.design_temp_ext)}ΔT</div>
                              </div>
                            </div>
                          </div>

                          {/* Walls */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-medium text-gray-700">Walls</div>
                              <button onClick={() => addWall(room.id)} className="text-xs text-emerald-700 hover:underline">+ Add wall</button>
                            </div>
                            <div className="space-y-2">
                              {room.walls.map(wall => (
                                <div key={wall.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                  {/* Wall row */}
                                  <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50" onClick={() => setEditWall(editWall === wall.id ? null : wall.id)}>
                                    <div className="flex items-center gap-3">
                                      <select
                                        className="text-xs border-0 bg-transparent font-medium text-gray-700 focus:outline-none"
                                        value={wall.type}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => updWall(room.id, wall.id, { type: e.target.value as WallSegment['type'] })}
                                      >
                                        <option value="external">External wall</option>
                                        <option value="internal">Internal wall (no loss)</option>
                                        <option value="party">Party wall (no loss)</option>
                                        <option value="open">Open to room (no loss)</option>
                                      </select>
                                      {wall.label ? <span className="text-xs text-gray-400">{wall.label}</span> : null}
                                      {wall.type === 'external' && <span className="text-xs text-emerald-600">{wall.u_value} W/m²K</span>}
                                      {wall.type === 'external' && <span className="text-xs text-gray-400">{wall.length_m}×{wall.height_m > 0 ? wall.height_m : room.height}m</span>}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <button onClick={e => { e.stopPropagation(); removeWall(room.id, wall.id) }} className="text-xs text-red-400 hover:text-red-600">✕</button>
                                    </div>
                                  </div>

                                  {/* Wall editor */}
                                  {editWall === wall.id && wall.type === 'external' && (
                                    <div className="border-t border-gray-100 px-3 py-3 bg-gray-50 space-y-3">
                                      <div className="grid grid-cols-3 gap-3">
                                        <div><label className={lbl}>Wall label (optional)</label><input type="text" className={inp} value={wall.label} placeholder="e.g. North elevation" onChange={e => updWall(room.id, wall.id, { label: e.target.value })} /></div>
                                        <div><label className={lbl}>Length (m)</label><input type="number" className={inp} value={wall.length_m} step={0.1} onChange={e => updWall(room.id, wall.id, { length_m: parseFloat(e.target.value) || 0 })} /></div>
                                        <div><label className={lbl}>Height override (0 = use room height)</label><input type="number" className={inp} value={wall.height_m} step={0.1} onChange={e => updWall(room.id, wall.id, { height_m: parseFloat(e.target.value) || 0 })} /></div>
                                      </div>

                                      {/* Wall construction */}
                                      <div>
                                        <label className={lbl}>Wall construction</label>
                                        <div className="grid grid-cols-2 gap-3">
                                          <select className={sel} value={wall.preset} onChange={e => {
                                            const preset = e.target.value
                                            const u = preset === 'custom' ? wall.customU : (WALL_PRESETS[preset]?.u || 0.6)
                                            updWall(room.id, wall.id, { preset, u_value: u })
                                          }}>
                                            {Object.entries(WALL_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                          </select>
                                          <div className="flex items-center gap-2">
                                            <div className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex-1 text-center">
                                              <div className="text-xs text-gray-400">U-value</div>
                                              <div className="text-sm font-bold text-emerald-700">{wall.u_value}</div>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Custom U-value input */}
                                        {wall.preset === 'custom' && (
                                          <div className="mt-2">
                                            <label className={lbl}>Custom U-value (W/m²K)</label>
                                            <input type="number" className={inp} value={wall.customU} step={0.01} placeholder="Enter U-value" onChange={e => {
                                              const u = parseFloat(e.target.value) || 0
                                              updWall(room.id, wall.id, { customU: u, u_value: u })
                                            }} />

                                            {/* Layer builder */}
                                            <div className="mt-2">
                                              <button onClick={() => setWallBuilderWall(wallBuilderWall === wall.id ? null : wall.id)} className="text-xs text-emerald-700 hover:underline">
                                                {wallBuilderWall === wall.id ? 'Hide layer builder ↑' : 'Or build wall layer by layer →'}
                                              </button>
                                              {wallBuilderWall === wall.id && (
                                                <div className="mt-2 bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                                                  <div className="text-xs font-medium text-gray-600">Layers (outside → inside) — R-values summed, U = 1/ΣR</div>
                                                  {wall.customLayers.map((layer, li) => (
                                                    <div key={li} className="flex items-center gap-2">
                                                      <span className="text-xs text-gray-400 w-4">{li + 1}.</span>
                                                      <select className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-emerald-500" value={layer} onChange={e => {
                                                        const layers = [...wall.customLayers]; layers[li] = e.target.value
                                                        const u = calcUFromLayers(layers)
                                                        updWall(room.id, wall.id, { customLayers: layers, customU: u, u_value: u })
                                                      }}>
                                                        {Object.entries(WALL_LAYERS).map(([k, v]) => <option key={k} value={k}>{v.label} (R={v.r})</option>)}
                                                      </select>
                                                      <span className="text-xs text-gray-400 w-12">R={WALL_LAYERS[layer]?.r || 0}</span>
                                                      <button onClick={() => {
                                                        const layers = wall.customLayers.filter((_, i) => i !== li)
                                                        const u = calcUFromLayers(layers)
                                                        updWall(room.id, wall.id, { customLayers: layers, customU: u, u_value: u })
                                                      }} className="text-xs text-red-400 hover:text-red-600">✕</button>
                                                    </div>
                                                  ))}
                                                  <button onClick={() => {
                                                    const layers = [...wall.customLayers, 'brick_102']
                                                    const u = calcUFromLayers(layers)
                                                    updWall(room.id, wall.id, { customLayers: layers, customU: u, u_value: u })
                                                  }} className="text-xs text-emerald-700 hover:underline">+ Add layer</button>
                                                  {wall.customLayers.length > 0 && (
                                                    <div className="text-xs bg-gray-50 rounded px-2 py-1.5 text-gray-600">
                                                      ΣR = {(RSI + RSE + wall.customLayers.reduce((s, l) => s + (WALL_LAYERS[l]?.r || 0), 0)).toFixed(3)} → <strong>U = {calcUFromLayers(wall.customLayers)} W/m²K</strong>
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {/* Windows */}
                                      <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                          <label className="block text-xs font-medium text-gray-500">Windows in this wall</label>
                                          <button onClick={() => updWall(room.id, wall.id, { windows: [...wall.windows, { count: 1, width: 1.2, height: 1.2, preset: design.default_window_preset, u: WINDOW_PRESETS[design.default_window_preset]?.u || 2.0 }] })} className="text-xs text-emerald-700 hover:underline">+ Add window</button>
                                        </div>
                                        {wall.windows.map((win, wi) => (
                                          <div key={wi} className="grid grid-cols-6 gap-2 mb-2 items-end">
                                            <div><label className={lbl}>Count</label><input type="number" className={inp} value={win.count} min={1} onChange={e => { const wins = [...wall.windows]; wins[wi] = { ...win, count: parseInt(e.target.value) || 1 }; updWall(room.id, wall.id, { windows: wins }) }} /></div>
                                            <div><label className={lbl}>Width (m)</label><input type="number" className={inp} value={win.width} step={0.1} onChange={e => { const wins = [...wall.windows]; wins[wi] = { ...win, width: parseFloat(e.target.value) || 0 }; updWall(room.id, wall.id, { windows: wins }) }} /></div>
                                            <div><label className={lbl}>Height (m)</label><input type="number" className={inp} value={win.height} step={0.1} onChange={e => { const wins = [...wall.windows]; wins[wi] = { ...win, height: parseFloat(e.target.value) || 0 }; updWall(room.id, wall.id, { windows: wins }) }} /></div>
                                            <div className="col-span-2">
                                              <label className={lbl}>Glazing type</label>
                                              <select className={sel} value={win.preset} onChange={e => {
                                                const u = e.target.value === 'custom' ? win.u : (WINDOW_PRESETS[e.target.value]?.u || 2.0)
                                                const wins = [...wall.windows]; wins[wi] = { ...win, preset: e.target.value, u }
                                                updWall(room.id, wall.id, { windows: wins })
                                              }}>
                                                {Object.entries(WINDOW_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                              </select>
                                            </div>
                                            <div className="flex items-end gap-1">
                                              {win.preset === 'custom' && <input type="number" className={inp} value={win.u} step={0.1} placeholder="U" onChange={e => { const wins = [...wall.windows]; wins[wi] = { ...win, u: parseFloat(e.target.value) || 0 }; updWall(room.id, wall.id, { windows: wins }) }} />}
                                              <button onClick={() => updWall(room.id, wall.id, { windows: wall.windows.filter((_, i) => i !== wi) })} className="text-xs text-red-400 hover:text-red-600 mb-1.5">✕</button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Doors */}
                                      <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                          <label className="block text-xs font-medium text-gray-500">External doors</label>
                                          <button onClick={() => updWall(room.id, wall.id, { doors: [...wall.doors, { count: 1, width: 0.9, height: 2.1, u: 3.0 }] })} className="text-xs text-emerald-700 hover:underline">+ Add door</button>
                                        </div>
                                        {wall.doors.map((door, di) => (
                                          <div key={di} className="grid grid-cols-5 gap-2 mb-2 items-end">
                                            <div><label className={lbl}>Count</label><input type="number" className={inp} value={door.count} min={1} onChange={e => { const doors = [...wall.doors]; doors[di] = { ...door, count: parseInt(e.target.value) || 1 }; updWall(room.id, wall.id, { doors }) }} /></div>
                                            <div><label className={lbl}>Width (m)</label><input type="number" className={inp} value={door.width} step={0.1} onChange={e => { const doors = [...wall.doors]; doors[di] = { ...door, width: parseFloat(e.target.value) || 0 }; updWall(room.id, wall.id, { doors }) }} /></div>
                                            <div><label className={lbl}>Height (m)</label><input type="number" className={inp} value={door.height} step={0.1} onChange={e => { const doors = [...wall.doors]; doors[di] = { ...door, height: parseFloat(e.target.value) || 0 }; updWall(room.id, wall.id, { doors }) }} /></div>
                                            <div><label className={lbl}>U-value</label><input type="number" className={inp} value={door.u} step={0.1} onChange={e => { const doors = [...wall.doors]; doors[di] = { ...door, u: parseFloat(e.target.value) || 0 }; updWall(room.id, wall.id, { doors }) }} /></div>
                                            <div className="flex items-end"><button onClick={() => updWall(room.id, wall.id, { doors: wall.doors.filter((_, i) => i !== di) })} className="text-xs text-red-400 hover:text-red-600 mb-1.5">✕</button></div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Floor & Ceiling */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                              <div className="text-xs font-medium text-gray-700">Floor</div>
                              <div>
                                <label className={lbl}>Floor construction</label>
                                <select className={sel} value={room.floor_preset} onChange={e => updRoom(room.id, { floor_preset: e.target.value })}>
                                  {Object.entries(FLOOR_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                              </div>
                              {room.floor_preset === 'custom' && (
                                <div><label className={lbl}>Custom floor U-value</label><input type="number" className={inp} value={room.floor_u_custom} step={0.01} onChange={e => updRoom(room.id, { floor_u_custom: parseFloat(e.target.value) || 0 })} /></div>
                              )}
                              <div>
                                <label className={lbl}>Below floor</label>
                                <select className={sel} value={room.floor_adj} onChange={e => updRoom(room.id, { floor_adj: e.target.value })}>
                                  <option value="ground">Ground (10°C)</option>
                                  <option value="heated">Heated space</option>
                                  <option value="unheated">Unheated space</option>
                                  <option value="outside">Outside</option>
                                </select>
                              </div>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                              <div className="text-xs font-medium text-gray-700">Ceiling</div>
                              <div>
                                <label className={lbl}>Ceiling / roof construction</label>
                                <select className={sel} value={room.ceiling_preset} onChange={e => updRoom(room.id, { ceiling_preset: e.target.value })}>
                                  {Object.entries(CEILING_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                              </div>
                              {room.ceiling_preset === 'custom' && (
                                <div><label className={lbl}>Custom ceiling U-value</label><input type="number" className={inp} value={room.ceiling_u_custom} step={0.01} onChange={e => updRoom(room.id, { ceiling_u_custom: parseFloat(e.target.value) || 0 })} /></div>
                              )}
                              <div>
                                <label className={lbl}>Above ceiling</label>
                                <select className={sel} value={room.ceiling_adj} onChange={e => updRoom(room.id, { ceiling_adj: e.target.value })}>
                                  <option value="heated">Heated space</option>
                                  <option value="roof">Roof / loft (outside temp)</option>
                                  <option value="unheated">Unheated loft</option>
                                  <option value="outside">Outside</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Room result */}
                          <div className="bg-emerald-700 text-white rounded-lg p-3 grid grid-cols-5 gap-3 text-xs">
                            <div><div className="text-emerald-200">Design temp</div><div className="font-semibold">{ROOM_TEMPS[room.type] || 21}°C</div></div>
                            <div><div className="text-emerald-200">Fabric loss</div><div className="font-semibold">{room.fabric_loss}W</div></div>
                            <div><div className="text-emerald-200">Ventilation</div><div className="font-semibold">{room.vent_loss}W</div></div>
                            <div><div className="text-emerald-200">Total</div><div className="text-base font-bold">{room.total_loss}W</div></div>
                            <div><div className="text-emerald-200">ACH</div><div className="font-semibold">{achDisplay}</div></div>
                          </div>

                          {/* Radiator selection */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-medium text-gray-700">Radiator selection — Ultraheat C4/C6</div>
                              <button onClick={() => setRadSuggestRoom(radSuggestRoom === room.id ? null : room.id)} className="text-xs text-emerald-700 hover:underline">
                                {radSuggestRoom === room.id ? 'Hide' : `Suggest for ${room.total_loss}W →`}
                              </button>
                            </div>

                            {room.selected_radiators.length > 0 && (
                              <div className="space-y-1.5 mb-3">
                                {room.selected_radiators.map((sr, si) => {
                                  const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.radiator_id)
                                  if (!rad) return null
                                  const output = radOutput(rad, deltaT)
                                  return (
                                    <div key={si} className="flex items-center justify-between bg-white border border-emerald-200 rounded-lg px-3 py-2">
                                      <div className="text-xs">
                                        <span className="font-medium">{rad.type} H{rad.height_mm}×{rad.length_mm}mm</span>
                                        <span className="text-gray-400 ml-2">× {sr.quantity}</span>
                                        <span className="text-emerald-700 ml-2">{output}W each = {output * sr.quantity}W total</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <input type="number" className="w-12 text-xs border border-gray-200 rounded px-2 py-0.5" value={sr.quantity} min={1} onChange={e => {
                                          const rads = [...room.selected_radiators]; rads[si] = { ...sr, quantity: parseInt(e.target.value) || 1 }
                                          updRoom(room.id, { selected_radiators: rads })
                                        }} />
                                        <button onClick={() => updRoom(room.id, { selected_radiators: room.selected_radiators.filter((_, i) => i !== si) })} className="text-xs text-red-400 hover:text-red-600">✕</button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {radSuggestRoom === room.id && (
                              <div className="bg-white border border-gray-200 rounded-lg p-3">
                                <div className="text-xs text-gray-500 mb-2">
                                  Showing radiators for {room.total_loss}W at ΔT{Math.round(deltaT)} (flow {design.flow_temp}°C / return {design.return_temp}°C)
                                </div>
                                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                                  {suggestRadiators(room.total_loss, deltaT).map(rad => {
                                    const output = radOutput(rad, deltaT)
                                    const pct = Math.round((output / room.total_loss - 1) * 100)
                                    return (
                                      <button key={rad.id} onClick={() => addRadiator(room.id, rad)} className="text-left p-2.5 border border-gray-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                                        <div className="text-xs font-medium text-gray-900">{rad.type}</div>
                                        <div className="text-xs text-gray-500">H{rad.height_mm} × {rad.length_mm}mm</div>
                                        <div className="text-xs font-semibold text-emerald-700 mt-0.5">{output}W</div>
                                        <div className="text-xs text-gray-400">+{pct}% · {rad.panels} panel{rad.panels > 1 ? 's' : ''} · {rad.depth_mm}mm deep</div>
                                      </button>
                                    )
                                  })}
                                  {suggestRadiators(room.total_loss, deltaT).length === 0 && (
                                    <div className="col-span-2 text-xs text-gray-400 py-4 text-center">No matches found. Try adjusting the flow temperature in the System tab.</div>
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

                {design.rooms.length > 0 && (
                  <div className="bg-emerald-700 text-white rounded-xl p-5 grid grid-cols-5 gap-4 text-sm">
                    <div><div className="text-emerald-200 text-xs mb-1">Fabric</div><div className="font-semibold">{(fabricW / 1000).toFixed(2)} kW</div></div>
                    <div><div className="text-emerald-200 text-xs mb-1">Ventilation</div><div className="font-semibold">{(ventW / 1000).toFixed(2)} kW</div></div>
                    <div><div className="text-emerald-200 text-xs mb-1">Total heat loss</div><div className="text-xl font-bold">{(totalW / 1000).toFixed(2)} kW</div></div>
                    <div><div className="text-emerald-200 text-xs mb-1">Specific loss</div><div className="font-semibold">{shl} W/m²</div></div>
                    <div><div className="text-emerald-200 text-xs mb-1">Recommended ASHP</div><div className="text-xl font-bold">{recKw} kW</div></div>
                  </div>
                )}
              </>
            )}

            {/* ── SYSTEM ────────────────────────────────────────────────────── */}
            {section === 'system' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-4">Heat emitter & flow temperature</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={lbl}>Emitter type</label>
                      <select className={sel} value={design.emitter_type} onChange={e => upd({ emitter_type: e.target.value })}>
                        <option value="ufh">Underfloor heating (UFH)</option>
                        <option value="radiators">Radiators</option>
                        <option value="mixed">Mixed UFH + radiators</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Flow temperature (°C)</label>
                      <input type="number" className={inp} value={design.flow_temp} step={1} onChange={e => upd({ flow_temp: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className={lbl}>Return temperature (°C)</label>
                      <input type="number" className={inp} value={design.return_temp} step={1} onChange={e => upd({ return_temp: parseInt(e.target.value) || 40 })} />
                    </div>
                    <div className="col-span-3 bg-gray-50 rounded-lg p-3 grid grid-cols-4 gap-4 text-xs">
                      <div><div className="text-gray-400">Mean water temp</div><div className="font-semibold">{(design.flow_temp + design.return_temp) / 2}°C</div></div>
                      <div><div className="text-gray-400">Delta T at room 21°C</div><div className="font-semibold">{Math.round(deltaT)}°C</div></div>
                      <div><div className="text-gray-400">SPF (MCS 031)</div><div className="font-semibold">{spf}</div></div>
                      <div><div className="text-gray-400">Star rating</div><div className="font-semibold">{'★'.repeat(stars)}{'☆'.repeat(6 - stars)} {stars}/6</div></div>
                    </div>
                    {design.emitter_type === 'radiators' && design.flow_temp >= 55 && (
                      <div className="col-span-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                        <div className="text-xs font-medium text-amber-900">MCS 021 radiator sizing check required</div>
                        <div className="text-xs text-amber-700 mt-0.5">Existing radiators must be verified for output at {design.flow_temp}°C. Use the radiator selector in each room.</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-4">Heat pump</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <label className={lbl}>Heat pump model (MCS product directory)</label>
                      <input type="text" className={inp} value={design.hp_model} placeholder="e.g. Mitsubishi Ecodan PUHZ-SW120VKA" onChange={e => upd({ hp_model: e.target.value })} />
                    </div>
                    <div>
                      <label className={lbl}>Rated output at A7/W{design.flow_temp} (kW)</label>
                      <input type="number" className={inp} value={design.hp_output_kw} step={0.5} onChange={e => upd({ hp_output_kw: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className={lbl}>Sound power level dB(A)</label>
                      <input type="number" className={inp} value={design.hp_sound_power_db} step={0.5} onChange={e => upd({ hp_sound_power_db: parseFloat(e.target.value) || 63 })} />
                      <div className="text-xs text-gray-400 mt-0.5">From MCS product directory</div>
                    </div>
                    {design.hp_output_kw > 0 && (
                      <div className="col-span-2">
                        <div className={`rounded-lg p-3 mt-5 ${design.hp_output_kw >= recKw ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                          <div className={`text-sm font-semibold ${design.hp_output_kw >= recKw ? 'text-emerald-700' : 'text-red-700'}`}>
                            {design.hp_output_kw >= recKw ? '✓ HP adequately sized' : '✗ HP undersized'}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {design.hp_output_kw}kW rated · {recKw}kW required ·{' '}
                            {design.hp_output_kw >= recKw ? `${Math.round((design.hp_output_kw / recKw - 1) * 100)}% overhead` : `${Math.round((1 - design.hp_output_kw / recKw) * 100)}% short`}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-sm font-medium text-gray-900 mb-4">Hot water cylinder</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={lbl}>Cylinder type</label>
                      <select className={sel} value={design.cylinder_type} onChange={e => upd({ cylinder_type: e.target.value })}>
                        <option value="indirect">Indirect (heat pump coil)</option>
                        <option value="direct">Direct / immersion</option>
                        <option value="thermal_store">Thermal store</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Cylinder size (litres)</label>
                      <input type="number" className={inp} value={design.cylinder_size_litres} step={25} onChange={e => upd({ cylinder_size_litres: parseInt(e.target.value) || 200 })} />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-1">MIS 3005-D minimum</div>
                      <div className="text-lg font-bold text-gray-900">{minCylinder}L</div>
                      <div className="text-xs text-gray-400">for {design.num_bedrooms} bedrooms</div>
                      {design.cylinder_size_litres < minCylinder && <div className="text-xs text-red-600 mt-1">⚠ Below minimum</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── PERFORMANCE ───────────────────────────────────────────────── */}
            {section === 'performance' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">MCS 031 Issue 4.0 — Performance estimate</div>
                      <div className="text-xs text-gray-400 mt-0.5">Mandatory from 18 March 2025 · Must be provided to customer before contract</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl">{'★'.repeat(stars)}{'☆'.repeat(6 - stars)}</div>
                      <div className="text-xs text-gray-400">{stars}/6 stars</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">Total heat loss</div><div className="text-lg font-bold">{(totalW / 1000).toFixed(2)} kW</div></div>
                    <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">Specific heat loss</div><div className="text-lg font-bold text-emerald-700">{shl} W/m²</div></div>
                    <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">Estimated SPF</div><div className="text-lg font-bold">{spf}</div></div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="text-xs font-medium text-emerald-800 mb-3">Annual energy estimates</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-600">Annual heat demand</span><span className="font-semibold">{annualHeat.toLocaleString()} kWh</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Annual electricity — space heating (SPF {spf})</span><span className="font-semibold">{annualElec.toLocaleString()} kWh</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Annual electricity — DHW (SPF 1.70)</span><span className="font-semibold">{annualDHW.toLocaleString()} kWh</span></div>
                      <div className="flex justify-between border-t border-emerald-200 pt-2 font-semibold text-emerald-800">
                        <span>Total annual electricity</span><span>{(annualElec + annualDHW).toLocaleString()} kWh</span>
                      </div>
                    </div>
                    <div className="mt-4 bg-white rounded-lg p-3 text-xs text-gray-600 border border-emerald-200">
                      <p className="font-medium mb-1">MCS 031 mandatory customer disclosure:</p>
                      <p className="mb-1">This is not a detailed system design. It offers a reasonable estimate of likely performance. Details may change after the heat loss survey.</p>
                      <p>Estimated annual electricity: <strong>{(annualElec + annualDHW).toLocaleString()} kWh/year</strong> (range: {Math.round((annualElec + annualDHW) * 0.9).toLocaleString()}–{Math.round((annualElec + annualDHW) * 1.1).toLocaleString()} kWh/year)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── NOISE ─────────────────────────────────────────────────────── */}
            {section === 'noise' && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="text-sm font-medium text-gray-900 mb-1">MCS 020(a) — Noise assessment</div>
                <div className="text-xs text-gray-400 mb-5">Mandatory for PDR in England from 20 September 2025 · Pass: ≤37 dB</div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div>
                      <label className={lbl}>HP sound power level dB(A)</label>
                      <input type="number" className={inp} value={design.hp_sound_power_db} step={0.5} onChange={e => upd({ hp_sound_power_db: parseFloat(e.target.value) || 63 })} />
                      <div className="text-xs text-gray-400 mt-0.5">From MCS product directory</div>
                    </div>
                    <div>
                      <label className={lbl}>Assessment position description</label>
                      <input type="text" className={inp} value={design.noise_assessment_location} onChange={e => upd({ noise_assessment_location: e.target.value })} />
                    </div>
                    <div>
                      <label className={lbl}>Distance to assessment position (m)</label>
                      <input type="number" className={inp} value={design.noise_distance_m} step={0.5} min={1} onChange={e => upd({ noise_distance_m: parseFloat(e.target.value) || 1 })} />
                    </div>
                    <div>
                      <label className={lbl}>Reflective surfaces near HP</label>
                      <select className={sel} value={design.noise_reflective_surfaces} onChange={e => upd({ noise_reflective_surfaces: parseInt(e.target.value) })}>
                        <option value={0}>0 — Free field</option>
                        <option value={1}>1 — One wall or fence</option>
                        <option value={2}>2 — Corner (two surfaces)</option>
                        <option value={3}>3 — Three surfaces</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Acoustic barrier</label>
                      <select className={sel} value={design.noise_has_barrier ? 'yes' : 'no'} onChange={e => upd({ noise_has_barrier: e.target.value === 'yes' })}>
                        <option value="no">No barrier</option>
                        <option value="yes">Barrier present</option>
                      </select>
                    </div>
                    {design.noise_has_barrier && (
                      <div>
                        <label className={lbl}>Barrier attenuation (dB)</label>
                        <input type="number" className={inp} value={design.noise_barrier_attenuation} step={0.5} onChange={e => upd({ noise_barrier_attenuation: parseFloat(e.target.value) || 0 })} />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className={`rounded-xl p-6 border-2 text-center mb-4 ${noiseOk ? 'bg-emerald-50 border-emerald-400' : 'bg-red-50 border-red-400'}`}>
                      <div className={`text-xs font-medium mb-2 ${noiseOk ? 'text-emerald-700' : 'text-red-700'}`}>MCS 020(a) result</div>
                      <div className={`text-5xl font-bold mb-2 ${noiseOk ? 'text-emerald-700' : 'text-red-700'}`}>{noiseLevel} dB</div>
                      <div className={`text-sm font-bold ${noiseOk ? 'text-emerald-700' : 'text-red-700'}`}>{noiseOk ? '✓ COMPLIANT' : '✗ NON-COMPLIANT'}</div>
                      <div className="text-xs text-gray-400 mt-1">Limit: 37 dB</div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4 text-xs space-y-1.5">
                      <div className="font-medium text-gray-700 mb-2">Calculation</div>
                      {[
                        ['Lw (sound power)', `${design.hp_sound_power_db} dB`],
                        [`Distance −20·log₁₀(${design.noise_distance_m})`, `−${(20 * Math.log10(design.noise_distance_m)).toFixed(1)} dB`],
                        ['Free field correction', '−8 dB'],
                        ['Ground reflection (D)', '+3 dB'],
                        [`Reflective surfaces (${design.noise_reflective_surfaces}×3)`, `+${design.noise_reflective_surfaces * 3} dB`],
                        ['Barrier attenuation', `−${design.noise_has_barrier ? design.noise_barrier_attenuation : 0} dB`],
                        ['Result', `${noiseLevel} dB`],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-gray-500">{k}</span>
                          <span className="font-medium">{v}</span>
                        </div>
                      ))}
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