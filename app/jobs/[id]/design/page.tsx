'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ULTRAHEAT_RADIATORS, radOutput, type Radiator } from '@/lib/radiators'
import FloorPlanCanvas, { type CanvasRoom, type CanvasTool } from '@/components/FloorPlanCanvas'
import { polygonAreaM2, rectFromDimensions, detectAdjacency, autoWallTypes } from '@/lib/canvas-geometry'

// ─── Constants ────────────────────────────────────────────────────────────────

const DESIGN_TEMPS: Record<string, { temp: number; label: string }> = {
  'London': { temp: -3.0, label: 'London / SE England' },
  'Birmingham': { temp: -4.0, label: 'Birmingham / Midlands' },
  'Manchester': { temp: -4.0, label: 'Manchester / NW England' },
  'Leeds': { temp: -4.0, label: 'Leeds / Yorkshire' },
  'Newcastle': { temp: -5.0, label: 'Newcastle / NE England' },
  'Bristol': { temp: -3.0, label: 'Bristol / SW England' },
  'Cardiff': { temp: -3.0, label: 'Cardiff / Wales' },
  'Edinburgh': { temp: -6.0, label: 'Edinburgh / Scotland' },
  'Glasgow': { temp: -5.0, label: 'Glasgow / W Scotland' },
  'Aberdeen': { temp: -7.0, label: 'Aberdeen / N Scotland' },
  'Belfast': { temp: -3.0, label: 'Belfast / N Ireland' },
  'Norwich': { temp: -4.0, label: 'Norwich / East Anglia' },
  'Plymouth': { temp: -2.0, label: 'Plymouth / Cornwall' },
  'Sheffield': { temp: -4.0, label: 'Sheffield / S Yorkshire' },
  'Nottingham': { temp: -4.0, label: 'Nottingham / E Midlands' },
}

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

const WALL_PRESETS: Record<string, { label: string; u: number }> = {
  'solid_brick_unins':   { label: 'Solid brick — uninsulated (2.1)', u: 2.1 },
  'solid_brick_ext_ins': { label: 'Solid brick — ext insulation 75mm (0.29)', u: 0.29 },
  'solid_brick_int_ins': { label: 'Solid brick — int insulation 75mm (0.27)', u: 0.27 },
  'cavity_unins':        { label: 'Cavity wall — uninsulated (1.5)', u: 1.5 },
  'cavity_full_mineral': { label: 'Cavity — full fill mineral wool (0.33)', u: 0.33 },
  'cavity_partial_pir':  { label: 'Cavity — partial fill 50mm PIR (0.25)', u: 0.25 },
  'timber_frame_ins':    { label: 'Timber frame — 140mm mineral (0.22)', u: 0.22 },
  'modern_new_build':    { label: 'Modern new build post-2012 (0.18)', u: 0.18 },
  'custom':              { label: 'Custom U-value', u: 0 },
}

const WINDOW_PRESETS: Record<string, { label: string; u: number }> = {
  'single':          { label: 'Single glazed (4.8)', u: 4.8 },
  'secondary':       { label: 'Secondary glazed (2.4)', u: 2.4 },
  'double_pre2002':  { label: 'Double glazed pre-2002 (2.8)', u: 2.8 },
  'double_post2002': { label: 'Double glazed post-2002 (2.0)', u: 2.0 },
  'double_low_e':    { label: 'Double glazed low-E (1.4)', u: 1.4 },
  'triple':          { label: 'Triple glazed (0.8)', u: 0.8 },
  'custom':          { label: 'Custom U-value', u: 0 },
}

const MCS031_SPF: number[][] = [
  [20, 4.5, 4.2, 3.9, 3.6, 3.3, 3.0, 2.7, 3.8, 3.5, 3.2],
  [30, 4.3, 4.0, 3.7, 3.4, 3.1, 2.8, 2.6, 3.6, 3.3, 3.0],
  [40, 4.1, 3.8, 3.5, 3.2, 2.9, 2.7, 2.5, 3.4, 3.1, 2.8],
  [50, 3.9, 3.6, 3.3, 3.0, 2.8, 2.6, 2.4, 3.2, 2.9, 2.7],
  [60, 3.7, 3.4, 3.1, 2.9, 2.7, 2.5, 2.3, 3.0, 2.8, 2.6],
  [80, 3.5, 3.2, 2.9, 2.7, 2.6, 2.4, 2.2, 2.8, 2.6, 2.4],
  [100, 3.3, 3.0, 2.8, 2.6, 2.5, 2.3, 2.1, 2.7, 2.5, 2.3],
  [120, 3.1, 2.9, 2.7, 2.5, 2.4, 2.2, 2.0, 2.6, 2.4, 2.2],
  [999, 2.9, 2.7, 2.5, 2.4, 2.3, 2.1, 1.9, 2.5, 2.3, 2.1],
]

