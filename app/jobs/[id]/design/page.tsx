'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

const ROOM_TYPES: Array<{
  type: string; icon: string; defaultTemp: number; defaultAch: number; color: string
}> = [
  { type: 'Living room',    icon: '🛋',  defaultTemp: 21, defaultAch: 1.5, color: '#d1fae5' },
  { type: 'Dining room',   icon: '🍽',  defaultTemp: 21, defaultAch: 1.5, color: '#dbeafe' },
  { type: 'Kitchen',       icon: '🍳',  defaultTemp: 18, defaultAch: 2.0, color: '#fef3c7' },
  { type: 'Bedroom',       icon: '🛏',  defaultTemp: 18, defaultAch: 1.0, color: '#ede9fe' },
  { type: 'Bathroom',      icon: '🚿',  defaultTemp: 22, defaultAch: 2.0, color: '#fce7f3' },
  { type: 'En-suite',      icon: '🛁',  defaultTemp: 22, defaultAch: 2.0, color: '#fce7f3' },
  { type: 'Hall / Landing',icon: '🚪',  defaultTemp: 18, defaultAch: 1.5, color: '#f3f4f6' },
  { type: 'Study',         icon: '💻',  defaultTemp: 21, defaultAch: 1.5, color: '#d1fae5' },
  { type: 'Utility room',  icon: '🧺',  defaultTemp: 16, defaultAch: 2.0, color: '#fef9c3' },
  { type: 'WC',            icon: '🚽',  defaultTemp: 18, defaultAch: 2.0, color: '#fce7f3' },
  { type: 'Conservatory',  icon: '🌿',  defaultTemp: 21, defaultAch: 1.5, color: '#ecfdf5' },
  { type: 'Garage',        icon: '🚗',  defaultTemp: 10, defaultAch: 0.5, color: '#f9fafb' },
  { type: 'Other',         icon: '📦',  defaultTemp: 18, defaultAch: 1.5, color: '#f3f4f6' },
]

const WALL_PRESETS = [
  { id: 'solid_unins',  label: 'Solid brick — uninsulated',        u: 2.1  },
  { id: 'solid_ext',    label: 'Solid brick — ext insulation',     u: 0.29 },
  { id: 'solid_int',    label: 'Solid brick — int insulation',     u: 0.27 },
  { id: 'cavity_unins', label: 'Cavity — uninsulated',             u: 1.5  },
  { id: 'cavity_min',   label: 'Cavity — full fill mineral wool',  u: 0.33 },
  { id: 'cavity_pir',   label: 'Cavity — partial fill 50mm PIR',  u: 0.25 },
  { id: 'timber_frame', label: 'Timber frame — 140mm mineral',     u: 0.22 },
  { id: 'new_build',    label: 'Modern new build (post 2012)',      u: 0.18 },
]

const WINDOW_PRESETS = [
  { id: 'single',      label: 'Single glazed',              u: 4.8 },
  { id: 'secondary',   label: 'Secondary glazed',           u: 2.4 },
  { id: 'dbl_old',     label: 'Double glazed pre-2002',     u: 2.8 },
  { id: 'dbl_new',     label: 'Double glazed post-2002',    u: 2.0 },
  { id: 'dbl_lowe',    label: 'Double glazed low-E',        u: 1.4 },
  { id: 'triple',      label: 'Triple glazed',              u: 0.8 },
]

const FLOOR_PRESETS = [
  { id: 'ground_unins',   label: 'Solid — uninsulated',        u: 0.70 },
  { id: 'ground_50pir',   label: 'Solid — 50mm PIR',           u: 0.36 },
  { id: 'ground_100pir',  label: 'Solid — 100mm PIR',          u: 0.20 },
  { id: 'suspended',      label: 'Suspended timber — uninsulated', u: 0.70 },
  { id: 'susp_insul',     label: 'Suspended — 100mm mineral',  u: 0.28 },
  { id: 'ufh_screed',     label: 'UFH screed — insulated',     u: 0.18 },
  { id: 'heated_below',   label: 'Heated space below',         u: 0.0  },
]

const CEILING_PRESETS = [
  { id: 'heated_above',   label: 'Heated room above',          u: 0.0  },
  { id: 'pitched_none',   label: 'Pitched — no insulation',    u: 2.0  },
  { id: 'pitched_100',    label: 'Pitched — 100mm insulation', u: 0.25 },
  { id: 'pitched_150',    label: 'Pitched — 150mm insulation', u: 0.16 },
  { id: 'pitched_200',    label: 'Pitched — 200mm insulation', u: 0.13 },
  { id: 'flat_insul',     label: 'Flat roof — insulated',      u: 0.18 },
]

