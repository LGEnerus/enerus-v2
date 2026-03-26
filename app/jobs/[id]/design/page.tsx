'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'


// ─── Types ────────────────────────────────────────────────────────────────────

export type Vec2 = { x: number; y: number }
export type WallType = 'external' | 'internal' | 'party' | 'open'

export type WallElement = {
  id: string
  wallIndex: number   // which wall segment
  position: number    // 0–1 along wall
  type: 'window' | 'door' | 'radiator' | 'ufh'
  widthMm: number
  heightMm: number
  uValue?: number
  label?: string
}

export type CanvasRoom = {
  id: string
  name: string
  roomType: string
  floor: number
  // All rooms are stored as vertex arrays (even rectangles = 4 verts)
  vertices: Vec2[]    // mm, real-world
  wallTypes: WallType[]
  elements: WallElement[]
  heatLossW?: number
}

export type CanvasTool =
  | 'select' | 'draw' | 'addWindow' | 'addDoor'
  | 'addRadiator' | 'addUFH' | 'drawInsul'

export type Viewport = { x: number; y: number; zoom: number }

export type CanvasRef = {
  fitToScreen: () => void
  zoomIn: () => void
  zoomOut: () => void
  deleteSelected: () => void
  getSelectedRoom: () => CanvasRoom | null
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function vAdd(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y } }
function vSub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y } }
function vLen(v: Vec2): number { return Math.sqrt(v.x ** 2 + v.y ** 2) }
function vDist(a: Vec2, b: Vec2): number { return vLen(vSub(b, a)) }
function vScale(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s } }
function vNorm(v: Vec2): Vec2 { const l = vLen(v); return l > 0 ? vScale(v, 1/l) : { x:0, y:0 } }
function vDot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y }

function snapGrid(pt: Vec2, grid: number): Vec2 {
  return { x: Math.round(pt.x / grid) * grid, y: Math.round(pt.y / grid) * grid }
}

function mmToPx(mm: number, zoom: number): number { return mm / 1000 * 100 * zoom }
function pxToMm(px: number, zoom: number): number { return px / (100 * zoom) * 1000 }

function toScreen(pt: Vec2, vp: Viewport): Vec2 {
  return { x: mmToPx(pt.x, vp.zoom) + vp.x, y: mmToPx(pt.y, vp.zoom) + vp.y }
}
function toWorld(pt: Vec2, vp: Viewport): Vec2 {
  return { x: pxToMm(pt.x - vp.x, vp.zoom), y: pxToMm(pt.y - vp.y, vp.zoom) }
}

function polyArea(verts: Vec2[]): number {
  let s = 0
  const n = verts.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    s += verts[i].x * verts[j].y - verts[j].x * verts[i].y
  }
  return Math.abs(s) / 2
}

function polyCentroid(pts: Vec2[]): Vec2 {
  return pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x:0, y:0 })
}

