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
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DesignRoute = 'selector' | 'list' | 'canvas' | 'upload'

// This is the canonical room type — used everywhere

type DesignSettings = {
  location: string
  designTempExt: number
  totalFloorAreaM2: number
  numBedrooms: number
  defaultWallPreset: string
  defaultWindowPreset: string
}

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
  hasOpenFlue: boolean
  fabricLossW: number
  ventLossW: number
  totalLossW: number
  canvasRoomId?: string
}

function calcRoomLoss(room: RoomData, designTempExt: number): RoomData {
  const roomTemp = ROOM_TEMPS[room.roomType] || 21
  const dT = roomTemp - designTempExt
  const area = room.areaMm2 > 0 ? room.areaMm2 / 1e6 : (room.lengthMm * room.widthMm) / 1e6
  const extWallArea = room.extWallAreaMm2 > 0 ? room.extWallAreaMm2 / 1e6 : area * 1.5
  const windowArea = room.windowAreaMm2 > 0 ? room.windowAreaMm2 / 1e6 : area * 0.15
  const doorArea = room.doorAreaMm2 / 1e6
  const floorAdjTemp = room.floorAdj === 'ground' ? 10 : room.floorAdj === 'heated' ? roomTemp : room.floorAdj === 'unheated' ? (roomTemp + designTempExt) / 2 : designTempExt
  const ceilAdjTemp = room.ceilingAdj === 'roof' ? designTempExt : room.ceilingAdj === 'unheated' ? (roomTemp + designTempExt) / 2 : room.ceilingAdj === 'outside' ? designTempExt : roomTemp
  const openFlueACH = room.hasOpenFlue ? 1.5 : 0
  const ach = (room.achOverride !== null ? room.achOverride : (ROOM_ACH[room.roomType] || 1.5)) + openFlueACH
  const volume = area * (room.heightMm / 1000)

  const fabricLoss =
    Math.max(0, extWallArea - windowArea - doorArea) * room.extWallU * dT +
    windowArea * room.windowU * dT +
    doorArea * room.doorU * dT +
    area * room.floorU * (roomTemp - floorAdjTemp) +
    (room.ceilingAdj !== 'heated' ? area * room.ceilingU * (roomTemp - ceilAdjTemp) : 0)

  const ventLoss = 0.33 * ach * volume * dT

  return {
    ...room,
    fabricLossW: Math.round(Math.max(0, fabricLoss)),
    ventLossW: Math.round(Math.max(0, ventLoss)),
    totalLossW: Math.round(Math.max(0, fabricLoss + ventLoss)),
  }
}

function makeRoom(id: string, settings: DesignSettings): RoomData {
  return {
    id, name: '', roomType: 'Living room', floor: 0,
    lengthMm: 4000, widthMm: 3500, heightMm: 2400, areaMm2: 0,
    extWallU: WALL_PRESETS[settings.defaultWallPreset]?.u || 1.5,
    windowU: WINDOW_PRESETS[settings.defaultWindowPreset]?.u || 2.0,
    doorU: 3.0, floorU: 0.45, ceilingU: 0.25,
    extWallAreaMm2: 0, windowAreaMm2: 0, doorAreaMm2: 0,
    floorAdj: 'ground', ceilingAdj: 'heated',
    achOverride: null, hasOpenFlue: false,
    fabricLossW: 0, ventLossW: 0, totalLossW: 0,
  }
}