function getSPF(shl: number, emitter: string, flowTemp: number): { spf: number; stars: number } {
  const row = MCS031_SPF.find(r => shl <= r[0]) || MCS031_SPF[MCS031_SPF.length - 1]
  const col = emitter === 'ufh' ? (flowTemp <= 35 ? 1 : flowTemp <= 40 ? 2 : 3)
    : emitter === 'radiators' ? (flowTemp <= 45 ? 4 : flowTemp <= 50 ? 5 : flowTemp <= 55 ? 6 : 7)
    : (flowTemp <= 45 ? 8 : flowTemp <= 50 ? 9 : 10)
  const spf = row[col]
  return { spf, stars: spf >= 4.0 ? 6 : spf >= 3.5 ? 5 : spf >= 3.0 ? 4 : spf >= 2.7 ? 3 : spf >= 2.4 ? 2 : 1 }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DesignRoute = 'selector' | 'list' | 'canvas' | 'upload'

type RoomData = {
  id: string
  name: string
  roomType: string
  floor: number
  lengthMm: number
  widthMm: number
  heightMm: number
  areaMm2: number
  extWallU: number
  windowU: number
  doorU: number
  floorU: number
  ceilingU: number
  extWallAreaMm2: number
  windowAreaMm2: number
  doorAreaMm2: number
  floorAdj: string
  ceilingAdj: string
  achOverride: number | null
  fabricLossW: number
  ventLossW: number
  totalLossW: number
  canvasRoomId?: string
}

type SystemData = {
  location: string
  designTempExt: number
  totalFloorAreaM2: number
  numBedrooms: number
  emitterType: string
  flowTemp: number
  returnTemp: number
  hpModel: string
  hpOutputKw: number
  hpSoundPowerDb: number
  cylinderSizeLitres: number
  cylinderType: string
  noiseDistanceM: number
  noiseReflectiveSurfaces: number
  noiseHasBarrier: boolean
  noiseBarrierAttenuation: number
  noiseAssessmentLocation: string
}

function calcRoomLoss(room: RoomData, designTempExt: number): RoomData {
  const roomTemp = ROOM_TEMPS[room.roomType] || 21
  const dT = roomTemp - designTempExt
  const area = room.areaMm2 > 0 ? room.areaMm2 / 1_000_000 : (room.lengthMm * room.widthMm) / 1_000_000
  const extWallArea = room.extWallAreaMm2 > 0 ? room.extWallAreaMm2 / 1_000_000 : area * 1.5
  const windowArea = room.windowAreaMm2 > 0 ? room.windowAreaMm2 / 1_000_000 : area * 0.15
  const doorArea = room.doorAreaMm2 / 1_000_000
  const floorAdjTemp = room.floorAdj === 'ground' ? 10 : room.floorAdj === 'heated' ? roomTemp : room.floorAdj === 'unheated' ? (roomTemp + designTempExt) / 2 : designTempExt
  const ceilAdjTemp = room.ceilingAdj === 'roof' ? designTempExt : room.ceilingAdj === 'unheated' ? (roomTemp + designTempExt) / 2 : room.ceilingAdj === 'outside' ? designTempExt : roomTemp
  const fabricLoss =
    Math.max(0, extWallArea - windowArea - doorArea) * room.extWallU * dT +
    windowArea * room.windowU * dT +
    doorArea * room.doorU * dT +
    area * room.floorU * (roomTemp - floorAdjTemp) +
    (room.ceilingAdj !== 'heated' ? area * room.ceilingU * (roomTemp - ceilAdjTemp) : 0)
  const ach = room.achOverride !== null ? room.achOverride : (ROOM_ACH[room.roomType] || 1.5)
  const volume = area * (room.heightMm / 1000)
  const ventLoss = 0.33 * ach * volume * dT
  return {
    ...room,
    fabricLossW: Math.round(Math.max(0, fabricLoss)),
    ventLossW: Math.round(Math.max(0, ventLoss)),
    totalLossW: Math.round(Math.max(0, fabricLoss + ventLoss)),
  }
}

function makeDefaultRoom(id: string, system: SystemData, wallPreset: string, windowPreset: string): RoomData {
  return {
    id, name: '', roomType: 'Living room', floor: 0,
    lengthMm: 4000, widthMm: 3500, heightMm: 2400, areaMm2: 0,
    extWallU: WALL_PRESETS[wallPreset]?.u || 1.5,
    windowU: WINDOW_PRESETS[windowPreset]?.u || 2.0,
    doorU: 3.0, floorU: 0.45, ceilingU: 0.25,
    extWallAreaMm2: 0, windowAreaMm2: 0, doorAreaMm2: 0,
    floorAdj: 'ground', ceilingAdj: 'heated', achOverride: null,
    fabricLossW: 0, ventLossW: 0, totalLossW: 0,
  }
}

const defaultSystem: SystemData = {
  location: 'Birmingham', designTempExt: -4.0, totalFloorAreaM2: 85, numBedrooms: 3,
  emitterType: 'radiators', flowTemp: 50, returnTemp: 40,
  hpModel: '', hpOutputKw: 0, hpSoundPowerDb: 63,
  cylinderSizeLitres: 200, cylinderType: 'indirect',
  noiseDistanceM: 3, noiseReflectiveSurfaces: 1, noiseHasBarrier: false,
  noiseBarrierAttenuation: 5, noiseAssessmentLocation: 'Nearest neighbour window/door',
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DesignPage() {
  const params = useParams()
  const jobId = params.id as string
  const canvasRef = useRef<any>(null)
  const roomPanelRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const [route, setRoute] = useState<DesignRoute>('selector')
  const [system, setSystem] = useState<SystemData>(defaultSystem)
  const [rooms, setRooms] = useState<RoomData[]>([])
  const [canvasRooms, setCanvasRooms] = useState<CanvasRoom[]>([])
  const [activeFloor, setActiveFloor] = useState(0)
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('select')
  const [selectedCanvasRoom, setSelectedCanvasRoom] = useState<string | null>(null)
  const [gridMm, setGridMm] = useState(100)
  const [showGrid, setShowGrid] = useState(true)
  const [showDimensions, setShowDimensions] = useState(true)
  const [uploadImage, setUploadImage] = useState<string | null>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [defaultWallPreset, setDefaultWallPreset] = useState('cavity_unins')
  const [defaultWindowPreset] = useState('double_post2002')
  const [editRoomId, setEditRoomId] = useState<string | null>(null)
  const [radSuggestId, setRadSuggestId] = useState<string | null>(null)
  const [selectedRadiators, setSelectedRadiators] = useState<Record<string, { id: string; qty: number }[]>>({})

  useEffect(() => { loadJob() }, [jobId])

  // When a canvas room is selected, open that room in the right panel and scroll to it
  useEffect(() => {
    if (!selectedCanvasRoom) return
    const room = rooms.find(r => r.canvasRoomId === selectedCanvasRoom)
    if (room) {
      setEditRoomId(room.id)
      setTimeout(() => {
        roomPanelRefs.current[room.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }, [selectedCanvasRoom, rooms])

  async function loadJob() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }
    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)
    const { data: sd } = await (supabase as any).from('system_designs').select('*').eq('job_id', jobId).single()
    if (sd?.design_inputs) {
      const di = sd.design_inputs
      if (di.system) setSystem(di.system)
      if (di.rooms) setRooms(di.rooms)
      if (di.canvasRooms) setCanvasRooms(di.canvasRooms)
      if (di.route && di.route !== 'selector') setRoute(di.route)
      if (di.selectedRadiators) setSelectedRadiators(di.selectedRadiators)
    } else if (cd) {
      const loc = guessLoc(cd.postcode || '')
      setSystem(prev => ({ ...prev, location: loc, designTempExt: DESIGN_TEMPS[loc]?.temp || -4, totalFloorAreaM2: cd.floor_area_m2 || 85 }))
    }
  }

  function guessLoc(pc: string): string {
    const p = pc.slice(0, 2).toUpperCase()
    const m: Record<string, string> = { EC: 'London', WC: 'London', E: 'London', N: 'London', NW: 'London', SE: 'London', SW: 'London', W: 'London', B: 'Birmingham', WS: 'Birmingham', M: 'Manchester', L: 'Manchester', LS: 'Leeds', NE: 'Newcastle', BS: 'Bristol', CF: 'Cardiff', EH: 'Edinburgh', G: 'Glasgow', AB: 'Aberdeen', BT: 'Belfast', NR: 'Norwich', PL: 'Plymouth', S: 'Sheffield', NG: 'Nottingham' }
    for (const [k, v] of Object.entries(m)) { if (p.startsWith(k)) return v }
    return 'Birmingham'
  }

  const syncCanvasToRooms = useCallback((cRooms: CanvasRoom[]) => {
    setRooms(prev => {
      const updated = [...prev]
      for (const cr of cRooms) {
        const areaM2 = polygonAreaM2(cr.vertices)
        const existing = updated.find(r => r.canvasRoomId === cr.id)
        if (existing) {
          existing.areaMm2 = areaM2 * 1_000_000
          existing.roomType = cr.roomType
          existing.name = cr.name
          existing.floor = cr.floor
        } else {
          const xs = cr.vertices.map(v => v.x), ys = cr.vertices.map(v => v.y)
          const newRoom: RoomData = {
            ...makeDefaultRoom(`r_${cr.id}`, system, defaultWallPreset, defaultWindowPreset),
            id: `r_${cr.id}`,
            name: cr.name, roomType: cr.roomType, floor: cr.floor,
            lengthMm: Math.max(...xs) - Math.min(...xs),
            widthMm: Math.max(...ys) - Math.min(...ys),
            areaMm2: areaM2 * 1_000_000,
            canvasRoomId: cr.id,
          }
          updated.push(calcRoomLoss(newRoom, system.designTempExt))
        }
      }
      return updated
        .filter(r => !r.canvasRoomId || cRooms.some(cr => cr.id === r.canvasRoomId))
        .map(r => calcRoomLoss(r, system.designTempExt))
    })
  }, [system, defaultWallPreset, defaultWindowPreset])

  function handleCanvasRoomsChange(newCR: CanvasRoom[]) {
    setCanvasRooms(newCR)
    syncCanvasToRooms(newCR)
  }

  function handleCanvasRoomSelect(id: string | null) {
    setSelectedCanvasRoom(id)
  }

  function addRoom() {
    const id = `r_${Date.now()}`
    const room = calcRoomLoss(makeDefaultRoom(id, system, defaultWallPreset, defaultWindowPreset), system.designTempExt)
    setRooms(prev => [...prev, room])
    setEditRoomId(id)
    if (route === 'canvas' || route === 'upload') {
      const canvasId = `cr_${Date.now()}`
      const offset = canvasRooms.length * 5000
      const verts = rectFromDimensions(offset, 0, room.lengthMm, room.widthMm)
      const newCR: CanvasRoom = {
        id: canvasId, name: room.name, roomType: room.roomType, floor: room.floor,
        vertices: verts, wallTypes: ['external', 'external', 'external', 'external'], elements: [],
      }
      setCanvasRooms(prev => [...prev, newCR])
      setRooms(prev => prev.map(r => r.id === id ? { ...r, canvasRoomId: canvasId } : r))
      setTimeout(() => { canvasRef.current?.fitToScreen() }, 100)
    }
    setTimeout(() => {
      roomPanelRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  function updRoom(id: string, updates: Partial<RoomData>) {
    setRooms(prev => prev.map(r => r.id !== id ? r : calcRoomLoss({ ...r, ...updates }, system.designTempExt)))
    const room = rooms.find(r => r.id === id)
    if (room?.canvasRoomId) {
      const up = updates as any
      if (up.name !== undefined || up.roomType !== undefined) {
        setCanvasRooms(prev => prev.map(cr => cr.id !== room.canvasRoomId ? cr : {
          ...cr, name: up.name ?? cr.name, roomType: up.roomType ?? cr.roomType,
        }))
      }
    }
  }

  function removeRoom(id: string) {
    const room = rooms.find(r => r.id === id)
    setRooms(prev => prev.filter(r => r.id !== id))
    if (room?.canvasRoomId) setCanvasRooms(prev => prev.filter(cr => cr.id !== room.canvasRoomId))
    if (editRoomId === id) setEditRoomId(null)
  }

  const canvasRoomsWithLoss: CanvasRoom[] = canvasRooms.map(cr => ({
    ...cr,
    heatLossW: rooms.find(r => r.canvasRoomId === cr.id)?.totalLossW,
  }))

  // ─── Totals ──────────────────────────────────────────────────────────────────

  const totalW = rooms.reduce((s, r) => s + r.totalLossW, 0)
  const shl = system.totalFloorAreaM2 > 0 ? Math.round(totalW / system.totalFloorAreaM2) : 0
  const recKw = Math.ceil(totalW / 1000)
  const deltaT = (system.flowTemp + system.returnTemp) / 2 - 21
  const { spf, stars } = getSPF(shl, system.emitterType, system.flowTemp)
  const annualHeat = Math.round((totalW / ((21 - system.designTempExt) * 1000)) * 2200 * 24)
  const annualElec = Math.round(annualHeat / spf)
  const annualDHW = Math.round(45 * system.numBedrooms * 365 * 4.18 * 0.001 / 1.7) * 100

  async function save() {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const payload = {
      job_id: jobId,
      design_inputs: { system, rooms, canvasRooms, route, selectedRadiators },
      total_heat_loss_w: totalW, specific_heat_loss_w_m2: shl, recommended_hp_kw: recKw,
      flow_temp_c: system.flowTemp, emitter_type: system.emitterType, spf_estimate: spf, star_rating: stars,
      annual_heat_demand_kwh: annualHeat, annual_elec_space_kwh: annualElec, annual_elec_dhw_kwh: annualDHW,
      cylinder_size_litres: system.cylinderSizeLitres, mcs_031_compliant: true,
      designed_by: session.user.id, designed_at: new Date().toISOString(),
    }
    const { data: ex } = await (supabase as any).from('system_designs').select('id').eq('job_id', jobId).single()
    if (ex) await (supabase as any).from('system_designs').update(payload).eq('job_id', jobId)
    else await (supabase as any).from('system_designs').insert(payload)
    await (supabase as any).from('audit_log').insert({
      job_id: jobId, user_id: session.user.id, action: 'design_saved', stage: 'design',
      entity_type: 'system_design', description: `Design saved: ${recKw}kW ASHP, SPF ${spf}, ${stars}★`,
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setUploadImage(ev.target?.result as string); setRoute('upload') }
    reader.readAsDataURL(file)
  }

  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const sel = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"

  const floors = Array.from(new Set([0, ...canvasRooms.map(r => r.floor)])).sort((a, b) => a - b)
  const showCanvas = route === 'canvas' || route === 'upload'

  // ─── Route selector ───────────────────────────────────────────────────────────

  if (route === 'selector') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
            </div>
            <div className="text-xs font-semibold text-gray-900">MCS Design Tool</div>
          </div>
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">← Back to job</a>
        </div>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="text-center mb-8">
            <h1 className="text-lg font-semibold text-gray-900 mb-2">How would you like to design this system?</h1>
            <p className="text-sm text-gray-500">All three routes share the same data — switch between them at any time.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { route: 'list' as DesignRoute, icon: '📋', title: 'Room by room', desc: 'Enter each room manually — best for data entry from survey notes on site.', features: ['Full fabric element control', 'Custom U-values & layer builder', 'Ultraheat radiator selection', 'Rooms auto-appear in floor plan'] },
              { route: 'canvas' as DesignRoute, icon: '✏️', title: 'Draw floor plan', desc: 'Draw rooms on a canvas floor by floor. Walls auto-type when rooms touch.', features: ['Draw any room shape', 'Auto internal wall detection', 'Place windows, doors, radiators', 'Rectangular drag stays square'] },
              { route: 'upload' as DesignRoute, icon: '📐', title: 'Upload existing plan', desc: 'Upload a photo or PDF of an existing plan. Set scale and trace rooms over it.', features: ['Works with any plan format', 'Set scale from known dimension', 'Trace rooms over background', 'Auto-populates room list'] },
            ].map(opt => (
              <button key={opt.route} onClick={() => setRoute(opt.route)}
                className="text-left bg-white border-2 border-gray-200 hover:border-emerald-500 rounded-xl p-5 transition-all hover:shadow-md group">
                <div className="text-3xl mb-3">{opt.icon}</div>
                <div className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-emerald-700">{opt.title}</div>
                <div className="text-xs text-gray-500 mb-3 leading-relaxed">{opt.desc}</div>
                <div className="space-y-1">
                  {opt.features.map(f => (
                    <div key={f} className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="text-emerald-500">✓</span>{f}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 text-center">
            <label className="cursor-pointer text-xs text-emerald-700 hover:underline">
              Or upload a plan to get started immediately →
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleImageUpload}/>
            </label>
          </div>
        </div>
      </div>
    )
  }

  // ─── Main design tool ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-6 h-6 bg-emerald-700 rounded flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          {customer && <span className="text-xs text-gray-500 hidden sm:block">{customer.first_name} {customer.last_name}</span>}
          {/* Route tabs */}
          <div className="flex gap-1">
            {([['list','📋 List'],['canvas','✏️ Plan'],['upload','📐 Upload']] as const).map(([r, label]) => (
              <button key={r} onClick={() => setRoute(r as DesignRoute)}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${route === r ? 'bg-emerald-700 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Summary pills */}
          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-mono">{(totalW / 1000).toFixed(1)}kW</span>
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-mono font-semibold">{recKw}kW rec</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">SPF {spf} · {'★'.repeat(stars)}</span>
          </div>
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600 hidden sm:block">← Job</a>
          <button onClick={save} disabled={saving}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
            {saving ? '...' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* MCS strip */}
      <div className="bg-emerald-700 text-white px-4 py-1 flex items-center gap-3 text-xs flex-shrink-0">
        <span className="font-medium">MCS</span>
        <span>MIS 3005-D</span><span>MCS 031 v4.0</span><span>BS EN 12831-1:2017</span><span>MCS 020(a)</span>
        <span className="ml-auto text-emerald-200">{DESIGN_TEMPS[system.location]?.label} · {system.designTempExt}°C</span>
      </div>

      {/* Canvas toolbar */}
      {showCanvas && (
        <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex items-center gap-2 flex-wrap flex-shrink-0">
          <div className="flex gap-1">
            {([['select','↖','Select'],['draw','✏','Draw'],['pan','✋','Pan']] as const).map(([t, icon, label]) => (
              <button key={t} onClick={() => setCanvasTool(t as CanvasTool)} title={label}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${canvasTool === t ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'}`}>
                {icon}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-gray-200"/>
          <button onClick={() => canvasRef.current?.zoomIn()} className="text-xs px-2 py-1.5 border border-gray-200 rounded hover:bg-gray-50">+</button>
          <button onClick={() => canvasRef.current?.zoomOut()} className="text-xs px-2 py-1.5 border border-gray-200 rounded hover:bg-gray-50">−</button>
          <button onClick={() => canvasRef.current?.fitToScreen()} className="text-xs px-2 py-1.5 border border-gray-200 rounded hover:bg-gray-50">Fit</button>
          <div className="h-4 w-px bg-gray-200"/>
          <div className="flex gap-1">
            {floors.map(f => (
              <button key={f} onClick={() => setActiveFloor(f)}
                className={`text-xs px-2 py-1 rounded border ${activeFloor === f ? 'bg-emerald-700 text-white border-emerald-700' : 'border-gray-200 text-gray-600 hover:border-emerald-400'}`}>
                {f === 0 ? 'GF' : f === 1 ? 'FF' : f === 2 ? 'SF' : `F${f}`}
              </button>
            ))}
            <button onClick={() => setActiveFloor(floors.length)}
              className="text-xs px-2 py-1 border border-dashed border-gray-300 text-gray-400 rounded hover:border-emerald-400">+</button>
          </div>
          <div className="h-4 w-px bg-gray-200"/>
          <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} className="rounded"/> Grid
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showDimensions} onChange={e => setShowDimensions(e.target.checked)} className="rounded"/> Dims
          </label>
          <select className="text-xs border border-gray-200 rounded px-2 py-1" value={gridMm} onChange={e => setGridMm(parseInt(e.target.value))}>
            <option value={50}>50mm</option><option value={100}>100mm</option><option value={250}>250mm</option><option value={500}>500mm</option>
          </select>
          {route === 'upload' && (
            <label className="text-xs text-emerald-700 hover:underline cursor-pointer">
              Change plan<input type="file" accept="image/*,.pdf" className="hidden" onChange={handleImageUpload}/>
            </label>
          )}
          {selectedCanvasRoom && (
            <button onClick={() => canvasRef.current?.deleteSelected()} className="text-xs text-red-500 hover:text-red-700 ml-auto">Delete room</button>
          )}
        </div>
      )}

      {/* Content */}
      <div className={`flex flex-1 overflow-hidden ${showCanvas ? 'flex-col lg:flex-row' : ''}`}>

        {/* Canvas */}
        {showCanvas && (
          <div className="flex-1 min-h-0 lg:min-h-full" style={{ minHeight: showCanvas ? '45vh' : 0 }}>
            <FloorPlanCanvas
              ref={canvasRef}
              rooms={canvasRoomsWithLoss}
              activeFloor={activeFloor}
              tool={canvasTool}
              gridMm={gridMm}
              showGrid={showGrid}
              showDimensions={showDimensions}
              showHeatLoss={true}
              backgroundImage={route === 'upload' ? uploadImage || undefined : undefined}
              onRoomsChange={handleCanvasRoomsChange}
              onRoomSelect={handleCanvasRoomSelect}
              selectedRoomId={selectedCanvasRoom}
            />
          </div>
        )}

        {/* Right panel */}
        <div className={`bg-white border-t lg:border-t-0 lg:border-l border-gray-200 overflow-y-auto flex-shrink-0 ${showCanvas ? 'w-full lg:w-80 xl:w-96' : 'w-full max-w-3xl mx-auto'}`}>
          <div className="p-4 space-y-3">

            {/* Property settings (top of list route) */}
            {route === 'list' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Location</label>
                  <select className={sel} value={system.location} onChange={e => setSystem(prev => ({ ...prev, location: e.target.value, designTempExt: DESIGN_TEMPS[e.target.value]?.temp || -4 }))}>
                    {Object.entries(DESIGN_TEMPS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Design temp (°C)</label>
                  <input type="number" className={inp} value={system.designTempExt} step={0.5} onChange={e => setSystem(prev => ({ ...prev, designTempExt: parseFloat(e.target.value) }))}/>
                </div>
                <div>
                  <label className={lbl}>Default wall</label>
                  <select className={sel} value={defaultWallPreset} onChange={e => setDefaultWallPreset(e.target.value)}>
                    {Object.entries(WALL_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Flow / return (°C)</label>
                  <div className="flex gap-1">
                    <input type="number" className={inp} value={system.flowTemp} step={1} onChange={e => setSystem(prev => ({ ...prev, flowTemp: parseInt(e.target.value)||50 }))}/>
                    <input type="number" className={inp} value={system.returnTemp} step={1} onChange={e => setSystem(prev => ({ ...prev, returnTemp: parseInt(e.target.value)||40 }))}/>
                  </div>
                </div>
              </div>
            )}

            {/* Room list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-gray-700">
                  Rooms ({rooms.filter(r => !showCanvas || r.floor === activeFloor).length})
                  {showCanvas && <span className="text-gray-400 ml-1">· Floor {activeFloor === 0 ? 'GF' : activeFloor === 1 ? 'FF' : `F${activeFloor}`}</span>}
                </div>
                <button onClick={addRoom} className="text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-800">+ Add room</button>
              </div>

              {rooms.filter(r => !showCanvas || r.floor === activeFloor).map(room => (
                <div
                  key={room.id}
                  ref={el => { roomPanelRefs.current[room.id] = el }}
                  className={`border rounded-lg mb-2 overflow-hidden transition-colors ${room.canvasRoomId && room.canvasRoomId === selectedCanvasRoom ? 'border-emerald-400 shadow-sm' : 'border-gray-200'}`}
                >
                  {/* Room header */}
                  <div className={`flex items-center justify-between px-3 py-2 cursor-pointer ${room.canvasRoomId === selectedCanvasRoom ? 'bg-emerald-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                    onClick={() => {
                      setEditRoomId(editRoomId === room.id ? null : room.id)
                      if (room.canvasRoomId) setSelectedCanvasRoom(room.canvasRoomId)
                    }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-xs font-medium text-gray-900 truncate">{room.name || room.roomType}</div>
                      {room.name && <div className="text-xs text-gray-400 flex-shrink-0">{room.roomType}</div>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-bold text-emerald-700">{room.totalLossW}W</div>
                        <div className="text-xs text-gray-400">{(room.areaMm2 > 0 ? room.areaMm2 / 1_000_000 : room.lengthMm * room.widthMm / 1_000_000).toFixed(1)}m²</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); removeRoom(room.id) }} className="text-xs text-red-400 hover:text-red-600">✕</button>
                    </div>
                  </div>

                  {editRoomId === room.id && (
                    <div className="px-3 py-3 space-y-2 bg-white">
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className={lbl}>Name</label><input type="text" className={inp} value={room.name} placeholder={room.roomType} onChange={e => updRoom(room.id, { name: e.target.value })}/></div>
                        <div>
                          <label className={lbl}>Type ({ROOM_TEMPS[room.roomType] || 21}°C)</label>
                          <select className={sel} value={room.roomType} onChange={e => updRoom(room.id, { roomType: e.target.value })}>
                            {Object.entries(ROOM_TEMPS).map(([t, temp]) => <option key={t} value={t}>{t} ({temp}°C)</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div><label className={lbl}>L (mm)</label><input type="number" className={inp} value={room.lengthMm} step={100} onChange={e => updRoom(room.id, { lengthMm: parseInt(e.target.value)||0 })}/></div>
                        <div><label className={lbl}>W (mm)</label><input type="number" className={inp} value={room.widthMm} step={100} onChange={e => updRoom(room.id, { widthMm: parseInt(e.target.value)||0 })}/></div>
                        <div><label className={lbl}>H (mm)</label><input type="number" className={inp} value={room.heightMm} step={50} onChange={e => updRoom(room.id, { heightMm: parseInt(e.target.value)||0 })}/></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={lbl}>External wall</label>
                          <select className={sel} value={Object.entries(WALL_PRESETS).find(([, v]) => v.u === room.extWallU)?.[0] || 'custom'}
                            onChange={e => updRoom(room.id, { extWallU: WALL_PRESETS[e.target.value]?.u || room.extWallU })}>
                            {Object.entries(WALL_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={lbl}>Windows</label>
                          <select className={sel} value={Object.entries(WINDOW_PRESETS).find(([, v]) => v.u === room.windowU)?.[0] || 'custom'}
                            onChange={e => updRoom(room.id, { windowU: WINDOW_PRESETS[e.target.value]?.u || room.windowU })}>
                            {Object.entries(WINDOW_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={lbl}>Floor</label>
                          <select className={sel} value={room.floorAdj} onChange={e => updRoom(room.id, { floorAdj: e.target.value })}>
                            <option value="ground">Ground (10°C)</option>
                            <option value="heated">Heated space</option>
                            <option value="unheated">Unheated</option>
                          </select>
                        </div>
                        <div>
                          <label className={lbl}>Ceiling</label>
                          <select className={sel} value={room.ceilingAdj} onChange={e => updRoom(room.id, { ceilingAdj: e.target.value })}>
                            <option value="heated">Heated</option>
                            <option value="roof">Roof (outside)</option>
                            <option value="unheated">Unheated loft</option>
                          </select>
                        </div>
                        <div>
                          <label className={lbl}>ACH (0 = CIBSE default {ROOM_ACH[room.roomType] || 1.5})</label>
                          <input type="number" className={inp} value={room.achOverride ?? 0} step={0.1} onChange={e => { const v = parseFloat(e.target.value); updRoom(room.id, { achOverride: v > 0 ? v : null }) }}/>
                        </div>
                      </div>

                      {/* Result */}
                      <div className="bg-emerald-700 text-white rounded-lg p-2.5 grid grid-cols-3 gap-2 text-xs">
                        <div><div className="text-emerald-200">Fabric</div><div className="font-semibold">{room.fabricLossW}W</div></div>
                        <div><div className="text-emerald-200">Ventilation</div><div className="font-semibold">{room.ventLossW}W</div></div>
                        <div><div className="text-emerald-200">Total</div><div className="font-bold text-sm">{room.totalLossW}W</div></div>
                      </div>

                      {/* Radiator suggestion */}
                      <div>
                        <button onClick={() => setRadSuggestId(radSuggestId === room.id ? null : room.id)}
                          className="text-xs text-emerald-700 hover:underline">
                          {radSuggestId === room.id ? 'Hide radiators' : `Suggest Ultraheat radiators for ${room.totalLossW}W →`}
                        </button>
                        {radSuggestId === room.id && (
                          <div className="mt-2">
                            {(selectedRadiators[room.id] || []).map((sr, si) => {
                              const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.id)
                              if (!rad) return null
                              const out = radOutput(rad, deltaT)
                              return (
                                <div key={si} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 mb-1.5 text-xs">
                                  <div><span className="font-medium">{rad.type} H{rad.height_mm}×{rad.length_mm}mm</span><span className="text-emerald-700 ml-2">{out * sr.qty}W total</span></div>
                                  <div className="flex items-center gap-1">
                                    <input type="number" className="w-10 border border-gray-200 rounded px-1 py-0.5 text-xs" value={sr.qty} min={1} onChange={e => {
                                      const rads = [...(selectedRadiators[room.id] || [])]; rads[si] = { ...sr, qty: parseInt(e.target.value)||1 }
                                      setSelectedRadiators(prev => ({ ...prev, [room.id]: rads }))
                                    }}/>
                                    <button onClick={() => setSelectedRadiators(prev => ({ ...prev, [room.id]: (prev[room.id]||[]).filter((_,i)=>i!==si) }))} className="text-red-400 hover:text-red-600">✕</button>
                                  </div>
                                </div>
                              )
                            })}
                            <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto mt-1">
                              {ULTRAHEAT_RADIATORS.filter(r => {
                                const out = radOutput(r, deltaT)
                                return out >= room.totalLossW * 0.9 && out <= room.totalLossW * 2.5
                              }).sort((a, b) => Math.abs(radOutput(a,deltaT)-room.totalLossW) - Math.abs(radOutput(b,deltaT)-room.totalLossW))
                              .slice(0, 10).map(rad => {
                                const out = radOutput(rad, deltaT)
                                return (
                                  <button key={rad.id} onClick={() => setSelectedRadiators(prev => ({ ...prev, [room.id]: [...(prev[room.id]||[]), { id: rad.id, qty: 1 }] }))}
                                    className="text-left p-2 border border-gray-200 rounded hover:border-emerald-400 hover:bg-emerald-50">
                                    <div className="text-xs font-medium">{rad.type}</div>
                                    <div className="text-xs text-gray-500">H{rad.height_mm}×{rad.length_mm}mm</div>
                                    <div className="text-xs text-emerald-700 font-semibold">{out}W</div>
                                    <div className="text-xs text-gray-400">+{Math.round((out/room.totalLossW-1)*100)}%</div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Total */}
              {rooms.length > 0 && (
                <div className="bg-emerald-700 text-white rounded-lg p-3 text-xs grid grid-cols-2 gap-2 mt-2">
                  <div><div className="text-emerald-200">Total heat loss</div><div className="text-base font-bold">{(totalW/1000).toFixed(2)} kW</div></div>
                  <div><div className="text-emerald-200">Recommended ASHP</div><div className="text-base font-bold">{recKw} kW</div></div>
                  <div><div className="text-emerald-200">Specific loss</div><div className="font-semibold">{shl} W/m²</div></div>
                  <div><div className="text-emerald-200">SPF · Stars</div><div className="font-semibold">{spf} · {'★'.repeat(stars)}</div></div>
                </div>
              )}
            </div>

            {/* Continue button */}
            {rooms.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <a href={`/jobs/${jobId}/design/system`}
                  onClick={async e => { e.preventDefault(); await save(); window.location.href = `/jobs/${jobId}/design/system` }}
                  className="block w-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium py-2.5 rounded-lg text-center transition-colors">
                  Save & continue to system specification →
                </a>
                <div className="text-xs text-gray-400 text-center mt-1.5">
                  MCS 031 performance + noise check in next step
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}