function ptInPoly(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

function ptToSegDist(pt: Vec2, a: Vec2, b: Vec2): number {
  const ab = vSub(b, a), ap = vSub(pt, a)
  const len2 = ab.x ** 2 + ab.y ** 2
  if (len2 === 0) return vDist(pt, a)
  const t = Math.max(0, Math.min(1, vDot(ap, ab) / len2))
  return vDist(pt, vAdd(a, vScale(ab, t)))
}

function ptToSegParam(pt: Vec2, a: Vec2, b: Vec2): number {
  const ab = vSub(b, a), ap = vSub(pt, a)
  const len2 = ab.x ** 2 + ab.y ** 2
  return len2 === 0 ? 0 : Math.max(0, Math.min(1, vDot(ap, ab) / len2))
}

function wallNormal(verts: Vec2[], wi: number): Vec2 {
  const n = verts.length
  const a = verts[wi], b = verts[(wi + 1) % n]
  const d = vSub(b, a)
  return vNorm({ x: -d.y, y: d.x })
}

// Adjacency: mark walls as internal when two rooms share a boundary (80%+ overlap)
function segOverlap(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2, tol = 50): number {
  const dA = vSub(a2, a1), lenA = vLen(dA)
  if (lenA < 1) return 0
  const nA = vNorm(dA)
  if (vDist(b1, vAdd(a1, vScale(nA, vDot(vSub(b1, a1), nA)))) > tol) return 0
  if (vDist(b2, vAdd(a1, vScale(nA, vDot(vSub(b2, a1), nA)))) > tol) return 0
  const t1 = vDot(vSub(b1, a1), nA), t2 = vDot(vSub(b2, a1), nA)
  return Math.max(0, Math.min(lenA, Math.max(t1,t2)) - Math.max(0, Math.min(t1,t2)))
}

function autoWallTypes(rooms: CanvasRoom[]): CanvasRoom[] {
  return rooms.map(roomA => {
    const n = roomA.vertices.length
    const wallTypes: WallType[] = roomA.vertices.map(() => 'external')
    for (let wi = 0; wi < n; wi++) {
      const a1 = roomA.vertices[wi], a2 = roomA.vertices[(wi+1)%n]
      const lenA = vDist(a1, a2)
      for (const roomB of rooms) {
        if (roomB.id === roomA.id || roomB.floor !== roomA.floor) continue
        for (let wj = 0; wj < roomB.vertices.length; wj++) {
          const b1 = roomB.vertices[wj], b2 = roomB.vertices[(wj+1)%roomB.vertices.length]
          const ov = segOverlap(a1, a2, b1, b2)
          if (ov / Math.min(lenA, vDist(b1,b2)) >= 0.8) {
            wallTypes[wi] = 'internal'
          }
        }
      }
    }
    return { ...roomA, wallTypes }
  })
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOM_COLORS: Record<string, string> = {
  'Living room': '#d1fae5', 'Dining room': '#dbeafe', 'Kitchen': '#fef3c7',
  'Bedroom': '#ede9fe', 'Bathroom': '#fce7f3', 'En-suite': '#fce7f3',
  'Hall / Landing': '#f3f4f6', 'Study': '#d1fae5', 'Utility room': '#fef9c3',
  'WC': '#fce7f3', 'Conservatory': '#ecfdf5', 'Garage': '#f9fafb', 'Other': '#f3f4f6',
}

const WALL_COLOR: Record<WallType, string> = {
  external: '#1f2937', internal: '#9ca3af', party: '#7c3aed', open: '#d1d5db'
}
const WALL_WIDTH: Record<WallType, number> = {
  external: 6, internal: 3, party: 4, open: 1.5
}
const WALL_DASH: Record<WallType, string> = {
  external: 'none', internal: '5,3', party: '10,4', open: '3,3'
}
const EL_COLOR: Record<string, string> = {
  window: '#60a5fa', door: '#f59e0b', radiator: '#ef4444', ufh: '#10b981'
}

function heatColor(w: number, areaMm2: number): string {
  if (!w || areaMm2 <= 0) return undefined as any
  const wm2 = w / (areaMm2 / 1e6)
  if (wm2 < 40) return '#d1fae5'
  if (wm2 < 70) return '#fef9c3'
  if (wm2 < 100) return '#fed7aa'
  return '#fecaca'
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  rooms: CanvasRoom[]
  activeFloor: number
  tool: CanvasTool
  gridMm: number
  showGrid: boolean
  showDims: boolean
  showHeatLoss: boolean
  bgImage?: string
  onRoomsChange: (rooms: CanvasRoom[]) => void
  onSelect: (id: string | null, type?: 'room' | 'element', elementId?: string) => void
  onToolChange: (tool: CanvasTool) => void
  drawingInsulFloor: number | null
  drawingInsulType: 'floor' | 'ceiling'
  insulRegions: Array<{id:string;floor:number;vertices:{x:number;y:number}[];uValue:number;type:'floor'|'ceiling';construction:string;insulationMm:number;label:string}>
  onInsulRegionAdd: (r:{id:string;floor:number;vertices:{x:number;y:number}[];uValue:number;type:'floor'|'ceiling';construction:string;insulationMm:number;label:string}) => void
  insulLayerDefaultU: (f:number) => number
  activeLayerMode: 'rooms' | 'floor' | 'ceiling'
  selectedRegionId: string | null
  onRegionSelect: (id: string | null) => void
  selectedId: string | null
  selectedElementId: string | null
}

const DesignCanvas = forwardRef<CanvasRef, Props>(({
  rooms, activeFloor, tool, gridMm, showGrid, showDims, showHeatLoss,
  bgImage, onRoomsChange, onSelect, onToolChange, drawingInsulFloor, drawingInsulType, insulRegions, onInsulRegionAdd, insulLayerDefaultU, activeLayerMode, selectedRegionId, onRegionSelect, selectedId, selectedElementId,
}, ref) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState<Viewport>({ x: 150, y: 150, zoom: 0.9 })
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [isMobile, setIsMobile] = useState(false)
  const touchRef = useRef<{ dist: number } | null>(null)

  // Draw mode state
  const [drawStart, setDrawStart] = useState<Vec2 | null>(null)
  const [drawCurrent, setDrawCurrent] = useState<Vec2 | null>(null)

  // Drag state
  const dragRef = useRef<{
    type: 'room' | 'vertex' | 'wall' | 'element' | 'pan'
    id?: string
    vertIdx?: number
    wallIdx?: number
    elemId?: string
    startPx: Vec2
    startWorld?: Vec2
    startVerts?: Vec2[]
    startVp?: Viewport
    startElemPos?: number
    wallNorm?: Vec2
  } | null>(null)

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{
    px: Vec2; roomId: string; wallIdx?: number; elemId?: string
  } | null>(null)

  useEffect(() => {
    setIsMobile('ontouchstart' in window)
    const obs = new ResizeObserver(es => {
      for (const e of es) setSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    if (containerRef.current) obs.observe(containerRef.current)

    const svg = svgRef.current
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = svg!.getBoundingClientRect()
      const px = { x: e.clientX - r.left, y: e.clientY - r.top }
      const f = e.deltaY > 0 ? 0.88 : 1.13
      setVp(prev => {
        const nz = Math.max(0.05, Math.min(8, prev.zoom * f))
        const wp = toWorld(px, prev)
        return { x: px.x - mmToPx(wp.x, nz), y: px.y - mmToPx(wp.y, nz), zoom: nz }
      })
    }
    svg?.addEventListener('wheel', onWheel, { passive: false })
    return () => { obs.disconnect(); svg?.removeEventListener('wheel', onWheel) }
  }, [])

  useImperativeHandle(ref, () => ({
    fitToScreen() {
      const fr = rooms.filter(r => r.floor === activeFloor)
      if (!fr.length) { setVp({ x: 150, y: 150, zoom: 0.9 }); return }
      const all = fr.flatMap(r => r.vertices)
      const xs = all.map(v => v.x), ys = all.map(v => v.y)
      const pad = 1500
      const wMm = Math.max(...xs) - Math.min(...xs) + pad*2
      const hMm = Math.max(...ys) - Math.min(...ys) + pad*2
      const zoom = Math.min(size.w / mmToPx(wMm, 1), size.h / mmToPx(hMm, 1), 3)
      setVp({ x: -mmToPx(Math.min(...xs)-pad, zoom), y: -mmToPx(Math.min(...ys)-pad, zoom), zoom })
    },
    zoomIn() { setVp(v => ({ ...v, zoom: Math.min(v.zoom*1.3, 8) })) },
    zoomOut() { setVp(v => ({ ...v, zoom: Math.max(v.zoom*0.77, 0.05) })) },
    deleteSelected() {
      if (selectedElementId && selectedId) {
        onRoomsChange(rooms.map(r => r.id !== selectedId ? r : {
          ...r, elements: r.elements.filter(e => e.id !== selectedElementId)
        }))
        onSelect(selectedId)
      } else if (selectedId) {
        onRoomsChange(rooms.filter(r => r.id !== selectedId))
        onSelect(null)
      }
    },
    getSelectedRoom() { return rooms.find(r => r.id === selectedId) || null },
  }))

  function getWorldPt(e: React.PointerEvent | React.MouseEvent, snap = true): Vec2 {
    const r = svgRef.current!.getBoundingClientRect()
    const px = { x: e.clientX - r.left, y: e.clientY - r.top }
    let w = toWorld(px, vp)
    if (snap) w = snapGrid(w, gridMm)
    return w
  }

  function getPxPt(e: React.PointerEvent | React.MouseEvent): Vec2 {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function commit(updated: CanvasRoom[]) {
    onRoomsChange(autoWallTypes(updated))
  }

  // ── Hit testing ──────────────────────────────────────────────────────────────

  function hitVertex(pxPt: Vec2, room: CanvasRoom): number {
    const R = isMobile ? 14 : 9
    for (let i = 0; i < room.vertices.length; i++) {
      if (vDist(pxPt, toScreen(room.vertices[i], vp)) < R) return i
    }
    return -1
  }

  function hitWall(pxPt: Vec2, room: CanvasRoom): number {
    for (let i = 0; i < room.vertices.length; i++) {
      const a = toScreen(room.vertices[i], vp)
      const b = toScreen(room.vertices[(i+1)%room.vertices.length], vp)
      if (ptToSegDist(pxPt, a, b) < 10) return i
    }
    return -1
  }

  function hitElement(pxPt: Vec2, room: CanvasRoom): string | null {
    for (const el of room.elements) {
      const a = toScreen(room.vertices[el.wallIndex], vp)
      const b = toScreen(room.vertices[(el.wallIndex+1)%room.vertices.length], vp)
      const ex = a.x + el.position*(b.x-a.x), ey = a.y + el.position*(b.y-a.y)
      const wPx = mmToPx(el.widthMm, vp.zoom)
      if (Math.abs(pxPt.x-ex) < wPx/2+6 && Math.abs(pxPt.y-ey) < 10) return el.id
    }
    return null
  }

  // ── Pointer events ───────────────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent) {
    setCtxMenu(null)
    const pxPt = getPxPt(e)
    const worldPt = getWorldPt(e)
    const fr = rooms.filter(r => r.floor === activeFloor)

    // Middle mouse button always pans
    if (e.buttons === 4) {
      dragRef.current = { type: 'pan', startPx: pxPt, startVp: { ...vp } }
      return
    }

    // ── Draw room (click-drag rectangle) ──────────────────────────────────────
    if (tool === 'draw' || tool === 'drawInsul') {
      setDrawStart(worldPt)
      setDrawCurrent(worldPt)
      return
    }

    // ── Place element on wall ─────────────────────────────────────────────────
    if (tool === 'addWindow' || tool === 'addDoor' || tool === 'addRadiator' || tool === 'addUFH') {
      const type = tool === 'addWindow' ? 'window' : tool === 'addDoor' ? 'door' : 'radiator'

      // UFH: click inside room to toggle UFH on that room (floor region, not wall element)
      if (tool === 'addUFH') {
        for (let i = fr.length-1; i >= 0; i--) {
          if (ptInPoly(worldPt, fr[i].vertices)) {
            const hasUfh = fr[i].elements.some(e => e.type === 'ufh')
            if (hasUfh) {
              // Remove UFH from this room
              onRoomsChange(rooms.map(r => r.id !== fr[i].id ? r : {
                ...r, elements: r.elements.filter(e => e.type !== 'ufh')
              }))
            } else {
              // Add UFH zone covering the room floor
              const el: WallElement = {
                id: `ufh_${Date.now()}`, wallIndex: 0, position: 0.5,
                type: 'ufh', widthMm: 1000, heightMm: 1000,
              }
              onRoomsChange(rooms.map(r => r.id !== fr[i].id ? r : { ...r, elements: [...r.elements, el] }))
            }
            onSelect(fr[i].id)
            onToolChange('select')
            return
          }
        }
        return
      }

      // Window / door / radiator: place on wall
      for (let i = fr.length-1; i >= 0; i--) {
        const wi = hitWall(pxPt, fr[i])
        if (wi >= 0) {
          const a = fr[i].vertices[wi], b = fr[i].vertices[(wi+1)%fr[i].vertices.length]
          const pos = ptToSegParam(worldPt, a, b)
          const el: WallElement = {
            id: `el_${Date.now()}`, wallIndex: wi, position: Math.max(0.05, Math.min(0.95, pos)),
            type, widthMm: type === 'door' ? 900 : 1200,
            heightMm: type === 'door' ? 2100 : 1200, uValue: type === 'window' ? 2.0 : undefined,
          }
          const updated = rooms.map(r => r.id !== fr[i].id ? r : { ...r, elements: [...r.elements, el] })
          onRoomsChange(updated)
          onSelect(fr[i].id, 'element', el.id)
          onToolChange('select')
          return
        }
      }
      return
    }

    // ── Select / interact (works in any non-draw tool) ───────────────────────
    if (!['draw','drawInsul','addWindow','addDoor','addRadiator','addUFH'].includes(tool)) {
      const selRoom = fr.find(r => r.id === selectedId)

      // Check elements first (on selected room)
      if (selRoom) {
        const elId = hitElement(pxPt, selRoom)
        if (elId) {
          onSelect(selRoom.id, 'element', elId)
          dragRef.current = { type: 'element', id: selRoom.id, elemId: elId, startPx: pxPt,
            startElemPos: selRoom.elements.find(el => el.id === elId)?.position }
          return
        }
        // Check vertices
        const vi = hitVertex(pxPt, selRoom)
        if (vi >= 0) {
          dragRef.current = { type: 'vertex', id: selRoom.id, vertIdx: vi, startPx: pxPt, startVerts: [...selRoom.vertices] }
          return
        }
        // Check wall segments
        const wi = hitWall(pxPt, selRoom)
        if (wi >= 0) {
          dragRef.current = {
            type: 'wall', id: selRoom.id, wallIdx: wi,
            startPx: pxPt, startVerts: [...selRoom.vertices],
            wallNorm: wallNormal(selRoom.vertices, wi),
          }
          return
        }
      }

      // Check elements on any room
      for (let i = fr.length-1; i >= 0; i--) {
        const elId = hitElement(pxPt, fr[i])
        if (elId) {
          onSelect(fr[i].id, 'element', elId)
          dragRef.current = { type: 'element', id: fr[i].id, elemId: elId, startPx: pxPt,
            startElemPos: fr[i].elements.find(el => el.id === elId)?.position }
          return
        }
      }

      // Check room bodies — always draggable
      for (let i = fr.length-1; i >= 0; i--) {
        if (ptInPoly(worldPt, fr[i].vertices)) {
          onSelect(fr[i].id)
          dragRef.current = { type: 'room', id: fr[i].id, startPx: pxPt, startVerts: [...fr[i].vertices] }
          return
        }
      }

      // Nothing hit — deselect region and pan
      onSelect(null)
      onRegionSelect(null)
      dragRef.current = { type: 'pan', startPx: pxPt, startVp: { ...vp } }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const pxPt = getPxPt(e)

    // Draw preview
    if (tool === 'draw' && drawStart) {
      setDrawCurrent(getWorldPt(e))
      return
    }

    const drag = dragRef.current
    if (!drag) return

    if (drag.type === 'pan' && drag.startVp) {
      const dx = pxPt.x - drag.startPx.x, dy = pxPt.y - drag.startPx.y
      setVp({ ...drag.startVp, x: drag.startVp.x + dx, y: drag.startVp.y + dy })
      return
    }

    const worldPt = getWorldPt(e)

    if (drag.type === 'vertex' && drag.id && drag.vertIdx !== undefined && drag.startVerts) {
      const newVerts = [...drag.startVerts]
      newVerts[drag.vertIdx] = worldPt
      commit(rooms.map(r => r.id !== drag.id ? r : { ...r, vertices: newVerts }))
      return
    }

    if (drag.type === 'wall' && drag.id !== undefined && drag.wallIdx !== undefined && drag.startVerts && drag.wallNorm) {
      const n = drag.startVerts.length, wi = drag.wallIdx
      const a0 = drag.startVerts[wi], b0 = drag.startVerts[(wi+1)%n]
      const startMid = { x: (a0.x+b0.x)/2, y: (a0.y+b0.y)/2 }
      const push = vDot(vSub(worldPt, startMid), drag.wallNorm)
      const snappedPush = Math.round(push / gridMm) * gridMm
      const newVerts = [...drag.startVerts]
      newVerts[wi] = vAdd(a0, vScale(drag.wallNorm, snappedPush))
      newVerts[(wi+1)%n] = vAdd(b0, vScale(drag.wallNorm, snappedPush))
      commit(rooms.map(r => r.id !== drag.id ? r : { ...r, vertices: newVerts }))
      return
    }

    if (drag.type === 'room' && drag.id && drag.startVerts) {
      const dpx = vSub(pxPt, drag.startPx)
      const dmm = snapGrid({ x: pxToMm(dpx.x, vp.zoom), y: pxToMm(dpx.y, vp.zoom) }, gridMm)
      commit(rooms.map(r => r.id !== drag.id ? r : {
        ...r, vertices: drag.startVerts!.map(v => vAdd(v, dmm))
      }))
      return
    }

    if (drag.type === 'element' && drag.id && drag.elemId) {
      const room = rooms.find(r => r.id === drag.id)
      const el = room?.elements.find(e => e.id === drag.elemId)
      if (!room || !el) return
      // Find nearest wall to current cursor position
      let bestWall = el.wallIndex, bestDist = Infinity, bestPos = el.position
      for (let wi = 0; wi < room.vertices.length; wi++) {
        const a = room.vertices[wi], b = room.vertices[(wi+1)%room.vertices.length]
        const pxA = toScreen(a, vp), pxB = toScreen(b, vp)
        const d = ptToSegDist(pxPt, pxA, pxB)
        if (d < bestDist) {
          bestDist = d
          bestWall = wi
          bestPos = Math.max(0.05, Math.min(0.95, ptToSegParam(worldPt, a, b)))
        }
      }
      onRoomsChange(rooms.map(r => r.id !== drag.id ? r : {
        ...r, elements: r.elements.map(e => e.id !== drag.elemId ? e : {
          ...e, wallIndex: bestWall, position: bestPos
        })
      }))
      return
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    // Finish drawing room
    if (tool === 'draw' && drawStart && drawCurrent) {
      const w = Math.abs(drawCurrent.x - drawStart.x)
      const h = Math.abs(drawCurrent.y - drawStart.y)
      if (w > 200 && h > 200) {
        const x1 = Math.min(drawStart.x, drawCurrent.x)
        const y1 = Math.min(drawStart.y, drawCurrent.y)
        const x2 = Math.max(drawStart.x, drawCurrent.x)
        const y2 = Math.max(drawStart.y, drawCurrent.y)
        const id = `room_${Date.now()}`
        const nr: CanvasRoom = {
          id, name: '', roomType: 'Living room', floor: activeFloor,
          vertices: [{ x:x1,y:y1 }, { x:x2,y:y1 }, { x:x2,y:y2 }, { x:x1,y:y2 }],
          wallTypes: ['external','external','external','external'],
          elements: [],
        }
        commit([...rooms, nr])
        onSelect(id)
        onToolChange('select')
      }
      setDrawStart(null)
      setDrawCurrent(null)
      return
    }
    // Finish drawing insulation region
    if (tool === 'drawInsul' && drawStart && drawCurrent) {
      const w = Math.abs(drawCurrent.x - drawStart.x)
      const h = Math.abs(drawCurrent.y - drawStart.y)
      if (w > 200 && h > 200 && drawingInsulFloor !== null) {
        const x1 = Math.min(drawStart.x, drawCurrent.x)
        const y1 = Math.min(drawStart.y, drawCurrent.y)
        const x2 = Math.max(drawStart.x, drawCurrent.x)
        const y2 = Math.max(drawStart.y, drawCurrent.y)
        onInsulRegionAdd({
          id: `insul_${Date.now()}`,
          floor: drawingInsulFloor!,
          vertices: [{ x:x1,y:y1 }, { x:x2,y:y1 }, { x:x2,y:y2 }, { x:x1,y:y2 }],
          uValue: insulLayerDefaultU(drawingInsulFloor!),
          type: drawingInsulType,
          construction: drawingInsulType === 'floor' ? 'ground_unins' : 'pitched_100',
          insulationMm: 100,
          label: drawingInsulType === 'floor' ? 'Floor construction' : 'Ceiling insulation',
        })
        onToolChange('select')
      }
      setDrawStart(null)
      setDrawCurrent(null)
      return
    }
    dragRef.current = null
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (['draw','addWindow','addDoor','addRadiator','addUFH'].includes(tool) || !selectedId) return
    const pxPt = getPxPt(e)
    const room = rooms.find(r => r.id === selectedId); if (!room) return
    // Double-click on wall edge → insert vertex (makes L-shapes)
    let bestWall = -1, bestT = 0, bestDist = Infinity
    for (let i = 0; i < room.vertices.length; i++) {
      const a = toScreen(room.vertices[i], vp)
      const b = toScreen(room.vertices[(i+1)%room.vertices.length], vp)
      const d = ptToSegDist(pxPt, a, b)
      if (d < bestDist && d < 14) {
        bestDist = d; bestWall = i
        bestT = ptToSegParam(pxPt, a, b)
      }
    }
    if (bestWall < 0) return
    const a = room.vertices[bestWall], b = room.vertices[(bestWall+1)%room.vertices.length]
    const nv = snapGrid({ x: a.x + bestT*(b.x-a.x), y: a.y + bestT*(b.y-a.y) }, gridMm)
    const newVerts = [...room.vertices]; newVerts.splice(bestWall+1, 0, nv)
    const newWT = [...room.wallTypes]; newWT.splice(bestWall+1, 0, newWT[bestWall])
    commit(rooms.map(r => r.id !== selectedId ? r : { ...r, vertices: newVerts, wallTypes: newWT }))
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (tool !== 'select') return
    const pxPt = getPxPt(e)
    const fr = rooms.filter(r => r.floor === activeFloor)
    for (let i = fr.length-1; i >= 0; i--) {
      // Right-click element → delete
      const elId = hitElement(pxPt, fr[i])
      if (elId) {
        onRoomsChange(rooms.map(r => r.id !== fr[i].id ? r : { ...r, elements: r.elements.filter(el => el.id !== elId) }))
        if (selectedElementId === elId) onSelect(fr[i].id)
        return
      }
      // Right-click vertex (wall intersection) → delete vertex if room has >4 verts
      const room = fr[i]
      const vi = hitVertex(pxPt, room)
      if (vi >= 0 && room.vertices.length > 4) {
        // Delete this vertex — merges the two adjacent wall segments
        const newVerts = room.vertices.filter((_: any, idx: number) => idx !== vi)
        const newWT = room.wallTypes.filter((_: any, idx: number) => idx !== vi)
        commit(rooms.map(r => r.id !== room.id ? r : { ...r, vertices: newVerts, wallTypes: newWT }))
        return
      }
      // Right-click wall → wall type context menu
      const wi = hitWall(pxPt, fr[i])
      if (wi >= 0) {
        setCtxMenu({ px: pxPt, roomId: fr[i].id, wallIdx: wi })
        onSelect(fr[i].id)
        return
      }
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      touchRef.current = { dist: Math.sqrt(dx**2+dy**2) }
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 2 && touchRef.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const dist = Math.sqrt(dx**2+dy**2)
      const factor = dist / touchRef.current.dist
      const r = svgRef.current!.getBoundingClientRect()
      const cx = (e.touches[0].clientX + e.touches[1].clientX)/2 - r.left
      const cy = (e.touches[0].clientY + e.touches[1].clientY)/2 - r.top
      setVp(prev => {
        const nz = Math.max(0.05, Math.min(8, prev.zoom * factor))
        const wp = toWorld({ x:cx, y:cy }, prev)
        return { x: cx - mmToPx(wp.x,nz), y: cy - mmToPx(wp.y,nz), zoom: nz }
      })
      touchRef.current.dist = dist
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  function renderGrid() {
    if (!showGrid) return null
    const step = mmToPx(gridMm, vp.zoom); if (step < 5) return null
    const lines: JSX.Element[] = []
    for (let x = ((- vp.x % step) + step) % step; x < size.w; x += step)
      lines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={size.h} stroke="#f0f0f0" strokeWidth={0.5}/>)
    for (let y = ((- vp.y % step) + step) % step; y < size.h; y += step)
      lines.push(<line key={`gy${y}`} x1={0} y1={y} x2={size.w} y2={y} stroke="#f0f0f0" strokeWidth={0.5}/>)
    return <g>{lines}</g>
  }

  function renderRoom(room: CanvasRoom, isGhost = false) {
    const pts = room.vertices.map(v => toScreen(v, vp))
    const ptsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const isSel = room.id === selectedId && !isGhost
    const areaMm2 = polyArea(room.vertices) * 1e6

    const fillColor = isGhost ? 'none'
      : showHeatLoss && room.heatLossW
        ? heatColor(room.heatLossW, areaMm2) || (ROOM_COLORS[room.roomType] || '#f9fafb')
        : (ROOM_COLORS[room.roomType] || '#f9fafb')

    const centroid = polyCentroid(pts)
    const lblSz = Math.max(7, Math.min(12, mmToPx(1400, vp.zoom)))

    return (
      <g key={isGhost ? `ghost_${room.id}` : room.id} opacity={isGhost ? 0.35 : 1}>
        {/* Fill */}
        <polygon points={ptsStr} fill={fillColor}
          stroke={isGhost ? '#9ca3af' : isSel ? '#059669' : 'none'}
          strokeWidth={isSel ? 0 : 0}
          style={{ cursor: isGhost ? 'default' : ['addWindow','addDoor','addRadiator','addUFH'].includes(tool) ? 'crosshair' : 'move' }}/>

        {/* Walls */}
        {!isGhost && room.vertices.map((v, wi) => {
          const a = toScreen(v, vp)
          const b = toScreen(room.vertices[(wi+1)%room.vertices.length], vp)
          const wt = room.wallTypes[wi] || 'external'
          const color = WALL_COLOR[wt]
          const width = WALL_WIDTH[wt]
          const pxLen = vDist(a, b)
          const isSelWall = isSel && ctxMenu?.roomId === room.id && ctxMenu.wallIdx === wi

          return (
            <g key={`w${wi}`}>
              {/* Invisible thick hit target */}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="transparent" strokeWidth={18}
                style={{ cursor: 'pointer' }}
                onClick={ev => { ev.stopPropagation(); onSelect(room.id); setCtxMenu(null) }}
                onContextMenu={ev => { ev.preventDefault(); setCtxMenu({ px: getPxPt(ev), roomId: room.id, wallIdx: wi }); onSelect(room.id) }}
              />
              {/* Visual wall */}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={isGhost ? '#3b82f6' : isSelWall ? '#f59e0b' : color}
                strokeWidth={isGhost ? 2 : isSel ? width+1 : width}
                strokeDasharray={isGhost ? '5,3' : WALL_DASH[wt]}
                style={{ pointerEvents: 'none' }}/>
              {/* Dimension */}
              {showDims && isSel && pxLen > 45 && (() => {
                const len = vDist(v, room.vertices[(wi+1)%room.vertices.length])
                const dx = b.x-a.x, dy = b.y-a.y, nl = pxLen
                const nx = -dy/nl*14, ny = dx/nl*14
                const mx = (a.x+b.x)/2, my = (a.y+b.y)/2
                return <text x={mx+nx} y={my+ny} textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.max(8, mmToPx(200, vp.zoom))} fill="#374151" fontFamily="monospace"
                  style={{ pointerEvents:'none', userSelect:'none' }}>
                  {len>=1000 ? `${(len/1000).toFixed(2)}m` : `${Math.round(len)}mm`}
                </text>
              })()}
            </g>
          )
        })}

        {/* Ghost room name label */}
        {isGhost && lblSz > 6 && (
          <text x={centroid.x} y={centroid.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={Math.max(7, lblSz*0.8)} fill="#3b82f6" opacity={0.7}
            style={{ pointerEvents:'none', userSelect:'none' }}>
            {room.name || room.roomType}
          </text>
        )}
        {/* Labels */}
        {!isGhost && lblSz > 6 && (
          <text x={centroid.x} y={centroid.y - (showHeatLoss && room.heatLossW ? lblSz*0.6 : 0)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={lblSz} fill={isSel ? '#065f46' : '#374151'}
            fontWeight={isSel ? '700' : '400'}
            style={{ pointerEvents:'none', userSelect:'none' }}>
            {room.name || room.roomType}
          </text>
        )}
        {!isGhost && showHeatLoss && room.heatLossW && lblSz > 6 && (
          <text x={centroid.x} y={centroid.y + lblSz*0.9}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={lblSz*0.85} fill="#059669"
            style={{ pointerEvents:'none', userSelect:'none' }}>
            {room.heatLossW.toLocaleString()}W
          </text>
        )}

        {/* Area label */}
        {!isGhost && isSel && polyArea(room.vertices)/1e6 > 0.5 && lblSz > 7 && (
          <text x={centroid.x} y={centroid.y + lblSz*(showHeatLoss && room.heatLossW ? 1.9 : 1.1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={lblSz*0.75} fill="#6b7280"
            style={{ pointerEvents:'none' }}>
            {(polyArea(room.vertices)/1e6).toFixed(1)}m²
          </text>
        )}

        {/* Vertex handles */}
        {!isGhost && isSel && pts.map((p, i) => (
          <circle key={`vh${i}`} cx={p.x} cy={p.y} r={isMobile ? 10 : 7}
            fill="white" stroke="#059669" strokeWidth={2.5}
            style={{ cursor:'grab' }}/>
        ))}

        {/* Wall mid-handles (push/pull) */}
        {!isGhost && isSel && room.vertices.map((v, wi) => {
          const a = toScreen(v, vp)
          const b = toScreen(room.vertices[(wi+1)%room.vertices.length], vp)
          const pxLen = vDist(a, b)
          if (pxLen < 40) return null
          const mx = (a.x+b.x)/2, my = (a.y+b.y)/2
          const wt = room.wallTypes[wi] || 'external'
          const col = WALL_COLOR[wt]
          return (
            <g key={`wm${wi}`} style={{ cursor:'ns-resize' }}>
              <rect x={mx-20} y={my-8} width={40} height={16} rx={8}
                fill="white" stroke={col} strokeWidth={1.5}/>
              <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                fontSize={8} fill={col} fontWeight="700" fontFamily="sans-serif"
                style={{ pointerEvents:'none', userSelect:'none' }}>
                {wt === 'external' ? 'Ext' : wt === 'internal' ? 'Int' : wt === 'party' ? 'Party' : 'Open'}
              </text>
            </g>
          )
        })}

        {/* UFH floor overlay */}
        {!isGhost && room.elements.some(e => e.type === 'ufh') && (() => {
          const ptsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
          return (
            <g style={{ pointerEvents: 'none' }}>
              <polygon points={ptsStr} fill="#10b981" fillOpacity={0.15}/>
              <polygon points={ptsStr} fill="none" stroke="#10b981" strokeWidth={2} strokeDasharray="8,4"/>
              <text x={centroid.x} y={centroid.y + (room.heatLossW ? 18 : 8)}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={10} fill="#059669" fontWeight="600"
                style={{ userSelect:'none' }}>
                ♨ UFH
              </text>
            </g>
          )
        })()}

        {/* Wall Elements (windows, doors, radiators — excluding UFH) */}
        {!isGhost && room.elements.filter(e => e.type !== 'ufh').map(el => {
          const a = toScreen(room.vertices[el.wallIndex], vp)
          const b = toScreen(room.vertices[(el.wallIndex+1)%room.vertices.length], vp)
          // Base position on wall
          const ex0 = a.x + el.position*(b.x-a.x), ey0 = a.y + el.position*(b.y-a.y)
          const wPx = mmToPx(el.widthMm, vp.zoom)
          const col = EL_COLOR[el.type] || '#6b7280'
          const isSel2 = selectedElementId === el.id
          const dx = b.x-a.x, dy = b.y-a.y, len = Math.sqrt(dx**2+dy**2)
          const angle = len > 0 ? Math.atan2(dy, dx) * 180/Math.PI : 0
          // Radiators offset inward (toward room interior) by wall thickness ~100mm
          const insetPx = el.type === 'radiator' ? mmToPx(100, vp.zoom) : 0
          // Inward normal (pointing into room interior)
          const nx = len > 0 ? -dy/len : 0, ny = len > 0 ? dx/len : 0
          // Check which side is interior using room centroid
          const centroidW = polyCentroid(room.vertices.map(v => toScreen(v, vp)))
          const dotToCenter = (centroidW.x - ex0) * nx + (centroidW.y - ey0) * ny
          const inwardSign = dotToCenter >= 0 ? 1 : -1
          const ex = ex0 + nx * insetPx * inwardSign
          const ey = ey0 + ny * insetPx * inwardSign
          return (
            <g key={el.id} transform={`translate(${ex},${ey}) rotate(${angle})`}
              style={{ cursor:'pointer' }}
              onClick={ev => { ev.stopPropagation(); onSelect(room.id, 'element', el.id) }}
              onContextMenu={ev => { ev.preventDefault(); ev.stopPropagation()
                onRoomsChange(rooms.map(r => r.id !== room.id ? r : { ...r, elements: r.elements.filter(e => e.id !== el.id) }))
                if (selectedElementId === el.id) onSelect(room.id)
              }}>
              <rect x={-wPx/2-4} y={-8} width={wPx+8} height={16} fill="transparent"/>
              <rect x={-wPx/2} y={-5} width={wPx} height={10}
                fill={isSel2 ? 'white' : col} stroke={isSel2 ? col : 'white'}
                strokeWidth={isSel2 ? 2 : 1} rx={2}/>
              {wPx > 16 && <text x={0} y={0} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill={isSel2 ? col : 'white'} fontWeight="700"
                style={{ pointerEvents:'none', userSelect:'none' }}>
                {el.type[0].toUpperCase()}
              </text>}
              {isSel2 && <>
                <circle cx={-wPx/2} cy={0} r={4} fill={col} style={{ cursor:'ew-resize' }}/>
                <circle cx={wPx/2} cy={0} r={4} fill={col} style={{ cursor:'ew-resize' }}/>
              </>}
            </g>
          )
        })}
      </g>
    )
  }

  const floorRooms = rooms.filter(r => r.floor === activeFloor)
  const ghostRooms = rooms.filter(r => r.floor < activeFloor)

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-gray-50 select-none"
      style={{ touchAction: 'none' }}>
      <svg ref={svgRef} width={size.w} height={size.h}
        style={{ display:'block', cursor: (tool==='draw'||tool==='drawInsul')?'crosshair':['addWindow','addDoor','addRadiator','addUFH'].includes(tool)?'crosshair':'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { dragRef.current = null; setDrawStart(null); setDrawCurrent(null) }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}>

        {bgImage && <image href={bgImage} x={vp.x} y={vp.y} opacity={0.3} width={mmToPx(20000,vp.zoom)}/>}
        {renderGrid()}

        {/* Ghost — floor below */}
        {ghostRooms.map(r => renderRoom(r, true))}

        {/* Insulation regions — clickable, selectable */}
        {insulRegions.filter(ir => ir.floor === activeFloor).map(ir => {
          const pts = ir.vertices.map(v => toScreen(v, vp))
          const ptsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
          const c = polyCentroid(pts)
          const col = ir.type === 'ceiling' ? '#3b82f6' : '#f59e0b'
          const isSelReg = selectedRegionId === ir.id
          const label = ir.label || (ir.type === 'ceiling' ? 'Ceiling' : 'Floor')
          return (
            <g key={ir.id} style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onRegionSelect(isSelReg ? null : ir.id) }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation()
                // Right-click region to delete
                // We can't call setInsulRegions directly in canvas, so use a workaround
                // by selecting and letting the right panel handle delete
                onRegionSelect(ir.id)
              }}>
              <polygon points={ptsStr} fill={col} fillOpacity={isSelReg ? 0.22 : 0.12}
                stroke={col} strokeWidth={isSelReg ? 3 : 2} strokeDasharray="8,4"/>
              {/* Selection handles on corners */}
              {isSelReg && pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={6} fill="white" stroke={col} strokeWidth={2}/>
              ))}
              <text x={c.x} y={c.y - (isSelReg ? 8 : 0)} textAnchor="middle" dominantBaseline="middle"
                fontSize={10} fill={col} fontWeight="600" style={{ pointerEvents:'none', userSelect:'none' }}>
                {label}
              </text>
              <text x={c.x} y={c.y + (isSelReg ? 8 : 10)} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill={col} opacity={0.8} style={{ pointerEvents:'none', userSelect:'none' }}>
                U{ir.uValue} W/m²K
              </text>
            </g>
          )
        })}

        {/* Draw insulation preview */}
        {tool === 'drawInsul' && drawStart && drawCurrent && (() => {
          const a = toScreen(drawStart, vp), b = toScreen(drawCurrent, vp)
          const x = Math.min(a.x,b.x), y = Math.min(a.y,b.y)
          const w = Math.abs(b.x-a.x), h = Math.abs(b.y-a.y)
          const col = drawingInsulType === 'ceiling' ? '#3b82f6' : '#f59e0b'
          const label = drawingInsulType === 'ceiling' ? 'Ceiling insulation' : 'Floor insulation'
          return (
            <g>
              <rect x={x} y={y} width={w} height={h}
                fill={col} fillOpacity={0.15} stroke={col} strokeWidth={2} strokeDasharray="8,4"/>
              {w > 80 && <text x={x+w/2} y={y+h/2} textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fill={col} fontWeight="600">{label}</text>}
            </g>
          )
        })()}

        {/* Active floor rooms:
            - In rooms mode: render normally (interactive)
            - In floor/ceiling layer mode: render as non-interactive ghost outlines */}
        {activeLayerMode === 'rooms'
          ? <>
              {floorRooms.filter(r => r.id !== selectedId).map(r => renderRoom(r))}
              {floorRooms.filter(r => r.id === selectedId).map(r => renderRoom(r))}
            </>
          : floorRooms.map(r => {
              const pts = r.vertices.map(v => toScreen(v, vp))
              const ptsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
              const c = polyCentroid(pts)
              const lSz = Math.max(7, Math.min(11, mmToPx(1400, vp.zoom)))
              return (
                <g key={`layerghst_${r.id}`} opacity={0.5} style={{ pointerEvents: 'none' }}>
                  <polygon points={ptsStr} fill="#eff6ff" stroke="#93c5fd" strokeWidth={2} strokeDasharray="6,3"/>
                  {lSz > 6 && <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle"
                    fontSize={lSz} fill="#60a5fa" fontWeight="500" style={{ userSelect:'none' }}>
                    {r.name || r.roomType}
                  </text>}
                </g>
              )
            })
        }

        {/* Draw preview */}
        {tool === 'draw' && drawStart && drawCurrent && (() => {
          const a = toScreen(drawStart, vp), b = toScreen(drawCurrent, vp)
          const x = Math.min(a.x,b.x), y = Math.min(a.y,b.y)
          const w = Math.abs(b.x-a.x), h = Math.abs(b.y-a.y)
          const wMm = Math.abs(drawCurrent.x-drawStart.x), hMm = Math.abs(drawCurrent.y-drawStart.y)
          return (
            <g>
              <rect x={x} y={y} width={w} height={h}
                fill="#d1fae5" fillOpacity={0.5} stroke="#059669" strokeWidth={2} strokeDasharray="6,3"/>
              {w > 60 && <text x={x+w/2} y={y-6} textAnchor="middle" fontSize={10} fill="#059669" fontFamily="monospace">
                {(wMm/1000).toFixed(2)}m × {(hMm/1000).toFixed(2)}m
              </text>}
            </g>
          )
        })()}

        {/* Scale bar */}
        <g transform={`translate(${size.w-130},${size.h-28})`}>
          <rect x={0} y={0} width={110} height={20} fill="rgba(255,255,255,0.9)" rx={4}/>
          <line x1={10} y1={14} x2={100} y2={14} stroke="#374151" strokeWidth={2}/>
          <line x1={10} y1={10} x2={10} y2={18} stroke="#374151" strokeWidth={1.5}/>
          <line x1={100} y1={10} x2={100} y2={18} stroke="#374151" strokeWidth={1.5}/>
          <text x={55} y={9} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="monospace">
            {pxToMm(90,vp.zoom)>=1000 ? `${(pxToMm(90,vp.zoom)/1000).toFixed(1)}m` : `${Math.round(pxToMm(90,vp.zoom))}mm`}
          </text>
        </g>

        {/* Context hint */}
        <text x={10} y={16} fontSize={10} fill="#9ca3af">
          {tool==='draw' && 'Click and drag to draw a room'}
          {tool==='drawInsul' && `Click and drag to draw ${drawingInsulType} insulation region`}
          {!selectedId && !['draw','drawInsul','addWindow','addDoor','addRadiator','addUFH'].includes(tool) && 'Click a room to select · Drag to move · Drag empty space to pan'}
          {selectedId && !['draw','drawInsul','addWindow','addDoor','addRadiator','addUFH'].includes(tool) && 'Drag to move · Drag corner to resize · Drag wall to push/pull · Dbl-click edge to add vertex · Right-click vertex to delete · Right-click wall for type'}
          {(tool==='addWindow'||tool==='addDoor'||tool==='addRadiator'||tool==='addUFH') && `Click on a wall to place · Right-click element to delete`}
        </text>
      </svg>

      {/* Wall type context menu */}
      {ctxMenu && ctxMenu.wallIdx !== undefined && (() => {
        const room = rooms.find(r => r.id === ctxMenu.roomId)
        const curType = room?.wallTypes[ctxMenu.wallIdx] || 'external'
        const r = svgRef.current?.getBoundingClientRect()
        const mx = r ? ctxMenu.px.x : ctxMenu.px.x
        const my = r ? ctxMenu.px.y : ctxMenu.px.y
        return (
          <div className="absolute bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-50 min-w-[160px]"
            style={{ left: Math.min(mx, size.w-180), top: Math.min(my, size.h-200) }}>
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100">Wall type</div>
            {(['external','internal','party','open'] as WallType[]).map(t => (
              <button key={t} onClick={() => {
                onRoomsChange(rooms.map(r => r.id!==ctxMenu.roomId?r:{...r,wallTypes:r.wallTypes.map((wt,i)=>i===ctxMenu.wallIdx?t:wt)}))
                setCtxMenu(null)
              }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-gray-50 ${t===curType?'text-emerald-700 font-semibold bg-emerald-50':'text-gray-700'}`}>
                <svg width={18} height={6}><line x1={0} y1={3} x2={18} y2={3} stroke={WALL_COLOR[t]} strokeWidth={2} strokeDasharray={WALL_DASH[t]}/></svg>
                <span className="capitalize">{t} wall</span>
                {t===curType && <span className="ml-auto">✓</span>}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1">
              <button onClick={() => setCtxMenu(null)} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
})

DesignCanvas.displayName = 'DesignCanvas'



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

const ROOM_TYPES = [
  { type: 'Living room',    icon: '🛋', temp: 21, ach: 1.5 },
  { type: 'Dining room',   icon: '🍽', temp: 21, ach: 1.5 },
  { type: 'Kitchen',       icon: '🍳', temp: 18, ach: 2.0 },
  { type: 'Bedroom',       icon: '🛏', temp: 18, ach: 1.0 },
  { type: 'Bathroom',      icon: '🚿', temp: 22, ach: 2.0 },
  { type: 'En-suite',      icon: '🛁', temp: 22, ach: 2.0 },
  { type: 'Hall / Landing',icon: '🚪', temp: 18, ach: 1.5 },
  { type: 'Study',         icon: '💻', temp: 21, ach: 1.5 },
  { type: 'Utility room',  icon: '🧺', temp: 16, ach: 2.0 },
  { type: 'WC',            icon: '🚽', temp: 18, ach: 2.0 },
  { type: 'Conservatory',  icon: '🌿', temp: 21, ach: 1.5 },
  { type: 'Garage',        icon: '🚗', temp: 10, ach: 0.5 },
  { type: 'Other',         icon: '📦', temp: 18, ach: 1.5 },
]

const WALL_PRESETS = [
  { id: 'solid_unins',  label: 'Solid brick — uninsulated',       u: 2.1  },
  { id: 'solid_ext',   label: 'Solid brick — ext insulation',    u: 0.29 },
  { id: 'solid_int',   label: 'Solid brick — int insulation',    u: 0.27 },
  { id: 'cavity_unins',label: 'Cavity — uninsulated',            u: 1.5  },
  { id: 'cavity_min',  label: 'Cavity — full fill mineral wool', u: 0.33 },
  { id: 'cavity_pir',  label: 'Cavity — partial fill PIR',       u: 0.25 },
  { id: 'timber',      label: 'Timber frame — 140mm mineral',    u: 0.22 },
  { id: 'new_build',   label: 'New build (post-2012)',            u: 0.18 },
]

const WINDOW_PRESETS = [
  { id: 'single',   label: 'Single glazed',         u: 4.8 },
  { id: 'secondary',label: 'Secondary glazed',      u: 2.4 },
  { id: 'dbl_old',  label: 'Double pre-2002',       u: 2.8 },
  { id: 'dbl_new',  label: 'Double post-2002',      u: 2.0 },
  { id: 'dbl_lowe', label: 'Double low-E',          u: 1.4 },
  { id: 'triple',   label: 'Triple glazed',         u: 0.8 },
]

const CEILING_PRESETS = [
  { id: 'heated',     label: 'Heated room above',       u: 0.0  },
  { id: 'pitched_100',label: 'Pitched — 100mm ins',     u: 0.25 },
  { id: 'pitched_150',label: 'Pitched — 150mm ins',     u: 0.16 },
  { id: 'pitched_200',label: 'Pitched — 200mm ins',     u: 0.13 },
  { id: 'pitched_none',label: 'Pitched — no insulation',u: 2.0  },
  { id: 'flat',       label: 'Flat roof — insulated',   u: 0.18 },
]

const FLOOR_PRESETS = [
  { id: 'ground_unins', label: 'Solid — uninsulated',    u: 0.70 },
  { id: 'ground_50pir', label: 'Solid — 50mm PIR',       u: 0.36 },
  { id: 'ground_100pir',label: 'Solid — 100mm PIR',      u: 0.20 },
  { id: 'susp_unins',   label: 'Suspended — uninsulated',u: 0.70 },
  { id: 'susp_ins',     label: 'Suspended — 100mm mineral',u:0.28},
  { id: 'heated_below', label: 'Heated space below',     u: 0.0  },
]

// ─── Room heat loss ───────────────────────────────────────────────────────────

type RoomProps = {
  wallU: number; windowU: number; windowAreaM2: number; extDoorAreaM2: number
  floorU: number; floorAdj: string; ceilU: number; ceilAdj: string
  designTempC: number; ach: number | null; hasOpenFlue: boolean
  heightMm: number
}

const DEFAULT_ROOM_PROPS: RoomProps = {
  wallU: 1.5, windowU: 2.0, windowAreaM2: 0, extDoorAreaM2: 0,
  floorU: 0.45, floorAdj: 'ground', ceilU: 0.25, ceilAdj: 'heated',
  designTempC: 21, ach: null, hasOpenFlue: false, heightMm: 2400,
}

function calcHeatLoss(room: CanvasRoom, props: RoomProps, extTemp: number): number {
  const area = Math.abs(room.vertices.reduce((s, v, i) => {
    const j = (i + 1) % room.vertices.length
    return s + v.x * room.vertices[j].y - room.vertices[j].x * v.y
  }, 0)) / 2 / 1e6

  if (area < 0.1) return 0
  const dT = props.designTempC - extTemp
  if (dT <= 0) return 0

  const perim = room.vertices.reduce((s, v, i) => {
    const b = room.vertices[(i+1) % room.vertices.length]
    return s + Math.sqrt((b.x-v.x)**2 + (b.y-v.y)**2) / 1000
  }, 0)

  // Count external walls only
  const extWalls = room.wallTypes.filter(wt => wt === 'external').length
  const totalWalls = room.wallTypes.length
  const extFraction = totalWalls > 0 ? extWalls / totalWalls : 1
  const extWallArea = perim * (props.heightMm/1000) * extFraction

  const winArea = props.windowAreaM2 > 0 ? props.windowAreaM2 : area * 0.15 * extFraction
  const doorArea = props.extDoorAreaM2

  const floorAdjTemp = props.floorAdj === 'ground' ? 10
    : props.floorAdj === 'heated' ? props.designTempC
    : props.floorAdj === 'unheated' ? (props.designTempC + extTemp) / 2
    : extTemp

  const ceilAdjTemp = props.ceilAdj === 'heated' ? props.designTempC
    : props.ceilAdj === 'unheated' ? (props.designTempC + extTemp) / 2
    : extTemp

  const rt = ROOM_TYPES.find(t => t.type === room.roomType)
  const baseAch = rt?.ach || 1.5
  const ach = (props.ach !== null ? props.ach : baseAch) + (props.hasOpenFlue ? 1.5 : 0)

  const fabric = Math.max(0,
    Math.max(0, extWallArea - winArea - doorArea) * props.wallU * dT +
    winArea * props.windowU * dT +
    doorArea * 3.0 * dT +
    area * props.floorU * (props.designTempC - floorAdjTemp) +
    (props.ceilAdj !== 'heated' ? area * props.ceilU * (props.designTempC - ceilAdjTemp) : 0)
  )

  const vent = 0.33 * ach * area * (props.heightMm/1000) * dT

  return Math.round(fabric + vent)
}

// ─── Main component ───────────────────────────────────────────────────────────


// ─── Isometric block component ────────────────────────────────────────────────
// Renders a 3D isometric box like in the reference image
function IsometricBlock({
  active, dashed, color, label, width = 120, height = 40
}: {
  active: boolean
  dashed: boolean
  color: 'emerald' | 'white' | 'gray' | 'amber' | 'stone'
  label: string
  width?: number
  height?: number
}) {
  // Isometric projection: top face + right face + left face
  const W = width, H = height
  const depth = Math.round(H * 0.35)   // depth of side faces
  const skew = Math.round(W * 0.18)    // horizontal skew for isometric look

  // Key points (flat 2D isometric projection)
  // Top face (parallelogram)
  const topLeft   = { x: skew, y: depth }
  const topRight  = { x: W - skew, y: depth }
  const topFront  = { x: W, y: depth * 2 }
  const topFarLeft = { x: 0, y: depth * 2 }
  // Bottom of front face
  const botRight  = { x: W, y: depth * 2 + H }
  const botLeft   = { x: 0, y: depth * 2 + H }

  const totalH = depth * 2 + H

  // Colours
  const COLORS = {
    emerald: { top: '#d1fae5', front: '#a7f3d0', right: '#6ee7b7', stroke: '#059669', text: '#065f46' },
    white:   { top: '#f9fafb', front: '#f3f4f6', right: '#e5e7eb', stroke: '#9ca3af', text: '#6b7280' },
    gray:    { top: '#f3f4f6', front: '#e5e7eb', right: '#d1d5db', stroke: '#9ca3af', text: '#9ca3af' },
    amber:   { top: '#fef3c7', front: '#fde68a', right: '#fcd34d', stroke: '#f59e0b', text: '#92400e' },
    stone:   { top: '#e7e5e4', front: '#d6d3d1', right: '#a8a29e', stroke: '#78716c', text: '#44403c' },
  }
  const c = COLORS[color]
  const sw = active ? 2 : 1.5
  const dash = dashed ? '5,3' : 'none'

  const topPath   = `M${topLeft.x},${topLeft.y} L${topRight.x},${topRight.y} L${topFront.x},${topFront.y} L${topFarLeft.x},${topFarLeft.y} Z`
  const frontPath = `M${topFarLeft.x},${topFarLeft.y} L${topFront.x},${topFront.y} L${botRight.x},${botRight.y} L${botLeft.x},${botLeft.y} Z`
  // Right side face (right half of front, slightly different shade)
  const midTop = { x: (topFront.x + topRight.x) / 2, y: (topFront.y + topRight.y) / 2 }
  const midBot = { x: (botRight.x + W/2), y: (botRight.y + depth*2+H) / 2 }

  // Label position — centre of front face
  const labelX = W / 2
  const labelY = topFarLeft.y + (H / 2) + depth * 0.5

  return (
    <svg width={W} height={totalH} viewBox={`0 0 ${W} ${totalH}`} style={{ overflow: 'visible', display: 'block' }}>
      {/* Top face */}
      <path d={topPath} fill={c.top} stroke={c.stroke} strokeWidth={sw} strokeDasharray={dash}/>
      {/* Front face (left half) */}
      <path d={frontPath} fill={c.front} stroke={c.stroke} strokeWidth={sw} strokeDasharray={dash}/>
      {/* Label */}
      {label && (
        <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fill={c.text} fontWeight={active ? '700' : '500'}
          fontFamily="'Segoe UI', sans-serif"
          style={{ userSelect: 'none' }}>
          {label}
        </text>
      )}
      {/* Active indicator dot on top face */}
      {active && (
        <circle cx={W/2} cy={depth * 1.2} r={3} fill="#059669"/>
      )}
    </svg>
  )
}

export default function DesignPage() {
  const params = useParams()
  const jobId = params.id as string
  const canvasRef = useRef<CanvasRef>(null)

  const [rooms, setRooms] = useState<CanvasRoom[]>([])
  const [roomProps, setRoomProps] = useState<Record<string, RoomProps>>({})
  const [activeFloor, setActiveFloor] = useState(0)
  const [tool, setTool] = useState<CanvasTool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [gridMm, setGridMm] = useState(100)
  const [showGrid, setShowGrid] = useState(true)
  const [showDims, setShowDims] = useState(true)
  const [showHeatLoss, setShowHeatLoss] = useState(true)
  const [bgImage, setBgImage] = useState<string | undefined>()
  const [showLayerFAB, setShowLayerFAB] = useState(false)
  const [floorNames, setFloorNames] = useState<Record<number,string>>({ 0: 'Ground floor' })
  const [editingFloorName, setEditingFloorName] = useState<number | null>(null)
  const [insulLayers, setInsulLayers] = useState<Array<{id:string;betweenFloors:[number,number];label:string;uValue:number}>>([])
  const [insulRegions, setInsulRegions] = useState<Array<{
    id: string; floor: number; vertices: {x:number;y:number}[]; uValue: number
    type: 'floor' | 'ceiling'; construction: string; insulationMm: number; label: string
  }>>([])
  const [drawingInsulFloor, setDrawingInsulFloor] = useState<number | null>(null)
  const [drawingInsulType, setDrawingInsulType] = useState<'floor'|'ceiling'>('floor')
  const [activeLayerMode, setActiveLayerMode] = useState<'rooms' | 'floor' | 'ceiling'>('rooms')
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [showRoomPicker, setShowRoomPicker] = useState(false)
  const [customer, setCustomer] = useState<any>(null)
  const [existingDesign, setExistingDesign] = useState<any>(null)
  const [location, setLocation] = useState('Birmingham')
  const [designTempExt, setDesignTempExt] = useState(-4)
  const [totalFloorAreaM2, setTotalFloorAreaM2] = useState(85)
  const [numBedrooms, setNumBedrooms] = useState(3)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => { load() }, [jobId])

  // Recalc all rooms when ext temp changes
  useEffect(() => {
    setRooms(prev => prev.map(r => {
      const props = roomProps[r.id] || DEFAULT_ROOM_PROPS
      return { ...r, heatLossW: calcHeatLoss(r, props, designTempExt) }
    }))
  }, [designTempExt, roomProps])

  async function load() {
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
      if (di.location) setLocation(di.location)
      if (di.designTempExt !== undefined) setDesignTempExt(di.designTempExt)
      if (di.totalFloorAreaM2) setTotalFloorAreaM2(di.totalFloorAreaM2)
      if (di.numBedrooms) setNumBedrooms(di.numBedrooms)
      if (di.rooms) {
        const rp: Record<string, RoomProps> = di.roomProps || {}
        setRoomProps(rp)
        setRooms(di.rooms.map((r: CanvasRoom) => ({
          ...r, heatLossW: calcHeatLoss(r, rp[r.id] || DEFAULT_ROOM_PROPS, di.designTempExt || -4)
        })))
      }
    } else if (cd) {
      const loc = guessLoc(cd.postcode || '')
      setLocation(loc)
      setDesignTempExt(DESIGN_TEMPS[loc]?.temp || -4)
      setTotalFloorAreaM2(cd.floor_area_m2 || 85)
    }
  }

  function guessLoc(pc: string): string {
    const p = pc.slice(0,2).toUpperCase()
    const m: Record<string,string> = { EC:'London',WC:'London',E:'London',N:'London',NW:'London',SE:'London',SW:'London',W:'London',B:'Birmingham',WS:'Birmingham',M:'Manchester',L:'Manchester',LS:'Leeds',NE:'Newcastle',BS:'Bristol',CF:'Cardiff',EH:'Edinburgh',G:'Glasgow',AB:'Aberdeen',BT:'Belfast',NR:'Norwich',PL:'Plymouth',S:'Sheffield',NG:'Nottingham' }
    for (const [k,v] of Object.entries(m)) if (p.startsWith(k)) return v
    return 'Birmingham'
  }

  function handleRoomsChange(newRooms: CanvasRoom[]) {
    // Recalc heat loss for any room that changed shape or wall types
    const recalculated = newRooms.map(r => {
      const props = roomProps[r.id] || DEFAULT_ROOM_PROPS
      return { ...r, heatLossW: calcHeatLoss(r, props, designTempExt) }
    })
    setRooms(recalculated)
  }

  function handleSelect(id: string | null, type?: 'room' | 'element', elementId?: string) {
    setSelectedId(id)
    setSelectedElementId(elementId || null)
    setShowRoomPicker(false)
  }

  function updRoomProp(id: string, updates: Partial<RoomProps>) {
    const current = roomProps[id] || DEFAULT_ROOM_PROPS
    const next = { ...current, ...updates }
    setRoomProps(prev => ({ ...prev, [id]: next }))
    // Recalc this room
    setRooms(prev => prev.map(r => r.id !== id ? r : {
      ...r, heatLossW: calcHeatLoss(r, next, designTempExt)
    }))
  }

  function updRoomType(id: string, roomType: string) {
    const rt = ROOM_TYPES.find(t => t.type === roomType)
    setRooms(prev => prev.map(r => r.id !== id ? r : { ...r, roomType }))
    if (rt) {
      updRoomProp(id, { designTempC: rt.temp, ach: null })
    }
  }

  function updRoomName(id: string, name: string) {
    setRooms(prev => prev.map(r => r.id !== id ? r : { ...r, name }))
  }

  function updElement(roomId: string, elemId: string, updates: Partial<WallElement>) {
    setRooms(prev => prev.map(r => r.id !== roomId ? r : {
      ...r, elements: r.elements.map(e => e.id !== elemId ? e : { ...e, ...updates })
    }))
  }

  function addFloor() {
    const maxFloor = Math.max(0, ...[0, ...rooms.map(r => r.floor)])
    const newFloor = maxFloor + 1
    const floorLabel = newFloor === 1 ? 'First floor' : newFloor === 2 ? 'Second floor' : newFloor === 3 ? 'Third floor' : `Floor ${newFloor}`
    setFloorNames(prev => ({ ...prev, [newFloor]: floorLabel }))
    setInsulLayers(prev => [...prev, {
      id: `ins_${Date.now()}`,
      betweenFloors: [maxFloor, newFloor] as [number,number],
      label: `Floor/ceiling insulation (between ${floorNames[maxFloor] || `Floor ${maxFloor}`} and ${floorLabel})`,
      uValue: 0.25,
    }])
    setActiveFloor(newFloor)
  }

  function getFloorName(f: number): string {
    return floorNames[f] || (f === 0 ? 'Ground floor' : f === 1 ? 'First floor' : f === 2 ? 'Second floor' : `Floor ${f}`)
  }

  const floors = Array.from(new Set([0, ...rooms.map(r => r.floor)])).sort((a,b) => a-b)
  const selectedRoom = rooms.find(r => r.id === selectedId) || null
  const selectedProps = selectedId ? (roomProps[selectedId] || DEFAULT_ROOM_PROPS) : null
  const selectedElem = selectedRoom?.elements.find(e => e.id === selectedElementId) || null

  const totalW = rooms.reduce((s,r) => s+(r.heatLossW||0), 0)
  const shl = totalFloorAreaM2 > 0 ? Math.round(totalW/totalFloorAreaM2) : 0
  const recKw = Math.ceil(totalW/1000)

  async function save(redirect?: string) {
    setSaving(true); setSaveError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: sd } = await (supabase as any).from('system_designs').select('design_inputs').eq('job_id', jobId).single()
      const existing = sd?.design_inputs || {}
      const payload = {
        design_inputs: {
          ...existing,
          location, designTempExt, totalFloorAreaM2, numBedrooms,
          rooms: rooms.map(r => ({ ...r })), // strip heatLossW? no, keep it for proposal
          roomProps,
        },
        total_heat_loss_w: totalW,
        specific_heat_loss_w_m2: shl,
        recommended_hp_kw: recKw,
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
      setSaving(false); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      if (redirect) window.location.href = redirect
    } catch (e: any) { setSaveError(e.message); setSaving(false) }
  }

  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const sel = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"

  const TOOLS: { id: CanvasTool; icon: string; label: string; color?: string }[] = [
    { id: 'draw',        icon: '⬛', label: 'Draw room' },
    { id: 'addWindow',   icon: '🪟', label: 'Window',   color: 'text-blue-600' },
    { id: 'addDoor',     icon: '🚪', label: 'Door',     color: 'text-amber-600' },
    { id: 'addRadiator', icon: '🔥', label: 'Radiator', color: 'text-red-600' },
    { id: 'addUFH',      icon: '♨',  label: 'UFH zone', color: 'text-emerald-600' },
  ]

  return (
    <div className="flex flex-col bg-gray-100" style={{ height: '100dvh' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-emerald-700 rounded flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          {customer && <span className="text-xs font-medium text-gray-700 hidden sm:block">{customer.first_name} {customer.last_name}</span>}
          <span className="text-xs text-gray-400 hidden sm:block">·</span>
          {/* Location */}
          <select className="text-xs border border-gray-200 rounded-lg px-2 py-1 hidden sm:block focus:outline-none focus:border-emerald-500"
            value={location} onChange={e => { setLocation(e.target.value); setDesignTempExt(DESIGN_TEMPS[e.target.value]?.temp || -4) }}>
            {Object.entries(DESIGN_TEMPS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="text-xs text-gray-400 hidden sm:block">{designTempExt}°C</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button onClick={() => canvasRef.current?.zoomOut()} className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg text-sm hover:bg-gray-50">−</button>
          <button onClick={() => canvasRef.current?.fitToScreen()} className="text-xs border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50">Fit</button>
          <button onClick={() => canvasRef.current?.zoomIn()} className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg text-sm hover:bg-gray-50">+</button>

          {/* Grid */}
          <select className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none hidden sm:block"
            value={gridMm} onChange={e => setGridMm(parseInt(e.target.value))}>
            <option value={50}>50mm</option><option value={100}>100mm</option>
            <option value={250}>250mm</option><option value={500}>500mm</option>
          </select>

          {/* Toggle buttons */}
          <button onClick={() => setShowDims(p => !p)}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors hidden sm:block ${showDims ? 'bg-gray-100 border-gray-300 text-gray-700' : 'border-gray-200 text-gray-400'}`}>
            Dims
          </button>
          <button onClick={() => setShowHeatLoss(p => !p)}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors hidden sm:block ${showHeatLoss ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-gray-200 text-gray-400'}`}>
            Heat
          </button>

          {/* Totals */}
          {totalW > 0 && (
            <div className="hidden md:flex items-center gap-1.5">
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-mono">{(totalW/1000).toFixed(1)}kW</span>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-semibold">{recKw}kW rec</span>
            </div>
          )}

          {saveError && <span className="text-xs text-red-600">{saveError}</span>}
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600 hidden sm:block">← Job</a>
          <a href={`/jobs/${jobId}/noise`} className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 hidden sm:block">
            🔊 Noise
          </a>
          <button onClick={() => save(`/jobs/${jobId}/design/system`)} disabled={saving}
            className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-400 text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-lg hidden sm:block">
            Emitter spec →
          </button>
          <button onClick={() => save()} disabled={saving}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
            {saving ? '...' : saved ? '✓' : 'Save'}
          </button>
        </div>
      </div>

      {/* MCS strip */}
      <div className="bg-emerald-700 text-white px-3 py-1 text-xs flex items-center gap-3 flex-shrink-0">
        <span className="font-medium">MCS Compliant</span>
        <span>MIS 3005-D · BS EN 12831-1:2017</span>
        <span className="ml-auto">{DESIGN_TEMPS[location]?.label} · {designTempExt}°C ext design temp</span>
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left tool palette ────────────────────────────────────────────── */}
        <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-1.5 flex-shrink-0">
          {/* In floor/ceiling layer mode, only show draw tool + exit button */}
          {activeLayerMode !== 'rooms' && (
            <div className="w-full flex flex-col items-center gap-1.5 pb-2 border-b border-gray-100">
              <div className="text-xs text-center font-medium text-amber-700 leading-tight px-1" style={{ fontSize: '8px' }}>
                {activeLayerMode === 'floor' ? 'FLOOR' : 'CEILING'}<br/>MODE
              </div>
              <button onClick={() => setTool('drawInsul')} title="Draw region"
                className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${tool === 'drawInsul' ? 'bg-amber-600 text-white shadow-md' : 'bg-white text-amber-600 hover:bg-amber-50 border border-amber-200'}`}>
                <span className="text-2xl leading-none">⬛</span>
                <span className="font-medium" style={{ fontSize: '8px' }}>Draw</span>
              </button>
              <button onClick={() => { setActiveLayerMode('rooms'); setTool('select'); setSelectedRegionId(null) }} title="Back to rooms"
                className="w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 bg-white text-gray-500 hover:bg-gray-50 border border-gray-200 transition-colors">
                <span className="text-xl leading-none">↩</span>
                <span className="font-medium" style={{ fontSize: '8px' }}>Rooms</span>
              </button>
            </div>
          )}

          {activeLayerMode === 'rooms' && TOOLS.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)} title={t.label}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${tool === t.id ? 'bg-emerald-700 text-white shadow-md' : `bg-white ${t.color || 'text-gray-600'} hover:bg-gray-50 border border-gray-200`}`}>
              <span className="text-2xl leading-none">{t.icon}</span>
              <span className="font-medium" style={{ fontSize: '8px' }}>{t.label.split(' ')[0]}</span>
            </button>
          ))}

          <div className="flex-1"/>

          {/* Upload plan */}
          <label className="w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 bg-white text-gray-400 hover:bg-gray-100 border border-gray-200 cursor-pointer" title="Upload floor plan">
            <span className="text-base leading-none">📐</span>
            <span className="text-xs" style={{ fontSize: '7px' }}>Upload</span>
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              const r = new FileReader()
              r.onload = ev => setBgImage(ev.target?.result as string)
              r.readAsDataURL(f)
            }}/>
          </label>

          {bgImage && (
            <button onClick={() => setBgImage(undefined)} title="Clear plan"
              className="w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 bg-red-50 text-red-500 hover:bg-red-100 border border-red-200">
              <span className="text-base leading-none">🗑</span>
              <span className="text-xs" style={{ fontSize: '7px' }}>Clear</span>
            </button>
          )}

          {/* Delete selected */}
          {selectedId && (
            <button onClick={() => canvasRef.current?.deleteSelected()} title="Delete selected"
              className="w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 bg-red-50 text-red-500 hover:bg-red-100 border border-red-200">
              <span className="text-base leading-none">🗑</span>
              <span className="text-xs" style={{ fontSize: '7px' }}>Del</span>
            </button>
          )}
        </div>

        {/* ── Canvas ───────────────────────────────────────────────────────── */}
        <div className="flex-1 relative min-w-0">
          <DesignCanvas
            ref={canvasRef}
            rooms={rooms}
            activeFloor={activeFloor}
            tool={tool}
            gridMm={gridMm}
            showGrid={showGrid}
            showDims={showDims}
            showHeatLoss={showHeatLoss}
            bgImage={bgImage}
            onRoomsChange={handleRoomsChange}
            onSelect={handleSelect}
            onToolChange={(t) => { setTool(t) }}
            drawingInsulFloor={drawingInsulFloor}
            drawingInsulType={drawingInsulType}
            insulRegions={insulRegions}
            onInsulRegionAdd={r => setInsulRegions(prev => [...prev, r])}
            insulLayerDefaultU={f => insulLayers.find(il => il.betweenFloors[1] === f || il.betweenFloors[0] === f)?.uValue || 0.25}
            activeLayerMode={activeLayerMode}
            selectedRegionId={selectedRegionId}
            onRegionSelect={setSelectedRegionId}
            selectedId={selectedId}
            selectedElementId={selectedElementId}
          />

          {/* ── Layer FAB — isometric exploded building view ─────────── */}
          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-3">

            {/* Expanded panel */}
            {showLayerFAB && (
              <div className="flex items-start gap-4 select-none">

                {/* Left column: labels + connector line */}
                <div className="flex flex-col items-end" style={{ gap: 0 }}>
                  {/* Add Level */}
                  <div className="flex items-center gap-2 h-14 justify-end">
                    <span className="text-xs text-gray-400 font-medium">Add Level</span>
                    <div className="w-2 h-2 rounded-full border-2 border-gray-400 bg-white"/>
                  </div>
                  <div className="w-px bg-gray-300 self-end mr-[3px]" style={{ height: 4 }}/>

                  {/* Dynamic floors — top to bottom */}
                  {[...floors].reverse().map((f, fi, arr) => {
                    const isActive = f === activeFloor
                    const hasCeiling = insulLayers.some(il => il.betweenFloors[1] === f)
                    const floorRoomCount = rooms.filter(r => r.floor === f).length
                    return (
                      <div key={`lbl_${f}`} className="flex flex-col items-end">
                        {/* Between-floor insulation label */}
                        {hasCeiling && fi > 0 && (
                          <>
                            <div className="w-px bg-gray-300 self-end mr-[3px]" style={{ height: 4 }}/>
                            <div className="flex items-center gap-2 h-8 justify-end">
                              <span className="text-xs text-amber-600 font-medium">Floor / Ceiling insulation</span>
                              <div className="w-2 h-2 rounded-full border-2 border-amber-400 bg-white"/>
                            </div>
                            <div className="w-px bg-gray-300 self-end mr-[3px]" style={{ height: 4 }}/>
                          </>
                        )}
                        {/* Ceiling sub-layer label */}
                        {floorRoomCount > 0 && (
                          <div className="flex items-center gap-2 h-9 justify-end">
                            <span className={`text-xs ${isActive && activeLayerMode === 'ceiling' ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>Ceiling</span>
                            <div className={`w-2 h-2 rounded-full border-2 ${isActive && activeLayerMode === 'ceiling' ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'}`}/>
                          </div>
                        )}
                        {/* Floor name label */}
                        <div className="flex items-center gap-2 h-14 justify-end">
                          {isActive && (
                            <button onClick={e => { e.stopPropagation(); setEditingFloorName(f) }}
                              className="text-gray-300 hover:text-gray-500 text-xs">✏</button>
                          )}
                          {editingFloorName === f ? (
                            <input type="text" autoFocus value={getFloorName(f)}
                              className="text-xs font-bold text-emerald-700 border border-emerald-400 rounded px-1 py-0.5 w-24 text-right"
                              onChange={e => setFloorNames(prev => ({ ...prev, [f]: e.target.value }))}
                              onBlur={() => setEditingFloorName(null)}
                              onKeyDown={e => { if (e.key === 'Enter') setEditingFloorName(null) }}
                              onClick={e => e.stopPropagation()}/>
                          ) : (
                            <span className={`text-xs font-bold ${isActive && activeLayerMode === 'rooms' ? 'text-emerald-700' : 'text-gray-500'}`}>
                              {getFloorName(f)}
                            </span>
                          )}
                          <div className={`w-2.5 h-2.5 rounded-full border-2 ${isActive && activeLayerMode === 'rooms' ? 'border-emerald-500 bg-emerald-500' : 'border-gray-400 bg-white'}`}/>
                        </div>
                        {/* Floor sub-layer label */}
                        {floorRoomCount > 0 && (
                          <div className="flex items-center gap-2 h-9 justify-end">
                            <span className={`text-xs ${isActive && activeLayerMode === 'floor' ? 'text-amber-600 font-bold' : 'text-gray-400'}`}>Floor</span>
                            <div className={`w-2 h-2 rounded-full border-2 ${isActive && activeLayerMode === 'floor' ? 'border-amber-500 bg-amber-500' : 'border-gray-300 bg-white'}`}/>
                          </div>
                        )}
                        {fi < arr.length - 1 && <div className="w-px bg-gray-300 self-end mr-[3px]" style={{ height: 4 }}/>}
                      </div>
                    )
                  })}

                  {/* Connector + collapse */}
                  <div className="w-px bg-gray-300 self-end mr-[3px]" style={{ height: 4 }}/>
                  <div className="flex items-center gap-2 h-12 justify-end">
                    <button onClick={() => setShowLayerFAB(false)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
                      Collapse
                      <div className="w-5 h-5 rounded-full border border-gray-300 bg-white flex items-center justify-center">
                        <svg width="8" height="6" viewBox="0 0 8 6"><path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Right column: isometric layer blocks */}
                <div className="flex flex-col items-center" style={{ gap: 0 }}>
                  {/* Add Level block — dashed */}
                  <button onClick={() => { addFloor() }}
                    style={{ height: 56, display: 'flex', alignItems: 'center' }}>
                    <IsometricBlock active={false} dashed={true} color="gray" label="+ add floor" width={120} height={40}/>
                  </button>

                  {/* Floor stack */}
                  {[...floors].reverse().map((f, fi, arr) => {
                    const isActive = f === activeFloor
                    const fRooms = rooms.filter(r => r.floor === f)
                    const fTotal = fRooms.reduce((s: number, r: any) => s + (r.heatLossW || 0), 0)
                    const hasCeiling = insulLayers.some(il => il.betweenFloors[1] === f)
                    return (
                      <div key={`blk_${f}`} className="flex flex-col items-center">
                        {/* Between-floor insulation block */}
                        {fi > 0 && (hasCeiling ? (
                          <button style={{ height: 32, display: 'flex', alignItems: 'center' }}
                            onClick={() => { setDrawingInsulFloor(f); setDrawingInsulType('floor'); setTool('drawInsul'); setShowLayerFAB(false) }}>
                            <IsometricBlock active={false} dashed={false} color="amber" label="Floor/Ceiling ins." width={120} height={20}/>
                          </button>
                        ) : (
                          <button style={{ height: 32, display: 'flex', alignItems: 'center' }}
                            onClick={() => {
                              const belowFloor = arr[fi - 1]
                              setInsulLayers(prev => [...prev, { id: `ins_${Date.now()}`, betweenFloors: [belowFloor, f] as [number,number], label: 'insulation', uValue: 0.25 }])
                            }}>
                            <IsometricBlock active={false} dashed={true} color="amber" label="+ add insulation" width={120} height={20}/>
                          </button>
                        ))}
                        {/* Ceiling sub-block */}
                        {fRooms.length > 0 && (
                          <button style={{ height: 36, display: 'flex', alignItems: 'center' }}
                            onClick={() => { setActiveFloor(f); setActiveLayerMode('ceiling'); setDrawingInsulFloor(f); setDrawingInsulType('ceiling'); setTool('drawInsul'); setShowLayerFAB(false); setSelectedRegionId(null) }}>
                            <IsometricBlock
                              active={isActive && activeLayerMode === 'ceiling'}
                              dashed={insulRegions.filter(ir => ir.floor === f && ir.type === 'ceiling').length === 0}
                              color={isActive && activeLayerMode === 'ceiling' ? 'amber' : 'gray'}
                              label={insulRegions.filter(ir => ir.floor === f && ir.type === 'ceiling').length > 0 ? `${insulRegions.filter(ir => ir.floor === f && ir.type === 'ceiling').length} region(s)` : '+ draw ceiling'}
                              width={120} height={22}/>
                          </button>
                        )}
                        {/* Rooms block */}
                        <button style={{ height: 56, display: 'flex', alignItems: 'center' }}
                          onClick={() => { setActiveFloor(f); setActiveLayerMode('rooms'); setTool('select'); setShowLayerFAB(false) }}>
                          <IsometricBlock
                            active={isActive && activeLayerMode === 'rooms'}
                            dashed={false}
                            color={isActive && activeLayerMode === 'rooms' ? 'emerald' : 'white'}
                            label={fRooms.length > 0 ? `${fRooms.length}r · ${(fTotal/1000).toFixed(1)}kW` : 'empty'}
                            width={120} height={40}/>
                        </button>
                        {/* Floor sub-block */}
                        {fRooms.length > 0 && (
                          <button style={{ height: 36, display: 'flex', alignItems: 'center' }}
                            onClick={() => { setActiveFloor(f); setActiveLayerMode('floor'); setDrawingInsulFloor(f); setDrawingInsulType('floor'); setTool('drawInsul'); setShowLayerFAB(false); setSelectedRegionId(null) }}>
                            <IsometricBlock
                              active={isActive && activeLayerMode === 'floor'}
                              dashed={insulRegions.filter(ir => ir.floor === f && ir.type === 'floor').length === 0}
                              color={isActive && activeLayerMode === 'floor' ? 'amber' : 'stone'}
                              label={insulRegions.filter(ir => ir.floor === f && ir.type === 'floor').length > 0 ? `${insulRegions.filter(ir => ir.floor === f && ir.type === 'floor').length} region(s)` : '+ draw floor'}
                              width={120} height={22}/>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* FAB button */}
            <button onClick={() => setShowLayerFAB(p => !p)}
              className={`w-14 h-14 rounded-2xl shadow-xl flex flex-col items-center justify-center gap-0.5 transition-all border-2 ${showLayerFAB ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50'}`}>
              {showLayerFAB
                ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
                : <>
                    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                      <rect x="1" y="9" width="18" height="6" rx="1" fill="#d1fae5" stroke="#059669" strokeWidth="1.5"/>
                      <rect x="3" y="4" width="14" height="6" rx="1" fill="#ecfdf5" stroke="#059669" strokeWidth="1.5"/>
                      <rect x="5" y="0" width="10" height="5" rx="1" fill="white" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3,2"/>
                    </svg>
                    <span style={{ fontSize: '8px', fontWeight: 600, color: '#374151' }}>LAYERS</span>
                  </>
              }
            </button>
          </div>

          {/* ── Add room hint (draw tool selected, no rooms on floor) ──────── */}
          {tool === 'draw' && rooms.filter(r=>r.floor===activeFloor).length === 0 && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
              <div className="bg-white/90 border border-gray-200 rounded-2xl px-6 py-4 shadow-lg">
                <div className="text-2xl mb-2">✏</div>
                <div className="text-sm font-medium text-gray-700">Click and drag to draw a room</div>
                <div className="text-xs text-gray-400 mt-1">Drag from one corner to the opposite corner</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right property panel ──────────────────────────────────────────── */}
        {/* Region properties panel — shown when a floor/ceiling region is selected */}
        {selectedRegionId && activeLayerMode !== 'rooms' && (() => {
          const reg = insulRegions.find(r => r.id === selectedRegionId)
          if (!reg) return null
          const col = reg.type === 'ceiling' ? '#3b82f6' : '#f59e0b'
          // Same presets as room property dropdowns
          const CEILING_PRESETS_EXTRA = [
            { id: 'int_heated',    label: 'Intermediate floor — heated room above',    u: 0.0  },
            { id: 'int_unheated',  label: 'Intermediate floor — unheated space above', u: 0.25 },
            { id: 'heated',        label: 'Heated room above',                         u: 0.0  },
            { id: 'pitched_100',   label: 'Pitched — 100mm ins',                       u: 0.25 },
            { id: 'pitched_150',   label: 'Pitched — 150mm ins',                       u: 0.16 },
            { id: 'pitched_200',   label: 'Pitched — 200mm ins',                       u: 0.13 },
            { id: 'pitched_none',  label: 'Pitched — no insulation',                   u: 2.0  },
            { id: 'flat',          label: 'Flat roof — insulated',                     u: 0.18 },
          ]
          const CONSTR = reg.type === 'floor' ? FLOOR_PRESETS : CEILING_PRESETS_EXTRA
          return (
            <div className="w-72 xl:w-80 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0">
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: col }}/>
                    <div className="text-sm font-semibold text-gray-900 capitalize">
                      {reg.type === 'floor' ? 'Floor construction' : 'Ceiling insulation'}
                    </div>
                  </div>
                  <button onClick={() => {
                    setInsulRegions((prev: any[]) => prev.filter((r: any) => r.id !== selectedRegionId))
                    setSelectedRegionId(null)
                  }} className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-2 py-1">
                    Delete
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
                  <input type="text" className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                    value={reg.label || ''}
                    onChange={e => setInsulRegions(prev => prev.map(r => r.id !== selectedRegionId ? r : { ...r, label: e.target.value }))}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Construction type</label>
                  <select className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
                    value={reg.construction || ''}
                    onChange={e => {
                      const preset = CONSTR.find(c => c.id === e.target.value)
                      setInsulRegions(prev => prev.map(r => r.id !== selectedRegionId ? r : {
                        ...r, construction: e.target.value, uValue: preset?.u ?? r.uValue
                      }))
                    }}>
                    <option value="">Select...</option>
                    {CONSTR.map(c => <option key={c.id} value={c.id}>{c.label} (U{c.u})</option>)}
                    <option value="custom">— Custom U-value —</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">U-value (W/m²K)</label>
                  <input type="number" step={0.01} min={0}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                    value={reg.uValue}
                    onChange={e => setInsulRegions(prev => prev.map(r => r.id !== selectedRegionId ? r : { ...r, uValue: parseFloat(e.target.value) || 0 }))}/>
                </div>
                {reg.type === 'floor' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Insulation thickness (mm)</label>
                    <input type="number" step={25} min={0}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                      value={reg.insulationMm || 0}
                      onChange={e => setInsulRegions(prev => prev.map(r => r.id !== selectedRegionId ? r : { ...r, insulationMm: parseInt(e.target.value) || 0 }))}/>
                  </div>
                )}
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
                  <div className="flex justify-between"><span>Type</span><span className="capitalize font-medium">{reg.type}</span></div>
                  <div className="flex justify-between mt-1"><span>U-value</span><span className="font-medium">{reg.uValue} W/m²K</span></div>
                  {reg.type === 'floor' && <div className="flex justify-between mt-1"><span>Insulation</span><span className="font-medium">{reg.insulationMm}mm</span></div>}
                </div>
                <p className="text-xs text-gray-400">Right-click region on canvas to delete. Click ↩ Rooms to return to rooms mode.</p>
              </div>
            </div>
          )
        })()}

        {(selectedRoom || selectedElem) && activeLayerMode === 'rooms' && (
          <div className="w-72 xl:w-80 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0">
            <div className="p-4 space-y-4">

              {/* ── Element properties ─────────────────────────────────────── */}
              {selectedElem && selectedRoom && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: selectedElem.type === 'window' ? '#60a5fa' : selectedElem.type === 'door' ? '#f59e0b' : selectedElem.type === 'ufh' ? '#10b981' : '#ef4444' }}>
                        {selectedElem.type[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-900 capitalize">{selectedElem.type}</div>
                        <div className="text-xs text-gray-400">in {selectedRoom.name || selectedRoom.roomType}</div>
                      </div>
                    </div>
                    <button onClick={() => {
                      setRooms(prev => prev.map(r => r.id !== selectedRoom.id ? r : { ...r, elements: r.elements.filter(e => e.id !== selectedElem.id) }))
                      setSelectedElementId(null)
                    }} className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-2 py-1 bg-white hover:bg-red-50">
                      Delete
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className={lbl}>Width (mm)</label>
                      <input type="number" className={inp} value={selectedElem.widthMm} step={50} min={100}
                        onChange={e => updElement(selectedRoom.id, selectedElem.id, { widthMm: parseInt(e.target.value)||selectedElem.widthMm })}/>
                    </div>
                    {selectedElem.type !== 'radiator' && selectedElem.type !== 'ufh' && (
                      <div>
                        <label className={lbl}>Height (mm)</label>
                        <input type="number" className={inp} value={selectedElem.heightMm} step={50} min={100}
                          onChange={e => updElement(selectedRoom.id, selectedElem.id, { heightMm: parseInt(e.target.value)||selectedElem.heightMm })}/>
                      </div>
                    )}
                    {selectedElem.type === 'window' && (
                      <div>
                        <label className={lbl}>Glazing U-value (W/m²K)</label>
                        <select className={sel} value={
                          WINDOW_PRESETS.find(p => p.u === selectedElem.uValue)?.id || 'dbl_new'
                        } onChange={e => updElement(selectedRoom.id, selectedElem.id, { uValue: WINDOW_PRESETS.find(p => p.id === e.target.value)?.u })}>
                          {WINDOW_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} (U{p.u})</option>)}
                        </select>
                      </div>
                    )}
                    {selectedElem.type === 'radiator' && (
                      <div>
                        <label className={lbl}>Label (optional)</label>
                        <input type="text" className={inp} value={selectedElem.label || ''} placeholder="e.g. Ultraheat DS22 600×900"
                          onChange={e => updElement(selectedRoom.id, selectedElem.id, { label: e.target.value })}/>
                      </div>
                    )}
                    <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-500">
                      {selectedElem.widthMm}mm wide · {selectedElem.heightMm}mm tall
                      {selectedElem.type === 'window' ? ` · ${((selectedElem.widthMm * selectedElem.heightMm)/1e6).toFixed(2)}m² · U${selectedElem.uValue} W/m²K` : ''}
                    </div>
                    <p className="text-xs text-gray-400">Right-click the element on the canvas to delete it.</p>
                  </div>
                </>
              )}

              {/* ── Room properties ────────────────────────────────────────── */}
              {selectedRoom && !selectedElem && selectedProps && (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg"
                        style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                        {ROOM_TYPES.find(t => t.type === selectedRoom.roomType)?.icon || '🏠'}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">{selectedRoom.name || selectedRoom.roomType}</div>
                        <div className="text-xs text-gray-400">{selectedRoom.roomType}</div>
                      </div>
                    </div>
                    {selectedRoom.heatLossW && (
                      <div className="text-right">
                        <div className="text-base font-bold text-emerald-700">{selectedRoom.heatLossW.toLocaleString()}W</div>
                        <div className="text-xs text-gray-400">{(selectedRoom.heatLossW/1000).toFixed(2)}kW</div>
                      </div>
                    )}
                  </div>

                  {/* Identity */}
                  <div className="space-y-2">
                    <div>
                      <label className={lbl}>Room name</label>
                      <input type="text" className={inp} value={selectedRoom.name}
                        placeholder={selectedRoom.roomType}
                        onChange={e => updRoomName(selectedRoom.id, e.target.value)}/>
                    </div>
                    <div>
                      <label className={lbl}>Room type</label>
                      <select className={sel} value={selectedRoom.roomType}
                        onChange={e => updRoomType(selectedRoom.id, e.target.value)}>
                        {ROOM_TYPES.map(rt => <option key={rt.type} value={rt.type}>{rt.icon} {rt.type} ({rt.temp}°C)</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>Design temp (°C)</label>
                        <input type="number" className={inp} value={selectedProps.designTempC} step={0.5}
                          onChange={e => updRoomProp(selectedRoom.id, { designTempC: parseFloat(e.target.value)||21 })}/>
                      </div>
                      <div>
                        <label className={lbl}>Ceiling height (mm)</label>
                        <input type="number" className={inp} value={selectedProps.heightMm} step={50}
                          onChange={e => updRoomProp(selectedRoom.id, { heightMm: parseInt(e.target.value)||2400 })}/>
                      </div>
                    </div>
                  </div>

                  {/* Dimensions (read from canvas, shown for reference) */}
                  {(() => {
                    const verts = selectedRoom.vertices
                    const xs = verts.map(v => v.x), ys = verts.map(v => v.y)
                    const w = Math.round(Math.max(...xs) - Math.min(...xs))
                    const h = Math.round(Math.max(...ys) - Math.min(...ys))
                    const area = Math.abs(verts.reduce((s,v,i) => { const j=(i+1)%verts.length; return s+v.x*verts[j].y-verts[j].x*v.y },0))/2/1e6
                    return (
                      <div className="bg-gray-50 rounded-xl p-3 text-xs grid grid-cols-3 gap-2">
                        <div><div className="text-gray-400">Width</div><div className="font-semibold">{w>=1000?`${(w/1000).toFixed(2)}m`:`${w}mm`}</div></div>
                        <div><div className="text-gray-400">Depth</div><div className="font-semibold">{h>=1000?`${(h/1000).toFixed(2)}m`:`${h}mm`}</div></div>
                        <div><div className="text-gray-400">Area</div><div className="font-semibold">{area.toFixed(1)}m²</div></div>
                      </div>
                    )
                  })()}

                  {/* Fabric */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-700">Fabric construction</div>
                    <div>
                      <label className={lbl}>External walls</label>
                      <select className={sel} value={WALL_PRESETS.find(p => p.u === selectedProps.wallU)?.id || 'cavity_unins'}
                        onChange={e => updRoomProp(selectedRoom.id, { wallU: WALL_PRESETS.find(p => p.id === e.target.value)?.u || 1.5 })}>
                        {WALL_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} (U{p.u})</option>)}
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Windows</label>
                      <select className={sel} value={WINDOW_PRESETS.find(p => p.u === selectedProps.windowU)?.id || 'dbl_new'}
                        onChange={e => updRoomProp(selectedRoom.id, { windowU: WINDOW_PRESETS.find(p => p.id === e.target.value)?.u || 2.0 })}>
                        {WINDOW_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} (U{p.u})</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>Window area (m²)</label>
                        <input type="number" className={inp} value={selectedProps.windowAreaM2 || ''} step={0.1}
                          placeholder="Auto 15%"
                          onChange={e => updRoomProp(selectedRoom.id, { windowAreaM2: parseFloat(e.target.value)||0 })}/>
                      </div>
                      <div>
                        <label className={lbl}>Ext door area (m²)</label>
                        <input type="number" className={inp} value={selectedProps.extDoorAreaM2 || ''} step={0.1} placeholder="0"
                          onChange={e => updRoomProp(selectedRoom.id, { extDoorAreaM2: parseFloat(e.target.value)||0 })}/>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>Floor</label>
                        <select className={sel} value={FLOOR_PRESETS.find(p => p.u === selectedProps.floorU)?.id || 'ground_unins'}
                          onChange={e => updRoomProp(selectedRoom.id, { floorU: FLOOR_PRESETS.find(p => p.id === e.target.value)?.u || 0.45 })}>
                          {FLOOR_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Floor — below</label>
                        <select className={sel} value={selectedProps.floorAdj}
                          onChange={e => updRoomProp(selectedRoom.id, { floorAdj: e.target.value })}>
                          <option value="ground">Ground (10°C)</option>
                          <option value="heated">Heated space</option>
                          <option value="unheated">Unheated</option>
                          <option value="outside">Outside</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Ceiling</label>
                        <select className={sel} value={CEILING_PRESETS.find(p => p.u === selectedProps.ceilU)?.id || 'pitched_100'}
                          onChange={e => updRoomProp(selectedRoom.id, { ceilU: CEILING_PRESETS.find(p => p.id === e.target.value)?.u || 0.25 })}>
                          {CEILING_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Ceiling — above</label>
                        <select className={sel} value={selectedProps.ceilAdj}
                          onChange={e => updRoomProp(selectedRoom.id, { ceilAdj: e.target.value })}>
                          <option value="heated">Heated room</option>
                          <option value="roof">Roof / outside</option>
                          <option value="unheated">Unheated loft</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Ventilation */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-700">Ventilation</div>
                    <div>
                      <label className={lbl}>
                        ACH override
                        <span className="text-gray-400 font-normal ml-1">(blank = CIBSE default {ROOM_TYPES.find(t=>t.type===selectedRoom.roomType)?.ach || 1.5})</span>
                      </label>
                      <input type="number" className={inp} value={selectedProps.ach ?? ''} step={0.1}
                        placeholder={`${ROOM_TYPES.find(t=>t.type===selectedRoom.roomType)?.ach || 1.5}`}
                        onChange={e => { const v=parseFloat(e.target.value); updRoomProp(selectedRoom.id, { ach: isNaN(v)?null:v }) }}/>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={selectedProps.hasOpenFlue} className="rounded"
                        onChange={e => updRoomProp(selectedRoom.id, { hasOpenFlue: e.target.checked })}/>
                      <span className="text-xs text-gray-700">Open flued appliance <span className="text-amber-600 font-medium">(+1.5 ACH)</span></span>
                    </label>
                  </div>

                  {/* Heat loss breakdown */}
                  {selectedRoom.heatLossW !== undefined && (
                    <div className="bg-emerald-700 text-white rounded-xl p-3 space-y-2">
                      <div className="text-xs text-emerald-200 font-medium">Heat loss breakdown</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          ['Ext walls', Math.round((selectedProps.wallU * Math.max(0, (() => {
                            const verts = selectedRoom.vertices
                            const area = Math.abs(verts.reduce((s,v,i) => { const j=(i+1)%verts.length; return s+v.x*verts[j].y-verts[j].x*v.y },0))/2/1e6
                            const perim = verts.reduce((s,v,i) => { const b=verts[(i+1)%verts.length]; return s+Math.sqrt((b.x-v.x)**2+(b.y-v.y)**2)/1000 },0)
                            const extFrac = selectedRoom.wallTypes.filter(wt=>wt==='external').length / selectedRoom.wallTypes.length
                            const winArea = selectedProps.windowAreaM2 > 0 ? selectedProps.windowAreaM2 : area * 0.15 * extFrac
                            return perim * (selectedProps.heightMm/1000) * extFrac - winArea - selectedProps.extDoorAreaM2
                          })()) * (selectedProps.designTempC - designTempExt)))],
                          ['Windows', Math.round(selectedProps.windowU * (() => { const a=Math.abs(selectedRoom.vertices.reduce((s,v,i)=>{const j=(i+1)%selectedRoom.vertices.length;return s+v.x*selectedRoom.vertices[j].y-selectedRoom.vertices[j].x*v.y},0))/2/1e6; const extFrac=selectedRoom.wallTypes.filter(wt=>wt==='external').length/selectedRoom.wallTypes.length; return selectedProps.windowAreaM2>0?selectedProps.windowAreaM2:a*0.15*extFrac })() * (selectedProps.designTempC - designTempExt))],
                          ['Total heat loss', selectedRoom.heatLossW],
                        ].map(([k,v]) => (
                          <div key={String(k)} className={String(k) === 'Total heat loss' ? 'col-span-2 border-t border-emerald-600 pt-2' : ''}>
                            <div className="text-emerald-200">{k}</div>
                            <div className={`font-bold ${String(k) === 'Total heat loss' ? 'text-base' : ''}`}>{Number(v).toLocaleString()}W</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Wall types for this room */}
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-2">Wall types</div>
                    <div className="text-xs text-gray-400 mb-2">Right-click any wall on the canvas to change its type</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedRoom.wallTypes.map((wt, i) => (
                        <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${wt === 'external' ? 'bg-gray-100 border-gray-300 text-gray-700' : wt === 'internal' ? 'bg-blue-50 border-blue-200 text-blue-700' : wt === 'party' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                          W{i+1}: {wt}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Placed elements */}
                  {selectedRoom.elements.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Placed elements ({selectedRoom.elements.length})</div>
                      <div className="space-y-1">
                        {selectedRoom.elements.map(el => (
                          <div key={el.id}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${selectedElementId === el.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                            onClick={() => setSelectedElementId(selectedElementId === el.id ? null : el.id)}>
                            <div className="flex items-center gap-2 text-xs">
                              <span style={{ color: el.type==='window'?'#60a5fa':el.type==='door'?'#f59e0b':el.type==='ufh'?'#10b981':'#ef4444' }}>
                                {el.type === 'window' ? '🪟' : el.type === 'door' ? '🚪' : el.type === 'ufh' ? '♨' : '🔥'}
                              </span>
                              <span className="capitalize font-medium">{el.type}</span>
                              <span className="text-gray-400">{el.widthMm}mm wide</span>
                            </div>
                            <button onClick={ev => { ev.stopPropagation()
                              setRooms(prev => prev.map(r => r.id !== selectedRoom.id ? r : { ...r, elements: r.elements.filter(e => e.id !== el.id) }))
                              if (selectedElementId === el.id) setSelectedElementId(null)
                            }} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Continue button */}
              {totalW > 0 && !selectedElem && (
                <div className="pt-2 border-t border-gray-100">
                  <button onClick={() => save(`/jobs/${jobId}/design/system`)} disabled={saving}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-semibold py-3 rounded-xl">
                    {saving ? 'Saving...' : `Save & continue — ${(totalW/1000).toFixed(1)}kW →`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Room type picker (shown when draw tool selected) ──────────────── */}
      {tool === 'draw' && showRoomPicker && (
        <div className="absolute inset-0 bg-black/20 z-40 flex items-center justify-center"
          onClick={() => setShowRoomPicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-4 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-gray-900 mb-3">What type of room?</div>
            <div className="grid grid-cols-3 gap-2">
              {ROOM_TYPES.map(rt => (
                <button key={rt.type} className="flex flex-col items-center gap-1 px-2 py-3 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                  <span className="text-2xl">{rt.icon}</span>
                  <span className="text-xs text-gray-700 font-medium text-center">{rt.type}</span>
                  <span className="text-xs text-gray-400">{rt.temp}°C</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}