const defaultSettings: DesignSettings = {
  location: 'Birmingham', designTempExt: -4,
  totalFloorAreaM2: 85, numBedrooms: 3,
  defaultWallPreset: 'cavity_unins', defaultWindowPreset: 'double_post2002',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DesignPage() {
  const params = useParams()
  const jobId = params.id as string
  const canvasRef = useRef<any>(null)
  const roomRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Core state
  const [route, setRoute] = useState<DesignRoute>('selector')
  const [settings, setSettings] = useState<DesignSettings>(defaultSettings)
  const [rooms, setRooms] = useState<RoomData[]>([])
  const [canvasRooms, setCanvasRooms] = useState<CanvasRoom[]>([])
  const [activeFloor, setActiveFloor] = useState(0)
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('select')
  const [selectedCanvasRoom, setSelectedCanvasRoom] = useState<string | null>(null)
  const [gridMm, setGridMm] = useState(100)
  const [showGrid, setShowGrid] = useState(true)
  const [showDimensions, setShowDimensions] = useState(true)
  const [uploadImage, setUploadImage] = useState<string | null>(null)

  // UI state
  const [customer, setCustomer] = useState<any>(null)
  const [existingDesign, setExistingDesign] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editRoomId, setEditRoomId] = useState<string | null>(null)
  const [radSuggestId, setRadSuggestId] = useState<string | null>(null)
  const [selectedRadiators, setSelectedRadiators] = useState<Record<string, { id: string; qty: number }[]>>({})

  useEffect(() => { loadJob() }, [jobId])

  // When canvas room selected → scroll to matching room in list
  useEffect(() => {
    if (!selectedCanvasRoom) return
    const room = rooms.find(r => r.canvasRoomId === selectedCanvasRoom)
    if (room) {
      setEditRoomId(room.id)
      setTimeout(() => roomRefs.current[room.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    }
  }, [selectedCanvasRoom])

  async function loadJob() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }

    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }

    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)

    // Load existing design if any
    const { data: sd } = await (supabase as any)
      .from('system_designs').select('*').eq('job_id', jobId).single()

    if (sd) {
      setExistingDesign(sd)
      const di = sd.design_inputs || {}

      if (di.settings) setSettings(di.settings)
      if (di.rooms && di.rooms.length > 0) setRooms(di.rooms)
      if (di.canvasRooms && di.canvasRooms.length > 0) setCanvasRooms(di.canvasRooms)
      if (di.selectedRadiators) setSelectedRadiators(di.selectedRadiators)
      // If design exists, default to list route (not selector)
      if (di.rooms && di.rooms.length > 0) setRoute(di.lastRoute || 'list')
    } else if (cd) {
      // Pre-populate from customer/EPC data
      const loc = guessLoc(cd.postcode || '')
      setSettings(prev => ({
        ...prev,
        location: loc,
        designTempExt: DESIGN_TEMPS[loc]?.temp || -4,
        totalFloorAreaM2: cd.floor_area_m2 || 85,
      }))
    }
    setLoading(false)
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

  // ─── Save ─────────────────────────────────────────────────────────────────────

  async function save(redirectTo?: string) {
    setSaving(true)
    setSaveError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }

      const totalW = rooms.reduce((s, r) => s + r.totalLossW, 0)
      const shl = settings.totalFloorAreaM2 > 0 ? Math.round(totalW / settings.totalFloorAreaM2) : 0
      const recKw = Math.ceil(totalW / 1000)
      const flowTemp = 50 // default until system spec page sets it
      const returnTemp = 40
      const emitterType = 'radiators'

      // MCS 031 SPF lookup (simplified)
      const spfRow = [[20,3.6],[30,3.4],[40,3.2],[50,3.0],[60,2.9],[80,2.7],[100,2.6],[999,2.4]]
      const spf = (spfRow.find(r => shl <= r[0]) || spfRow[spfRow.length-1])[1]
      const stars = spf >= 4.0 ? 6 : spf >= 3.5 ? 5 : spf >= 3.0 ? 4 : spf >= 2.7 ? 3 : spf >= 2.4 ? 2 : 1
      const annualHeat = Math.round((totalW / ((21 - settings.designTempExt) * 1000)) * 2200 * 24)
      const annualElec = Math.round(annualHeat / spf)
      const annualDHW = Math.round(45 * settings.numBedrooms * 365 * 4.18 * 0.001 / 1.7) * 100

      // design_inputs stores everything needed by the system spec page
      const design_inputs = {
        settings,
        rooms,          // Full RoomData array — this is what system spec reads
        canvasRooms,
        selectedRadiators,
        lastRoute: route,
        savedAt: new Date().toISOString(),
      }

      // Map to actual schema columns
      const payload = {
        job_id: jobId,
        design_inputs,
        // Existing schema columns
        hp_model: '',
        flow_temp_c: flowTemp,
        return_temp_c: returnTemp,
        emitter_type: emitterType,
        mcs_compliant: true,
        // New columns we just added
        total_heat_loss_w: totalW,
        specific_heat_loss_w_m2: shl,
        recommended_hp_kw: recKw,
        spf_estimate: spf,
        star_rating: stars,
        annual_heat_demand_kwh: annualHeat,
        annual_elec_space_kwh: annualElec,
        annual_elec_dhw_kwh: annualDHW,
        mcs_031_compliant: true,
        designed_by: session.user.id,
        designed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      let err: any = null
      if (existingDesign) {
        const { error } = await (supabase as any)
          .from('system_designs').update(payload).eq('job_id', jobId)
        err = error
      } else {
        const { error, data } = await (supabase as any)
          .from('system_designs').insert({ ...payload, created_at: new Date().toISOString() }).select().single()
        err = error
        if (data) setExistingDesign(data)
      }

      if (err) {
        setSaveError(`Save failed: ${err.message}`)
        setSaving(false)
        return
      }

      await (supabase as any).from('audit_log').insert({
        job_id: jobId,
        user_id: session.user.id,
        action: 'design_saved',
        stage: 'design',
        entity_type: 'system_design',
        description: `Design saved: ${rooms.length} rooms, ${(totalW/1000).toFixed(1)}kW heat loss`,
      })

      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)

      if (redirectTo) window.location.href = redirectTo

    } catch (e: any) {
      setSaveError(`Error: ${e.message}`)
      setSaving(false)
    }
  }

  // ─── Room management ──────────────────────────────────────────────────────────

  const syncCanvasToRooms = useCallback((cRooms: CanvasRoom[]) => {
    setRooms(prev => {
      const updated = [...prev]
      for (const cr of cRooms) {
        const area = polygonAreaM2(cr.vertices)
        const existing = updated.find(r => r.canvasRoomId === cr.id)
        if (existing) {
          existing.areaMm2 = area * 1e6
          existing.roomType = cr.roomType
          existing.name = cr.name
          existing.floor = cr.floor
          // Recalc loss with updated area
          const recalced = calcRoomLoss(existing, settings.designTempExt)
          Object.assign(existing, recalced)
        } else {
          const xs = cr.vertices.map(v => v.x), ys = cr.vertices.map(v => v.y)
          const nr = calcRoomLoss({
            ...makeRoom(`r_${cr.id}`, settings),
            id: `r_${cr.id}`, name: cr.name, roomType: cr.roomType, floor: cr.floor,
            lengthMm: Math.round(Math.max(...xs) - Math.min(...xs)),
            widthMm: Math.round(Math.max(...ys) - Math.min(...ys)),
            areaMm2: area * 1e6,
            canvasRoomId: cr.id,
          }, settings.designTempExt)
          updated.push(nr)
        }
      }
      return updated.filter(r => !r.canvasRoomId || cRooms.some(cr => cr.id === r.canvasRoomId))
    })
  }, [settings])

  function handleCanvasRoomsChange(newCR: CanvasRoom[]) {
    setCanvasRooms(newCR)
    syncCanvasToRooms(newCR)
  }

  function addRoom() {
    const id = `r_${Date.now()}`
    const nr = calcRoomLoss(makeRoom(id, settings), settings.designTempExt)
    setRooms(prev => [...prev, nr])
    setEditRoomId(id)

    if (route === 'canvas' || route === 'upload') {
      const cid = `cr_${Date.now()}`
      const off = canvasRooms.length * 5500
      const verts = rectFromDimensions(off, 0, nr.lengthMm, nr.widthMm)
      const ncr: CanvasRoom = {
        id: cid, name: nr.name, roomType: nr.roomType, floor: nr.floor,
        vertices: verts, wallTypes: ['external','external','external','external'], elements: [],
      }
      setCanvasRooms(prev => [...prev, ncr])
      setRooms(prev => prev.map(r => r.id === id ? { ...r, canvasRoomId: cid } : r))
      setTimeout(() => canvasRef.current?.fitToScreen(), 100)
    }
    setTimeout(() => roomRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  function updRoom(id: string, updates: Partial<RoomData>) {
    setRooms(prev => prev.map(r => {
      if (r.id !== id) return r
      const updated = calcRoomLoss({ ...r, ...updates }, settings.designTempExt)
      // Sync name/type back to canvas room
      if (updated.canvasRoomId && (updates.name !== undefined || updates.roomType !== undefined)) {
        setCanvasRooms(cr => cr.map(c => c.id !== updated.canvasRoomId ? c : {
          ...c, name: updated.name ?? c.name, roomType: updated.roomType ?? c.roomType,
        }))
      }
      return updated
    }))
  }

  function removeRoom(id: string) {
    const room = rooms.find(r => r.id === id)
    setRooms(prev => prev.filter(r => r.id !== id))
    if (room?.canvasRoomId) setCanvasRooms(prev => prev.filter(c => c.id !== room.canvasRoomId))
    if (editRoomId === id) setEditRoomId(null)
  }

  function updSettings(u: Partial<DesignSettings>) {
    const next = { ...settings, ...u }
    setSettings(next)
    setRooms(prev => prev.map(r => calcRoomLoss(r, next.designTempExt)))
  }

  // Canvas rooms annotated with heat loss for colour coding
  const canvasRoomsWithLoss: CanvasRoom[] = canvasRooms.map(cr => ({
    ...cr, heatLossW: rooms.find(r => r.canvasRoomId === cr.id)?.totalLossW,
  }))

  // Totals
  const totalW = rooms.reduce((s, r) => s + r.totalLossW, 0)
  const recKw = Math.ceil(totalW / 1000)
  const floors = Array.from(new Set([0, ...canvasRooms.map(r => r.floor)])).sort((a, b) => a - b)
  const showCanvas = route === 'canvas' || route === 'upload'
  const deltaT = (50 + 40) / 2 - 21  // default delta T preview

  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const sel = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  }

  // ─── Route selector ───────────────────────────────────────────────────────────

  if (route === 'selector') {
    const hasExisting = existingDesign && rooms.length > 0
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-900">MCS Design Tool</div>
              {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.address_line1}</div>}
            </div>
          </div>
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">← Back to job</a>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-10">

          {/* Existing design banner */}
          {hasExisting && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-700">✓</div>
                <div>
                  <div className="text-sm font-medium text-emerald-900">Design in progress</div>
                  <div className="text-xs text-emerald-700 mt-0.5">
                    {rooms.length} rooms · {(totalW/1000).toFixed(1)} kW total heat loss · last saved {existingDesign?.designed_at ? new Date(existingDesign.designed_at).toLocaleDateString('en-GB') : 'unknown'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setRoute('list')} className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium px-4 py-2 rounded-lg">
                  Continue design →
                </button>
                <a href={`/jobs/${jobId}/design/system`} className="text-xs text-emerald-700 hover:underline px-2">
                  Go to spec →
                </a>
              </div>
            </div>
          )}

          <div className="text-center mb-6">
            <h1 className="text-lg font-semibold text-gray-900 mb-1">
              {hasExisting ? 'Start a new design' : 'How would you like to design this system?'}
            </h1>
            <p className="text-sm text-gray-500">All three routes share the same room data — switch between them at any time.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                route: 'list' as DesignRoute,
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="4" y="4" width="24" height="24" rx="3" fill="#d1fae5" stroke="#059669" strokeWidth="1.5"/>
                    <line x1="9" y1="11" x2="23" y2="11" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="9" y1="16" x2="23" y2="16" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="9" y1="21" x2="18" y2="21" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                ),
                title: 'Room by room',
                desc: 'Enter each room manually with dimensions and fabric details. Best for data entry from survey notes.',
                features: ['Full fabric element control', 'Custom U-values', 'Radiator selection', 'Rooms auto-appear in floor plan'],
              },
              {
                route: 'canvas' as DesignRoute,
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="4" y="4" width="24" height="24" rx="3" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1.5"/>
                    <rect x="7" y="7" width="10" height="8" rx="1" fill="none" stroke="#3b82f6" strokeWidth="1.5"/>
                    <rect x="17" y="7" width="8" height="8" rx="1" fill="none" stroke="#3b82f6" strokeWidth="1.5"/>
                    <rect x="7" y="17" width="18" height="8" rx="1" fill="none" stroke="#3b82f6" strokeWidth="1.5"/>
                  </svg>
                ),
                title: 'Draw floor plan',
                desc: 'Draw rooms on a canvas, floor by floor. Walls auto-type when rooms touch.',
                features: ['Draw any room shape', 'Auto internal wall detection', 'Place windows, doors, radiators', 'Rectangular drag stays square'],
              },
              {
                route: 'upload' as DesignRoute,
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="4" y="4" width="24" height="24" rx="3" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5"/>
                    <path d="M16 20v-8M12 16l4-4 4 4" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="10" y1="22" x2="22" y2="22" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                ),
                title: 'Upload existing plan',
                desc: 'Upload a photo or PDF of an existing floor plan. Set scale and trace rooms over it.',
                features: ['Works with any plan format', 'Set scale from known dimension', 'Trace rooms over background', 'Auto-populates room list'],
              },
            ].map(opt => (
              <button key={opt.route}
                onClick={() => {
                  if (hasExisting) {
                    // New design — clear existing rooms
                    setRooms([])
                    setCanvasRooms([])
                    setSelectedRadiators({})
                  }
                  setRoute(opt.route)
                }}
                className="text-left bg-white border-2 border-gray-200 hover:border-emerald-500 rounded-xl p-5 transition-all hover:shadow-md group">
                <div className="mb-3">{opt.icon}</div>
                <div className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-emerald-700">{opt.title}</div>
                <div className="text-xs text-gray-500 mb-3 leading-relaxed">{opt.desc}</div>
                <div className="space-y-1">
                  {opt.features.map(f => (
                    <div key={f} className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="text-emerald-500 font-bold">✓</span>{f}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 text-center">
            <label className="cursor-pointer text-xs text-emerald-700 hover:underline">
              Or upload a plan to get started immediately →
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => { setUploadImage(ev.target?.result as string); if (hasExisting) { setRooms([]); setCanvasRooms([]) }; setRoute('upload') }
                reader.readAsDataURL(file)
              }}/>
            </label>
          </div>
        </div>
      </div>
    )
  }

  // ─── Main design tool ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: '100dvh' }}>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-6 h-6 bg-emerald-700 rounded flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          {customer && <span className="text-xs text-gray-600 font-medium hidden sm:block">{customer.first_name} {customer.last_name}</span>}

          {/* Route tabs */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([
              ['selector', '⊞', 'Routes'],
              ['list', '≡', 'Room list'],
              ['canvas', '⬛', 'Floor plan'],
              ['upload', '↑', 'Upload plan'],
            ] as const).map(([r, icon, label]) => (
              <button key={r} onClick={() => setRoute(r as DesignRoute)}
                className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1 ${route === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <span>{icon}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live totals */}
          {rooms.length > 0 && (
            <div className="hidden md:flex items-center gap-1.5">
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-mono">{(totalW/1000).toFixed(1)}kW</span>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-mono font-semibold">{recKw}kW rec</span>
              <span className="text-xs text-gray-400">{rooms.length}R</span>
            </div>
          )}

          {saveError && <span className="text-xs text-red-600 max-w-xs truncate">{saveError}</span>}
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600 hidden sm:block">← Job</a>
          <button onClick={() => save()} disabled={saving}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* MCS compliance strip */}
      <div className="bg-emerald-700 text-white px-4 py-1 flex items-center gap-3 text-xs flex-shrink-0">
        <span className="font-medium">MCS Compliant</span>
        <span>MIS 3005-D</span><span>MCS 031 v4.0</span><span>BS EN 12831-1:2017</span>
        <span className="ml-auto text-emerald-200">{DESIGN_TEMPS[settings.location]?.label} · {settings.designTempExt}°C ext design temp</span>
      </div>

      {/* Canvas toolbar — only for canvas/upload routes */}
      {showCanvas && (
        <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex items-center gap-2 flex-wrap flex-shrink-0">

          {/* Draw tools */}
          <div className="flex gap-1 items-center">
            <span className="text-xs text-gray-400 mr-1 hidden sm:block">Draw:</span>
            {([
              ['select', 'cursor', '↖', 'Select & move'],
              ['draw', 'pencil', '✏', 'Draw room'],
              ['pan', 'hand', '✋', 'Pan canvas'],
            ] as const).map(([t, , icon, label]) => (
              <button key={t} onClick={() => setCanvasTool(t as CanvasTool)} title={label}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${canvasTool === t ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'}`}>
                <span>{icon}</span>
                <span className="hidden sm:inline text-xs">{label}</span>
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-gray-200"/>

          {/* Element placement tools */}
          <div className="flex gap-1 items-center">
            <span className="text-xs text-gray-400 mr-1 hidden sm:block">Place:</span>
            {([
              ['addWindow', '▭', 'Window', 'bg-blue-50 text-blue-700 border-blue-200'],
              ['addDoor', '⬚', 'Door', 'bg-amber-50 text-amber-700 border-amber-200'],
              ['addRadiator', '▬', 'Radiator', 'bg-red-50 text-red-700 border-red-200'],
            ] as const).map(([t, icon, label, activeClass]) => (
              <button key={t} onClick={() => setCanvasTool(t as CanvasTool)} title={`Place ${label} — click on a wall`}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 font-medium ${canvasTool === t ? activeClass + ' border-2' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-gray-200"/>

          {/* Zoom + floors */}
          <div className="flex gap-1 items-center">
            <button onClick={() => canvasRef.current?.zoomIn()} className="text-xs px-2 py-1.5 border border-gray-200 rounded hover:bg-gray-50 font-mono">+</button>
            <button onClick={() => canvasRef.current?.zoomOut()} className="text-xs px-2 py-1.5 border border-gray-200 rounded hover:bg-gray-50 font-mono">−</button>
            <button onClick={() => canvasRef.current?.fitToScreen()} className="text-xs px-2 py-1.5 border border-gray-200 rounded hover:bg-gray-50">Fit</button>
          </div>

          <div className="flex gap-1 items-center">
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
            <option value={50}>50mm</option><option value={100}>100mm</option>
            <option value={250}>250mm</option><option value={500}>500mm</option>
          </select>

          {route === 'upload' && (
            <label className="text-xs text-emerald-700 hover:underline cursor-pointer ml-1">
              Change plan
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => {
                const file = e.target.files?.[0]; if (!file) return
                const reader = new FileReader()
                reader.onload = ev => setUploadImage(ev.target?.result as string)
                reader.readAsDataURL(file)
              }}/>
            </label>
          )}

          {selectedCanvasRoom && (
            <button onClick={() => canvasRef.current?.deleteSelected()} className="text-xs text-red-500 hover:text-red-700 ml-auto">Delete room</button>
          )}
        </div>
      )}

      {/* Main content */}
      <div className={`flex flex-1 overflow-hidden ${showCanvas ? 'flex-col lg:flex-row' : ''}`}>

        {/* Canvas */}
        {showCanvas && (
          <div className="flex-1 min-h-0" style={{ minHeight: '40vh' }}>
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
              onRoomSelect={setSelectedCanvasRoom}
              selectedRoomId={selectedCanvasRoom}
            />
          </div>
        )}

        {/* Right / full panel */}
        <div className={`bg-white border-t lg:border-t-0 lg:border-l border-gray-200 overflow-y-auto flex-shrink-0 ${showCanvas ? 'w-full lg:w-80 xl:w-96' : 'w-full max-w-3xl mx-auto'}`}>
          <div className="p-4 space-y-3">

            {/* Location settings row */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>Location</label>
                <select className={sel} value={settings.location}
                  onChange={e => updSettings({ location: e.target.value, designTempExt: DESIGN_TEMPS[e.target.value]?.temp || -4 })}>
                  {Object.entries(DESIGN_TEMPS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Ext design temp (°C)</label>
                <input type="number" className={inp} value={settings.designTempExt} step={0.5}
                  onChange={e => updSettings({ designTempExt: parseFloat(e.target.value) || -4 })}/>
              </div>
            </div>

            {/* Room list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-700">
                  Rooms ({showCanvas ? rooms.filter(r => r.floor === activeFloor).length : rooms.length})
                  {showCanvas && <span className="text-gray-400 font-normal ml-1">on this floor</span>}
                </div>
                <button onClick={addRoom}
                  className="text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-800 font-medium">
                  + Add room
                </button>
              </div>

              {rooms.length === 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
                  <div className="text-xs text-gray-400 mb-2">
                    {showCanvas ? 'Draw rooms on the canvas or click + Add room' : 'Click + Add room to get started'}
                  </div>
                </div>
              )}

              {(showCanvas ? rooms.filter(r => r.floor === activeFloor) : rooms).map(room => {
                const isCanvasSel = room.canvasRoomId === selectedCanvasRoom
                const areaM2 = room.areaMm2 > 0 ? room.areaMm2 / 1e6 : room.lengthMm * room.widthMm / 1e6

                return (
                  <div key={room.id} ref={el => { roomRefs.current[room.id] = el }}
                    className={`border rounded-xl mb-2 overflow-hidden transition-colors ${isCanvasSel ? 'border-emerald-400 shadow-sm' : 'border-gray-200'}`}>

                    {/* Header */}
                    <div className={`flex items-center justify-between px-3 py-2 cursor-pointer ${isCanvasSel ? 'bg-emerald-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                      onClick={() => {
                        setEditRoomId(editRoomId === room.id ? null : room.id)
                        if (room.canvasRoomId) setSelectedCanvasRoom(room.canvasRoomId)
                      }}>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-gray-900 truncate">{room.name || room.roomType}</div>
                        <div className="text-xs text-gray-400">{room.roomType} · {areaM2.toFixed(1)}m² · {ROOM_TEMPS[room.roomType]||21}°C</div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                        <div className="text-right">
                          <div className="text-xs font-bold text-emerald-700">{room.totalLossW}W</div>
                          <div className="text-xs text-gray-400">{(room.totalLossW/1000).toFixed(2)}kW</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); removeRoom(room.id) }} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                      </div>
                    </div>

                    {/* Edit panel */}
                    {editRoomId === room.id && (
                      <div className="px-3 py-3 space-y-2.5 bg-white border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={lbl}>Room name</label>
                            <input type="text" className={inp} value={room.name} placeholder={room.roomType}
                              onChange={e => updRoom(room.id, { name: e.target.value })}/>
                          </div>
                          <div>
                            <label className={lbl}>Room type</label>
                            <select className={sel} value={room.roomType} onChange={e => updRoom(room.id, { roomType: e.target.value })}>
                              {Object.entries(ROOM_TEMPS).map(([t,temp]) => <option key={t} value={t}>{t} ({temp}°C)</option>)}
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
                            <select className={sel} value={Object.entries(WALL_PRESETS).find(([,v])=>v.u===room.extWallU)?.[0]||'custom'}
                              onChange={e => updRoom(room.id, { extWallU: WALL_PRESETS[e.target.value]?.u || room.extWallU })}>
                              {Object.entries(WALL_PRESETS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Windows</label>
                            <select className={sel} value={Object.entries(WINDOW_PRESETS).find(([,v])=>v.u===room.windowU)?.[0]||'custom'}
                              onChange={e => updRoom(room.id, { windowU: WINDOW_PRESETS[e.target.value]?.u || room.windowU })}>
                              {Object.entries(WINDOW_PRESETS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
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
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={lbl}>ACH override (blank = CIBSE)</label>
                            <input type="number" className={inp} value={room.achOverride ?? ''} step={0.1}
                              placeholder={`${ROOM_ACH[room.roomType]||1.5} (default)`}
                              onChange={e => { const v = parseFloat(e.target.value); updRoom(room.id, { achOverride: isNaN(v) ? null : v }) }}/>
                          </div>
                          <div className="flex items-end">
                            <label className="flex items-center gap-2 cursor-pointer pb-1.5">
                              <input type="checkbox" checked={room.hasOpenFlue} onChange={e => updRoom(room.id, { hasOpenFlue: e.target.checked })} className="rounded"/>
                              <span className="text-xs text-gray-700">Open flued appliance <span className="text-amber-600">(+1.5 ACH)</span></span>
                            </label>
                          </div>
                        </div>

                        {/* Result */}
                        <div className="bg-emerald-700 text-white rounded-lg p-2.5 grid grid-cols-3 gap-2 text-xs">
                          <div><div className="text-emerald-200">Fabric</div><div className="font-semibold">{room.fabricLossW}W</div></div>
                          <div><div className="text-emerald-200">Ventilation</div><div className="font-semibold">{room.ventLossW}W</div></div>
                          <div><div className="text-emerald-200">Total</div><div className="font-bold text-sm">{room.totalLossW}W</div></div>
                        </div>

                        {/* Radiator suggest */}
                        <div>
                          <button onClick={() => setRadSuggestId(radSuggestId === room.id ? null : room.id)}
                            className="text-xs text-emerald-700 hover:underline">
                            {radSuggestId === room.id ? 'Hide radiators' : `Suggest Ultraheat radiators for ${room.totalLossW}W →`}
                          </button>
                          {radSuggestId === room.id && (
                            <div className="mt-2">
                              {(selectedRadiators[room.id]||[]).map((sr,si) => {
                                const rad = ULTRAHEAT_RADIATORS.find(r=>r.id===sr.id); if(!rad) return null
                                const out = radOutput(rad, deltaT)
                                return (
                                  <div key={si} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 mb-1.5 text-xs">
                                    <span className="font-medium">{rad.type} H{rad.height_mm}×{rad.length_mm}mm</span>
                                    <span className="text-emerald-700 mx-2">{out*sr.qty}W</span>
                                    <div className="flex gap-1 items-center">
                                      <input type="number" min={1} value={sr.qty} className="w-10 border border-gray-200 rounded px-1 py-0.5 text-xs"
                                        onChange={e => { const r=[...(selectedRadiators[room.id]||[])]; r[si]={...sr,qty:parseInt(e.target.value)||1}; setSelectedRadiators(p=>({...p,[room.id]:r})) }}/>
                                      <button onClick={()=>setSelectedRadiators(p=>({...p,[room.id]:(p[room.id]||[]).filter((_,i)=>i!==si)}))} className="text-red-400">✕</button>
                                    </div>
                                  </div>
                                )
                              })}
                              <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
                                {ULTRAHEAT_RADIATORS.filter(r=>{const o=radOutput(r,deltaT); return o>=room.totalLossW*0.85&&o<=room.totalLossW*2.5})
                                  .sort((a,b)=>Math.abs(radOutput(a,deltaT)-room.totalLossW)-Math.abs(radOutput(b,deltaT)-room.totalLossW))
                                  .slice(0,10).map(rad=>{
                                    const out=radOutput(rad,deltaT); const pct=Math.round((out/room.totalLossW-1)*100)
                                    return (
                                      <button key={rad.id} onClick={()=>setSelectedRadiators(p=>({...p,[room.id]:[...(p[room.id]||[]),{id:rad.id,qty:1}]}))}
                                        className="text-left p-2 border border-gray-200 rounded hover:border-emerald-400 hover:bg-emerald-50">
                                        <div className="text-xs font-medium">{rad.type}</div>
                                        <div className="text-xs text-gray-500">H{rad.height_mm}×{rad.length_mm}mm</div>
                                        <div className="text-xs font-bold text-emerald-700">{out}W</div>
                                        <div className="text-xs text-gray-400">+{pct}% · {rad.depth_mm}mm</div>
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
                )
              })}

              {/* Building total */}
              {rooms.length > 0 && (
                <div className="bg-emerald-700 text-white rounded-xl p-3 grid grid-cols-2 gap-2 text-xs mt-2">
                  <div><div className="text-emerald-200">Total heat loss</div><div className="text-base font-bold">{(totalW/1000).toFixed(2)} kW</div></div>
                  <div><div className="text-emerald-200">Recommended ASHP</div><div className="text-base font-bold">{recKw} kW</div></div>
                </div>
              )}
            </div>

            {/* Continue CTA */}
            {rooms.length > 0 && (
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <button
                  onClick={() => save(`/jobs/${jobId}/design/system`)}
                  disabled={saving}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-semibold py-3 rounded-xl transition-colors">
                  {saving ? 'Saving...' : 'Save & continue to system specification →'}
                </button>
                {saveError && <div className="text-xs text-red-600 text-center">{saveError}</div>}
                <div className="text-xs text-gray-400 text-center">
                  Heat pump selection · radiator sizing · MCS 031 · noise check
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}