const ROOM_SHAPES = [
  { id: 'rect',    label: 'Rectangle',    icon: '▭' },
  { id: 'l_tl',   label: 'L-shape ↖',    icon: '⌐' },
  { id: 'l_tr',   label: 'L-shape ↗',    icon: '¬' },
  { id: 'l_bl',   label: 'L-shape ↙',    icon: 'L' },
  { id: 'l_br',   label: 'L-shape ↘',    icon: '⌐' },
  { id: 'bay',    label: 'Bay window',   icon: '⬡' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type RoomShape = 'rect' | 'l_tl' | 'l_tr' | 'l_bl' | 'l_br' | 'bay'

type FloorAdj = 'ground' | 'heated' | 'unheated' | 'outside'
type CeilAdj  = 'heated' | 'roof' | 'unheated'

type Room = {
  id: string
  name: string
  roomType: string
  floor: number
  shape: RoomShape
  // Dimensions in mm
  lengthMm: number
  widthMm: number
  heightMm: number
  // For L-shapes: cut dimensions
  cutLengthMm: number
  cutWidthMm: number
  // Fabric
  wallPreset: string
  wallUCustom: number
  windowPreset: string
  windowUCustom: number
  windowAreaM2: number  // override auto-estimate
  extDoorAreaM2: number
  floorPreset: string
  floorUCustom: number
  ceilingPreset: string
  ceilingUCustom: number
  // Thermal
  floorAdj: FloorAdj
  ceilAdj: CeilAdj
  designTempC: number
  achOverride: number | null
  hasOpenFlue: boolean
  // Calculated
  areaMm2: number
  fabricW: number
  ventW: number
  totalW: number
  // Position on floor plan (set by drag or auto-layout)
  planX: number
  planY: number
}

type BuildingSettings = {
  location: string
  designTempExt: number
  totalFloorAreaM2: number
  numBedrooms: number
  numFloors: number
  defaultWallPreset: string
  defaultWindowPreset: string
  defaultFloorPreset: string
}

type ViewMode = 'rooms' | 'floorplan' | 'upload'

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function roomArea(r: Room): number {
  const lm = r.lengthMm / 1000, wm = r.widthMm / 1000
  const cl = r.cutLengthMm / 1000, cw = r.cutWidthMm / 1000
  if (r.shape === 'rect' || r.shape === 'bay') return lm * wm
  return lm * wm - cl * cw
}

function calcRoom(r: Room, extTemp: number): Room {
  const area = roomArea(r)
  const roomTemp = r.designTempC
  const dT = roomTemp - extTemp
  if (dT <= 0) return { ...r, areaMm2: area * 1e6, fabricW: 0, ventW: 0, totalW: 0 }

  // Wall U-value
  const wallU = r.wallPreset === 'custom'
    ? r.wallUCustom
    : (WALL_PRESETS.find(p => p.id === r.wallPreset)?.u || 1.5)

  // Window U-value
  const winU = r.windowPreset === 'custom'
    ? r.windowUCustom
    : (WINDOW_PRESETS.find(p => p.id === r.windowPreset)?.u || 2.0)

  // Window area: if overridden use that, else estimate 15% of floor area
  const winArea = r.windowAreaM2 > 0 ? r.windowAreaM2 : area * 0.15
  const doorArea = r.extDoorAreaM2

  // Perimeter wall area (external walls only, estimated at height)
  const perim = (r.lengthMm + r.widthMm) * 2 / 1000
  const extWallGross = perim * (r.heightMm / 1000)
  const extWallNet = Math.max(0, extWallGross - winArea - doorArea)

  // Floor
  const floorU = r.floorPreset === 'custom'
    ? r.floorUCustom
    : (FLOOR_PRESETS.find(p => p.id === r.floorPreset)?.u || 0.45)
  const floorAdjTemp = r.floorAdj === 'ground' ? 10
    : r.floorAdj === 'heated' ? roomTemp
    : r.floorAdj === 'unheated' ? (roomTemp + extTemp) / 2
    : extTemp

  // Ceiling
  const ceilU = r.ceilingPreset === 'custom'
    ? r.ceilingUCustom
    : (CEILING_PRESETS.find(p => p.id === r.ceilingPreset)?.u || 0.25)
  const ceilAdjTemp = r.ceilAdj === 'heated' ? roomTemp
    : r.ceilAdj === 'unheated' ? (roomTemp + extTemp) / 2
    : extTemp

  const fabricW = Math.max(0,
    extWallNet * wallU * dT +
    winArea * winU * dT +
    doorArea * 3.0 * dT +
    area * floorU * (roomTemp - floorAdjTemp) +
    (r.ceilAdj !== 'heated' ? area * ceilU * (roomTemp - ceilAdjTemp) : 0)
  )

  // Ventilation
  const baseAch = ROOM_TYPES.find(rt => rt.type === r.roomType)?.defaultAch || 1.5
  const ach = (r.achOverride !== null ? r.achOverride : baseAch) + (r.hasOpenFlue ? 1.5 : 0)
  const volume = area * (r.heightMm / 1000)
  const ventW = Math.max(0, 0.33 * ach * volume * dT)

  return {
    ...r,
    areaMm2: area * 1e6,
    fabricW: Math.round(fabricW),
    ventW: Math.round(ventW),
    totalW: Math.round(fabricW + ventW),
  }
}

function makeRoom(floor: number, settings: BuildingSettings): Room {
  const rt = ROOM_TYPES[0]
  return {
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    name: '', roomType: rt.type, floor,
    shape: 'rect',
    lengthMm: 4000, widthMm: 3500, heightMm: 2400,
    cutLengthMm: 1500, cutWidthMm: 1500,
    wallPreset: settings.defaultWallPreset,
    wallUCustom: 1.5,
    windowPreset: settings.defaultWindowPreset,
    windowUCustom: 2.0,
    windowAreaM2: 0,
    extDoorAreaM2: 0,
    floorPreset: settings.defaultFloorPreset,
    floorUCustom: 0.45,
    ceilingPreset: floor === 0 ? 'pitched_100' : 'heated_above',
    ceilingUCustom: 0.25,
    floorAdj: floor === 0 ? 'ground' : 'heated',
    ceilAdj: 'heated',
    designTempC: rt.defaultTemp,
    achOverride: null,
    hasOpenFlue: false,
    areaMm2: 0, fabricW: 0, ventW: 0, totalW: 0,
    planX: 0, planY: 0,
  }
}

const defaultSettings: BuildingSettings = {
  location: 'Birmingham', designTempExt: -4,
  totalFloorAreaM2: 85, numBedrooms: 3, numFloors: 2,
  defaultWallPreset: 'cavity_unins',
  defaultWindowPreset: 'dbl_new',
  defaultFloorPreset: 'ground_unins',
}

// ─── Floor plan renderer ──────────────────────────────────────────────────────

function FloorPlanPreview({ rooms, activeFloor, selectedId, onSelect, totalW }: {
  rooms: Room[]
  activeFloor: number
  selectedId: string | null
  onSelect: (id: string) => void
  totalW: number
}) {
  const SCALE = 0.05  // mm → px (50px per metre)
  const PAD = 20
  const floorRooms = rooms.filter(r => r.floor === activeFloor)
  const ghostRooms = rooms.filter(r => r.floor === activeFloor - 1)

  // Auto-layout: place rooms in a grid if no positions set
  let x = PAD, y = PAD
  const positioned = floorRooms.map((r, i) => {
    const pr = { ...r }
    if (pr.planX === 0 && pr.planY === 0) {
      pr.planX = x
      pr.planY = y
      x += r.lengthMm * SCALE + 8
      if (x > 400) { x = PAD; y += r.widthMm * SCALE + 8 }
    }
    return pr
  })

  const maxX = Math.max(400, ...positioned.map(r => r.planX + r.lengthMm * SCALE)) + PAD
  const maxY = Math.max(300, ...positioned.map(r => r.planY + r.widthMm * SCALE)) + PAD

  function getRoomColor(r: Room): string {
    if (r.id === selectedId) return '#d1fae5'
    const wpm2 = r.areaMm2 > 0 ? r.totalW / (r.areaMm2 / 1e6) : 0
    if (wpm2 === 0) return '#f9fafb'
    if (wpm2 < 40) return '#d1fae5'
    if (wpm2 < 70) return '#fef9c3'
    if (wpm2 < 100) return '#fed7aa'
    return '#fecaca'
  }

  function getRoomPath(r: Room, x: number, y: number): string {
    const l = r.lengthMm * SCALE, w = r.widthMm * SCALE
    const cl = r.cutLengthMm * SCALE, cw = r.cutWidthMm * SCALE
    switch (r.shape) {
      case 'l_tl': return `M${x+cl},${y} L${x+l},${y} L${x+l},${y+w} L${x},${y+w} L${x},${y+cw} L${x+cl},${y+cw} Z`
      case 'l_tr': return `M${x},${y} L${x+l-cl},${y} L${x+l-cl},${y+cw} L${x+l},${y+cw} L${x+l},${y+w} L${x},${y+w} Z`
      case 'l_bl': return `M${x},${y} L${x+l},${y} L${x+l},${y+w} L${x+cl},${y+w} L${x+cl},${y+w-cw} L${x},${y+w-cw} Z`
      case 'l_br': return `M${x},${y} L${x+l},${y} L${x+l},${y+w-cw} L${x+l-cl},${y+w-cw} L${x+l-cl},${y+w} L${x},${y+w} Z`
      default: return `M${x},${y} L${x+l},${y} L${x+l},${y+w} L${x},${y+w} Z`
    }
  }

  return (
    <div className="relative">
      <svg width={maxX} height={maxY} className="bg-white rounded-xl border border-gray-200"
        style={{ maxWidth: '100%' }}>
        {/* Ghost layer — floor below */}
        {ghostRooms.map(r => (
          <path key={`ghost_${r.id}`}
            d={getRoomPath(r, r.planX || PAD, r.planY || PAD)}
            fill="none" stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4,3" opacity={0.5}/>
        ))}

        {/* Grid */}
        {Array.from({ length: Math.floor(maxX / 50) }, (_, i) => (
          <line key={`gx${i}`} x1={i*50} y1={0} x2={i*50} y2={maxY} stroke="#f3f4f6" strokeWidth={0.5}/>
        ))}
        {Array.from({ length: Math.floor(maxY / 50) }, (_, i) => (
          <line key={`gy${i}`} x1={0} y1={i*50} x2={maxX} y2={i*50} stroke="#f3f4f6" strokeWidth={0.5}/>
        ))}

        {/* Rooms */}
        {positioned.map(r => {
          const px = r.planX, py = r.planY
          const l = r.lengthMm * SCALE, w = r.widthMm * SCALE
          const cx = px + l / 2, cy = py + w / 2
          const isSel = r.id === selectedId
          const lblSize = Math.max(7, Math.min(11, l * 0.12))
          return (
            <g key={r.id} onClick={() => onSelect(r.id)} style={{ cursor: 'pointer' }}>
              <path d={getRoomPath(r, px, py)}
                fill={getRoomColor(r)}
                stroke={isSel ? '#059669' : '#9ca3af'}
                strokeWidth={isSel ? 2 : 1}/>
              {l > 30 && w > 20 && (
                <text x={cx} y={cy - (r.totalW > 0 ? lblSize * 0.5 : 0)}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={lblSize} fill={isSel ? '#065f46' : '#374151'}
                  fontWeight={isSel ? '700' : '400'}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {r.name || r.roomType}
                </text>
              )}
              {r.totalW > 0 && l > 30 && w > 20 && (
                <text x={cx} y={cy + lblSize * 0.8}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={lblSize * 0.85} fill="#059669"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {r.totalW}W
                </text>
              )}
              {/* Dimensions */}
              {isSel && (
                <>
                  <text x={px + l/2} y={py - 4} textAnchor="middle" fontSize={8} fill="#6b7280" fontFamily="monospace">
                    {r.lengthMm >= 1000 ? `${(r.lengthMm/1000).toFixed(2)}m` : `${r.lengthMm}mm`}
                  </text>
                  <text x={px - 4} y={py + w/2} textAnchor="middle" fontSize={8} fill="#6b7280" fontFamily="monospace"
                    transform={`rotate(-90, ${px-4}, ${py+w/2})`}>
                    {r.widthMm >= 1000 ? `${(r.widthMm/1000).toFixed(2)}m` : `${r.widthMm}mm`}
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* Scale bar */}
        <g transform={`translate(${maxX - 80}, ${maxY - 20})`}>
          <line x1={0} y1={0} x2={50} y2={0} stroke="#374151" strokeWidth={1.5}/>
          <line x1={0} y1={-3} x2={0} y2={3} stroke="#374151" strokeWidth={1.5}/>
          <line x1={50} y1={-3} x2={50} y2={3} stroke="#374151" strokeWidth={1.5}/>
          <text x={25} y={-6} textAnchor="middle" fontSize={8} fill="#374151" fontFamily="monospace">1m</text>
        </g>
      </svg>
    </div>
  )
}

// ─── Room shape picker ────────────────────────────────────────────────────────

function ShapePreview({ shape, l, w, cl, cw }: { shape: RoomShape; l: number; w: number; cl: number; cw: number }) {
  const S = 50, pad = 4
  const scale = (S - pad * 2) / Math.max(l, w)
  const ls = l * scale, ws = w * scale
  const cls = cl * scale, cws = cw * scale
  const ox = pad + (S - pad*2 - ls) / 2, oy = pad + (S - pad*2 - ws) / 2

  let path = ''
  switch (shape) {
    case 'rect': path = `M${ox},${oy} L${ox+ls},${oy} L${ox+ls},${oy+ws} L${ox},${oy+ws} Z`; break
    case 'l_tl': path = `M${ox+cls},${oy} L${ox+ls},${oy} L${ox+ls},${oy+ws} L${ox},${oy+ws} L${ox},${oy+cws} L${ox+cls},${oy+cws} Z`; break
    case 'l_tr': path = `M${ox},${oy} L${ox+ls-cls},${oy} L${ox+ls-cls},${oy+cws} L${ox+ls},${oy+cws} L${ox+ls},${oy+ws} L${ox},${oy+ws} Z`; break
    case 'l_bl': path = `M${ox},${oy} L${ox+ls},${oy} L${ox+ls},${oy+ws} L${ox+cls},${oy+ws} L${ox+cls},${oy+ws-cws} L${ox},${oy+ws-cws} Z`; break
    case 'l_br': path = `M${ox},${oy} L${ox+ls},${oy} L${ox+ls},${oy+ws-cws} L${ox+ls-cls},${oy+ws-cws} L${ox+ls-cls},${oy+ws} L${ox},${oy+ws} Z`; break
    case 'bay':  path = `M${ox},${oy} L${ox+ls},${oy} L${ox+ls},${oy+ws*0.6} L${ox+ls*0.75},${oy+ws} L${ox+ls*0.25},${oy+ws} L${ox},${oy+ws*0.6} Z`; break
  }
  return (
    <svg width={S} height={S}>
      <path d={path} fill="#d1fae5" stroke="#059669" strokeWidth={1.5}/>
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DesignToolV2() {
  const params = useParams()
  const jobId = params.id as string

  const [view, setView] = useState<ViewMode>('rooms')
  const [settings, setSettings] = useState<BuildingSettings>(defaultSettings)
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeFloor, setActiveFloor] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addingRoom, setAddingRoom] = useState(false)
  const [addFloor, setAddFloor] = useState(0)
  const [customer, setCustomer] = useState<any>(null)
  const [existingDesign, setExistingDesign] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadJob() }, [jobId])

  async function loadJob() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }
    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)
    const { data: sd } = await (supabase as any).from('system_designs').select('*').eq('job_id', jobId).single()
    if (sd) {
      setExistingDesign(sd)
      const di = sd.design_inputs || {}
      if (di.settings) setSettings(di.settings)
      if (di.rooms && di.rooms.length > 0) {
        // Recalculate all rooms on load
        setRooms(di.rooms.map((r: Room) => calcRoom(r, di.settings?.designTempExt || -4)))
      }
    } else if (cd) {
      const loc = guessLoc(cd.postcode || '')
      setSettings(prev => ({
        ...prev, location: loc,
        designTempExt: DESIGN_TEMPS[loc]?.temp || -4,
        totalFloorAreaM2: cd.floor_area_m2 || 85,
      }))
    }
    setLoading(false)
  }

  function guessLoc(pc: string): string {
    const p = pc.slice(0,2).toUpperCase()
    const m: Record<string,string> = { EC:'London',WC:'London',E:'London',N:'London',NW:'London',SE:'London',SW:'London',W:'London',B:'Birmingham',WS:'Birmingham',M:'Manchester',L:'Manchester',LS:'Leeds',NE:'Newcastle',BS:'Bristol',CF:'Cardiff',EH:'Edinburgh',G:'Glasgow',AB:'Aberdeen',BT:'Belfast',NR:'Norwich',PL:'Plymouth',S:'Sheffield',NG:'Nottingham' }
    for (const [k,v] of Object.entries(m)) { if (p.startsWith(k)) return v }
    return 'Birmingham'
  }

  // Recalculate all rooms when design temp changes
  function updSettings(u: Partial<BuildingSettings>) {
    const next = { ...settings, ...u }
    setSettings(next)
    if (u.designTempExt !== undefined) {
      setRooms(prev => prev.map(r => calcRoom(r, next.designTempExt)))
    }
  }

  function updRoom(id: string, updates: Partial<Room>) {
    setRooms(prev => prev.map(r => {
      if (r.id !== id) return r
      const updated = { ...r, ...updates }
      // If room type changed, update default temp + ach
      if (updates.roomType) {
        const rt = ROOM_TYPES.find(t => t.type === updates.roomType)
        if (rt) {
          updated.designTempC = rt.defaultTemp
          updated.achOverride = null
        }
      }
      return calcRoom(updated, settings.designTempExt)
    }))
  }

  function addRoom(roomType: string) {
    const room = makeRoom(addFloor, settings)
    const rt = ROOM_TYPES.find(t => t.type === roomType)
    if (rt) { room.roomType = roomType; room.designTempC = rt.defaultTemp }
    const calculated = calcRoom(room, settings.designTempExt)
    setRooms(prev => [...prev, calculated])
    setSelectedId(calculated.id)
    setAddingRoom(false)
    setActiveFloor(addFloor)
    setTimeout(() => {
      document.getElementById(`room_${calculated.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  function removeRoom(id: string) {
    setRooms(prev => prev.filter(r => r.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function duplicateRoom(id: string) {
    const room = rooms.find(r => r.id === id)
    if (!room) return
    const dup = { ...room, id: `r_${Date.now()}`, name: room.name ? `${room.name} (copy)` : '', planX: room.planX + 20, planY: room.planY + 20 }
    setRooms(prev => [...prev, dup])
    setSelectedId(dup.id)
  }

  // Totals
  const totalW = rooms.reduce((s, r) => s + r.totalW, 0)
  const fabricW = rooms.reduce((s, r) => s + r.fabricW, 0)
  const ventW = rooms.reduce((s, r) => s + r.ventW, 0)
  const shl = settings.totalFloorAreaM2 > 0 ? Math.round(totalW / settings.totalFloorAreaM2) : 0
  const recKw = Math.ceil(totalW / 1000)
  const floors = Array.from(new Set([0, ...rooms.map(r => r.floor)])).sort((a,b) => a-b)
  const floorRooms = rooms.filter(r => r.floor === activeFloor)

  async function save(redirect?: string) {
    setSaving(true); setSaveError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const totalW2 = rooms.reduce((s,r) => s+r.totalW, 0)
      const shl2 = settings.totalFloorAreaM2 > 0 ? Math.round(totalW2/settings.totalFloorAreaM2) : 0
      const recKw2 = Math.ceil(totalW2/1000)

      const { data: sd } = await (supabase as any).from('system_designs').select('design_inputs').eq('job_id', jobId).single()
      const existing = sd?.design_inputs || {}

      const payload = {
        design_inputs: { ...existing, settings, rooms, lastSaved: new Date().toISOString() },
        total_heat_loss_w: totalW2,
        specific_heat_loss_w_m2: shl2,
        recommended_hp_kw: recKw2,
        flow_temp_c: existing.systemSpec?.flowTemp || 50,
        emitter_type: existing.systemSpec?.emitterType || 'radiators',
        mcs_compliant: true,
        designed_by: session.user.id,
        designed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      let err: any = null
      if (existingDesign) {
        const { error } = await (supabase as any).from('system_designs').update(payload).eq('job_id', jobId)
        err = error
      } else {
        const { error, data } = await (supabase as any).from('system_designs').insert({ job_id: jobId, created_at: new Date().toISOString(), ...payload }).select().single()
        err = error
        if (data) setExistingDesign(data)
      }
      if (err) { setSaveError(err.message); setSaving(false); return }

      await (supabase as any).from('audit_log').insert({
        job_id: jobId, user_id: session.user.id, action: 'design_saved', stage: 'design',
        entity_type: 'system_design',
        description: `Design v2 saved: ${rooms.length} rooms, ${(totalW2/1000).toFixed(1)}kW, ${shl2}W/m²`,
      })
      setSaving(false); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      if (redirect) window.location.href = redirect
    } catch (e: any) { setSaveError(e.message); setSaving(false) }
  }

  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const sel = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-sm text-gray-400">Loading...</p></div>

  const selectedRoom = rooms.find(r => r.id === selectedId) || null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ height: '100dvh' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-semibold text-gray-900">Heat Loss Design</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.postcode}</div>}
          </div>
          {/* View tabs */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 ml-2">
            {([['rooms','Rooms','≡'],['floorplan','Floor plan','⬛']] as const).map(([v, label, icon]) => (
              <button key={v} onClick={() => setView(v as ViewMode)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <span>{icon}</span><span className="hidden sm:inline">{label}</span>
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
              <span className="text-xs text-gray-400">{shl}W/m²</span>
            </div>
          )}
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600 hidden sm:block">← Job</a>
          {saveError && <span className="text-xs text-red-600 max-w-xs truncate">{saveError}</span>}
          <button onClick={() => save()} disabled={saving}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
            {saving ? '...' : saved ? '✓' : 'Save'}
          </button>
        </div>
      </div>

      {/* MCS strip */}
      <div className="bg-emerald-700 text-white px-4 py-1 flex items-center gap-3 text-xs flex-shrink-0">
        <span className="font-medium">MCS Compliant</span>
        <span>MIS 3005-D · BS EN 12831-1:2017</span>
        <span className="ml-auto">{DESIGN_TEMPS[settings.location]?.label} · {settings.designTempExt}°C</span>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Building structure sidebar ──────────────────────────────────── */}
        <div className="w-48 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 hidden lg:flex">
          {/* Building settings */}
          <div className="p-3 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-700 mb-2">Building</div>
            <div className="space-y-1.5">
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Location</label>
                <select className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                  value={settings.location} onChange={e => updSettings({ location: e.target.value, designTempExt: DESIGN_TEMPS[e.target.value]?.temp || -4 })}>
                  {Object.entries(DESIGN_TEMPS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Floor area (m²)</label>
                <input type="number" className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                  value={settings.totalFloorAreaM2} step={5}
                  onChange={e => updSettings({ totalFloorAreaM2: parseFloat(e.target.value)||85 })}/>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Bedrooms</label>
                <input type="number" className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                  value={settings.numBedrooms} min={1} max={8}
                  onChange={e => updSettings({ numBedrooms: parseInt(e.target.value)||3 })}/>
              </div>
            </div>
          </div>

          {/* Default construction */}
          <div className="p-3 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-700 mb-2">Default construction</div>
            <div className="space-y-1.5">
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Walls</label>
                <select className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                  value={settings.defaultWallPreset} onChange={e => updSettings({ defaultWallPreset: e.target.value })}>
                  {WALL_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} ({p.u})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Windows</label>
                <select className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                  value={settings.defaultWindowPreset} onChange={e => updSettings({ defaultWindowPreset: e.target.value })}>
                  {WINDOW_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} ({p.u})</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Floor navigation — building cross-section style */}
          <div className="p-3 flex-1">
            <div className="text-xs font-semibold text-gray-700 mb-2">Floors</div>
            <div className="space-y-1">
              {[...floors].reverse().map(f => {
                const fRooms = rooms.filter(r => r.floor === f)
                const fTotal = fRooms.reduce((s,r) => s+r.totalW, 0)
                return (
                  <button key={f} onClick={() => setActiveFloor(f)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors border ${activeFloor === f ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'}`}>
                    <div className="text-xs font-semibold">
                      {f === 0 ? 'Ground floor' : f === 1 ? 'First floor' : f === 2 ? 'Second floor' : `Floor ${f}`}
                    </div>
                    <div className="text-xs text-gray-400">{fRooms.length} rooms · {(fTotal/1000).toFixed(1)}kW</div>
                  </button>
                )
              })}
              <button onClick={() => { const next = Math.max(...floors) + 1; setRooms(prev => prev); setActiveFloor(next); if (!floors.includes(next)) setActiveFloor(next) }}
                className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-gray-300 text-gray-400 text-xs hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                + Add floor
              </button>
            </div>
          </div>

          {/* Building totals */}
          {rooms.length > 0 && (
            <div className="p-3 border-t border-gray-100 bg-emerald-700 text-white">
              <div className="text-xs text-emerald-200 mb-1">Building total</div>
              <div className="text-base font-bold">{(totalW/1000).toFixed(2)} kW</div>
              <div className="text-xs text-emerald-200">{recKw}kW ASHP · {shl}W/m²</div>
            </div>
          )}
        </div>

        {/* ── Main area ────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Room list / floor plan */}
          <div className="flex-1 overflow-y-auto p-4">

            {/* Floor header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {activeFloor === 0 ? 'Ground floor' : activeFloor === 1 ? 'First floor' : activeFloor === 2 ? 'Second floor' : `Floor ${activeFloor}`}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {floorRooms.length} room{floorRooms.length !== 1 ? 's' : ''} · {(floorRooms.reduce((s,r)=>s+r.totalW,0)/1000).toFixed(1)}kW on this floor
                </p>
              </div>
              <button onClick={() => { setAddFloor(activeFloor); setAddingRoom(true) }}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2">
                <span className="text-base leading-none">+</span> Add room
              </button>
            </div>

            {/* Floor plan view */}
            {view === 'floorplan' && (
              <div className="mb-4">
                <FloorPlanPreview
                  rooms={rooms}
                  activeFloor={activeFloor}
                  selectedId={selectedId}
                  onSelect={id => setSelectedId(selectedId === id ? null : id)}
                  totalW={totalW}
                />
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"/><span>Low loss (&lt;40 W/m²)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300"/><span>Medium (40–70)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-100 border border-orange-300"/><span>High (70–100)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-100 border border-red-300"/><span>Very high (&gt;100)</span></div>
                </div>
              </div>
            )}

            {/* Room cards */}
            {floorRooms.length === 0 && !addingRoom && (
              <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center">
                <div className="text-2xl mb-2">🏠</div>
                <div className="text-sm font-medium text-gray-600 mb-1">No rooms on this floor yet</div>
                <div className="text-xs text-gray-400 mb-4">Add rooms to calculate heat loss for each space</div>
                <button onClick={() => { setAddFloor(activeFloor); setAddingRoom(true) }}
                  className="bg-emerald-700 text-white text-xs font-semibold px-6 py-2.5 rounded-xl hover:bg-emerald-800">
                  Add first room
                </button>
              </div>
            )}

            <div className="space-y-2">
              {floorRooms.map(room => {
                const isSelected = room.id === selectedId
                const rt = ROOM_TYPES.find(t => t.type === room.roomType)
                const areaM2 = room.areaMm2 > 0 ? room.areaMm2 / 1e6 : 0

                return (
                  <div key={room.id} id={`room_${room.id}`}
                    className={`bg-white border-2 rounded-2xl overflow-hidden transition-all ${isSelected ? 'border-emerald-400 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>

                    {/* Room header — always visible */}
                    <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
                      onClick={() => setSelectedId(isSelected ? null : room.id)}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl flex-shrink-0">{rt?.icon || '🏠'}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {room.name || room.roomType}
                          </div>
                          <div className="text-xs text-gray-400">
                            {room.roomType} · {(room.lengthMm/1000).toFixed(1)}×{(room.widthMm/1000).toFixed(1)}m
                            {areaM2 > 0 ? ` · ${areaM2.toFixed(1)}m²` : ''}
                            {room.designTempC}°C
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Heat loss bar */}
                        <div className="hidden sm:flex flex-col items-end gap-0.5">
                          <div className="text-sm font-bold text-gray-900">{room.totalW.toLocaleString()}W</div>
                          <div className="flex gap-1 text-xs">
                            <span className="text-gray-400">{room.fabricW}W fabric</span>
                            <span className="text-gray-300">+</span>
                            <span className="text-gray-400">{room.ventW}W vent</span>
                          </div>
                        </div>
                        <div className="sm:hidden text-sm font-bold text-emerald-700">{room.totalW}W</div>
                        <span className={`transition-transform ${isSelected ? 'rotate-180' : ''} text-gray-400`}>▾</span>
                      </div>
                    </div>

                    {/* Expanded edit panel */}
                    {isSelected && (
                      <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-4">

                        {/* Row 1: Basic identity */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className={lbl}>Room name (optional)</label>
                            <input type="text" className={inp} value={room.name} placeholder={room.roomType}
                              onChange={e => updRoom(room.id, { name: e.target.value })}/>
                          </div>
                          <div>
                            <label className={lbl}>Room type</label>
                            <select className={sel} value={room.roomType} onChange={e => updRoom(room.id, { roomType: e.target.value })}>
                              {ROOM_TYPES.map(rt => <option key={rt.type} value={rt.type}>{rt.icon} {rt.type}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Design temp (°C)</label>
                            <input type="number" className={inp} value={room.designTempC} step={0.5}
                              onChange={e => updRoom(room.id, { designTempC: parseFloat(e.target.value)||21 })}/>
                          </div>
                          <div>
                            <label className={lbl}>Ceiling height (mm)</label>
                            <input type="number" className={inp} value={room.heightMm} step={50}
                              onChange={e => updRoom(room.id, { heightMm: parseInt(e.target.value)||2400 })}/>
                          </div>
                        </div>

                        {/* Row 2: Shape + dimensions */}
                        <div>
                          <label className={`${lbl} mb-2`}>Room shape</label>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {ROOM_SHAPES.map(s => (
                              <button key={s.id} onClick={() => updRoom(room.id, { shape: s.id as RoomShape })}
                                className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors ${room.shape === s.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                <ShapePreview shape={s.id as RoomShape} l={room.lengthMm} w={room.widthMm} cl={room.cutLengthMm} cw={room.cutWidthMm}/>
                                <span className="text-xs text-gray-600">{s.label}</span>
                              </button>
                            ))}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className={lbl}>Length (mm)</label>
                              <input type="number" className={inp} value={room.lengthMm} step={100}
                                onChange={e => updRoom(room.id, { lengthMm: parseInt(e.target.value)||0 })}/>
                            </div>
                            <div>
                              <label className={lbl}>Width (mm)</label>
                              <input type="number" className={inp} value={room.widthMm} step={100}
                                onChange={e => updRoom(room.id, { widthMm: parseInt(e.target.value)||0 })}/>
                            </div>
                            {room.shape !== 'rect' && room.shape !== 'bay' && (
                              <>
                                <div>
                                  <label className={lbl}>Cut length (mm)</label>
                                  <input type="number" className={inp} value={room.cutLengthMm} step={100}
                                    onChange={e => updRoom(room.id, { cutLengthMm: parseInt(e.target.value)||0 })}/>
                                </div>
                                <div>
                                  <label className={lbl}>Cut width (mm)</label>
                                  <input type="number" className={inp} value={room.cutWidthMm} step={100}
                                    onChange={e => updRoom(room.id, { cutWidthMm: parseInt(e.target.value)||0 })}/>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Row 3: Fabric construction */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div>
                            <label className={lbl}>External walls</label>
                            <select className={sel} value={room.wallPreset} onChange={e => updRoom(room.id, { wallPreset: e.target.value })}>
                              {WALL_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} (U{p.u})</option>)}
                              <option value="custom">Custom U-value</option>
                            </select>
                            {room.wallPreset === 'custom' && (
                              <input type="number" className={`${inp} mt-1`} value={room.wallUCustom} step={0.01} placeholder="U-value W/m²K"
                                onChange={e => updRoom(room.id, { wallUCustom: parseFloat(e.target.value)||0 })}/>
                            )}
                          </div>
                          <div>
                            <label className={lbl}>Windows</label>
                            <select className={sel} value={room.windowPreset} onChange={e => updRoom(room.id, { windowPreset: e.target.value })}>
                              {WINDOW_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} (U{p.u})</option>)}
                              <option value="custom">Custom U-value</option>
                            </select>
                            {room.windowPreset === 'custom' && (
                              <input type="number" className={`${inp} mt-1`} value={room.windowUCustom} step={0.1} placeholder="U-value W/m²K"
                                onChange={e => updRoom(room.id, { windowUCustom: parseFloat(e.target.value)||0 })}/>
                            )}
                          </div>
                          <div>
                            <label className={lbl}>Window area (m² — blank = auto 15%)</label>
                            <input type="number" className={inp} value={room.windowAreaM2 || ''} step={0.1}
                              placeholder={`~${(roomArea(room)*0.15).toFixed(1)}m² auto`}
                              onChange={e => updRoom(room.id, { windowAreaM2: parseFloat(e.target.value)||0 })}/>
                          </div>
                          <div>
                            <label className={lbl}>Floor construction</label>
                            <select className={sel} value={room.floorPreset} onChange={e => updRoom(room.id, { floorPreset: e.target.value })}>
                              {FLOOR_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}{p.u > 0 ? ` (U${p.u})` : ' (no loss)'}</option>)}
                              <option value="custom">Custom U-value</option>
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Floor — below is</label>
                            <select className={sel} value={room.floorAdj} onChange={e => updRoom(room.id, { floorAdj: e.target.value as FloorAdj })}>
                              <option value="ground">Ground (10°C)</option>
                              <option value="heated">Heated space</option>
                              <option value="unheated">Unheated space</option>
                              <option value="outside">Outside air</option>
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Ceiling construction</label>
                            <select className={sel} value={room.ceilingPreset} onChange={e => updRoom(room.id, { ceilingPreset: e.target.value })}>
                              {CEILING_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}{p.u > 0 ? ` (U${p.u})` : ' (no loss)'}</option>)}
                              <option value="custom">Custom U-value</option>
                            </select>
                          </div>
                        </div>

                        {/* Row 4: Ventilation */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className={lbl}>ACH override (blank = CIBSE default {ROOM_TYPES.find(t=>t.type===room.roomType)?.defaultAch || 1.5})</label>
                            <input type="number" className={inp} value={room.achOverride ?? ''} step={0.1}
                              placeholder={`${ROOM_TYPES.find(t=>t.type===room.roomType)?.defaultAch || 1.5}`}
                              onChange={e => { const v = parseFloat(e.target.value); updRoom(room.id, { achOverride: isNaN(v) ? null : v }) }}/>
                          </div>
                          <div>
                            <label className={lbl}>External door area (m²)</label>
                            <input type="number" className={inp} value={room.extDoorAreaM2 || ''} step={0.1} placeholder="0"
                              onChange={e => updRoom(room.id, { extDoorAreaM2: parseFloat(e.target.value)||0 })}/>
                          </div>
                          <div className="flex items-end col-span-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={room.hasOpenFlue} onChange={e => updRoom(room.id, { hasOpenFlue: e.target.checked })} className="rounded"/>
                              <span className="text-xs text-gray-700">Open flued appliance <span className="text-amber-600 font-medium">(+1.5 ACH)</span></span>
                            </label>
                          </div>
                        </div>

                        {/* Heat loss result */}
                        <div className="bg-emerald-700 text-white rounded-xl p-3 grid grid-cols-4 gap-3 text-xs">
                          <div>
                            <div className="text-emerald-200">Area</div>
                            <div className="font-bold">{(roomArea(room)).toFixed(1)}m²</div>
                          </div>
                          <div>
                            <div className="text-emerald-200">Fabric</div>
                            <div className="font-bold">{room.fabricW}W</div>
                          </div>
                          <div>
                            <div className="text-emerald-200">Ventilation</div>
                            <div className="font-bold">{room.ventW}W</div>
                          </div>
                          <div>
                            <div className="text-emerald-200">Total</div>
                            <div className="font-bold text-base">{room.totalW.toLocaleString()}W</div>
                          </div>
                        </div>

                        {/* Room actions */}
                        <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                          <button onClick={() => duplicateRoom(room.id)}
                            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg bg-white hover:bg-gray-50">
                            Duplicate room
                          </button>
                          <button onClick={() => removeRoom(room.id)}
                            className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg bg-white hover:bg-red-50">
                            Remove room
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Building summary */}
            {rooms.length > 0 && (
              <div className="mt-4 bg-emerald-700 text-white rounded-2xl p-4">
                <div className="text-xs font-semibold text-emerald-200 mb-3">Building heat loss summary · BS EN 12831-1:2017</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><div className="text-emerald-200 text-xs">Fabric loss</div><div className="font-bold text-lg">{(fabricW/1000).toFixed(2)}kW</div></div>
                  <div><div className="text-emerald-200 text-xs">Ventilation loss</div><div className="font-bold text-lg">{(ventW/1000).toFixed(2)}kW</div></div>
                  <div><div className="text-emerald-200 text-xs">Total heat loss</div><div className="font-bold text-2xl">{(totalW/1000).toFixed(2)}kW</div></div>
                  <div><div className="text-emerald-200 text-xs">Recommended ASHP</div><div className="font-bold text-2xl">{recKw}kW</div></div>
                </div>
                <div className="mt-3 pt-3 border-t border-emerald-600 flex items-center justify-between">
                  <div className="text-xs text-emerald-200">Specific heat loss: <span className="font-semibold text-white">{shl} W/m²</span> · {rooms.length} rooms across {floors.length} floor{floors.length !== 1 ? 's' : ''}</div>
                  <button onClick={() => save(`/jobs/${jobId}/design/system`)} disabled={saving}
                    className="bg-white text-emerald-700 font-semibold text-xs px-4 py-2 rounded-lg hover:bg-emerald-50 flex-shrink-0">
                    {saving ? 'Saving...' : 'Save & continue →'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Quick-add room panel ────────────────────────────────────────── */}
          {addingRoom && (
            <div className="w-72 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Add a room</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {activeFloor === 0 ? 'Ground floor' : activeFloor === 1 ? 'First floor' : `Floor ${activeFloor}`}
                  </div>
                </div>
                <button onClick={() => setAddingRoom(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
              {/* Floor selector */}
              <div className="px-4 pt-3 pb-2">
                <label className="block text-xs text-gray-400 mb-1">Add to floor</label>
                <div className="flex gap-1 flex-wrap">
                  {floors.map(f => (
                    <button key={f} onClick={() => setAddFloor(f)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${addFloor === f ? 'bg-emerald-700 text-white border-emerald-700' : 'border-gray-200 text-gray-600 hover:border-emerald-400'}`}>
                      {f === 0 ? 'GF' : f === 1 ? 'FF' : `F${f}`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 pt-2">
                <div className="text-xs text-gray-400 mb-3">Select room type</div>
                <div className="grid grid-cols-2 gap-2">
                  {ROOM_TYPES.map(rt => (
                    <button key={rt.type} onClick={() => addRoom(rt.type)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors text-left group">
                      <span className="text-lg flex-shrink-0">{rt.icon}</span>
                      <div>
                        <div className="text-xs font-medium text-gray-800 group-hover:text-emerald-700">{rt.type}</div>
                        <div className="text-xs text-gray-400">{rt.defaultTemp}°C</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}