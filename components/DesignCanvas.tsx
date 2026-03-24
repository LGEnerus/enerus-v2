'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  useRef, useState, useEffect, useCallback,
  useImperativeHandle, forwardRef
} from 'react'

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
  | 'addRadiator' | 'addUFH' | 'pan'

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
  external: 4, internal: 1.5, party: 3, open: 1
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
  selectedId: string | null
  selectedElementId: string | null
}

const DesignCanvas = forwardRef<CanvasRef, Props>(({
  rooms, activeFloor, tool, gridMm, showGrid, showDims, showHeatLoss,
  bgImage, onRoomsChange, onSelect, selectedId, selectedElementId,
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

    if (tool === 'pan' || e.buttons === 4) {
      dragRef.current = { type: 'pan', startPx: pxPt, startVp: { ...vp } }
      return
    }

    // ── Draw room (click-drag rectangle) ──────────────────────────────────────
    if (tool === 'draw') {
      setDrawStart(worldPt)
      setDrawCurrent(worldPt)
      return
    }

    // ── Place element on wall ─────────────────────────────────────────────────
    if (tool === 'addWindow' || tool === 'addDoor' || tool === 'addRadiator' || tool === 'addUFH') {
      const type = tool === 'addWindow' ? 'window' : tool === 'addDoor' ? 'door' : tool === 'addRadiator' ? 'radiator' : 'ufh'
      for (let i = fr.length-1; i >= 0; i--) {
        const wi = hitWall(pxPt, fr[i])
        if (wi >= 0) {
          const a = fr[i].vertices[wi], b = fr[i].vertices[(wi+1)%fr[i].vertices.length]
          const pos = ptToSegParam(worldPt, a, b)
          const el: WallElement = {
            id: `el_${Date.now()}`, wallIndex: wi, position: Math.max(0.05, Math.min(0.95, pos)),
            type, widthMm: type === 'door' ? 900 : type === 'ufh' ? 2000 : 1200,
            heightMm: type === 'door' ? 2100 : 1200, uValue: type === 'window' ? 2.0 : undefined,
          }
          const updated = rooms.map(r => r.id !== fr[i].id ? r : { ...r, elements: [...r.elements, el] })
          onRoomsChange(updated)
          onSelect(fr[i].id, 'element', el.id)
          return
        }
      }
      return
    }

    // ── Select ────────────────────────────────────────────────────────────────
    if (tool === 'select') {
      const selRoom = fr.find(r => r.id === selectedId)

      // Check elements first
      for (let i = fr.length-1; i >= 0; i--) {
        const elId = hitElement(pxPt, fr[i])
        if (elId) {
          onSelect(fr[i].id, 'element', elId)
          dragRef.current = { type: 'element', id: fr[i].id, elemId: elId, startPx: pxPt,
            startElemPos: fr[i].elements.find(el => el.id === elId)?.position }
          return
        }
      }

      // Check vertices of selected room
      if (selRoom) {
        const vi = hitVertex(pxPt, selRoom)
        if (vi >= 0) {
          dragRef.current = { type: 'vertex', id: selRoom.id, vertIdx: vi, startPx: pxPt, startVerts: [...selRoom.vertices] }
          return
        }
        // Check wall segments (for pushing/pulling)
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

      // Check room bodies
      for (let i = fr.length-1; i >= 0; i--) {
        if (ptInPoly(worldPt, fr[i].vertices)) {
          onSelect(fr[i].id)
          dragRef.current = { type: 'room', id: fr[i].id, startPx: pxPt, startVerts: [...fr[i].vertices] }
          return
        }
      }

      onSelect(null)
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
      const a = room.vertices[el.wallIndex]
      const b = room.vertices[(el.wallIndex+1)%room.vertices.length]
      const pos = ptToSegParam(worldPt, a, b)
      onRoomsChange(rooms.map(r => r.id !== drag.id ? r : {
        ...r, elements: r.elements.map(e => e.id !== drag.elemId ? e : { ...e, position: Math.max(0.05, Math.min(0.95, pos)) })
      }))
      return
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    // Finish drawing
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
      }
      setDrawStart(null)
      setDrawCurrent(null)
      return
    }
    dragRef.current = null
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (tool !== 'select' || !selectedId) return
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
      const elId = hitElement(pxPt, fr[i])
      if (elId) {
        onRoomsChange(rooms.map(r => r.id !== fr[i].id ? r : { ...r, elements: r.elements.filter(el => el.id !== elId) }))
        if (selectedElementId === elId) onSelect(fr[i].id)
        return
      }
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
      <g key={isGhost ? `ghost_${room.id}` : room.id} opacity={isGhost ? 0.25 : 1}>
        {/* Fill */}
        <polygon points={ptsStr} fill={fillColor}
          stroke={isGhost ? '#9ca3af' : isSel ? '#059669' : 'none'}
          strokeWidth={isSel ? 0 : 0}
          style={{ cursor: isGhost ? 'default' : tool === 'select' ? 'move' : 'crosshair' }}/>

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
                stroke={isSelWall ? '#f59e0b' : color} strokeWidth={isSel ? width+1 : width}
                strokeDasharray={WALL_DASH[wt]}
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

        {/* Elements */}
        {!isGhost && room.elements.map(el => {
          const a = toScreen(room.vertices[el.wallIndex], vp)
          const b = toScreen(room.vertices[(el.wallIndex+1)%room.vertices.length], vp)
          const ex = a.x + el.position*(b.x-a.x), ey = a.y + el.position*(b.y-a.y)
          const wPx = mmToPx(el.widthMm, vp.zoom)
          const col = EL_COLOR[el.type] || '#6b7280'
          const isSel2 = selectedElementId === el.id
          const dx = b.x-a.x, dy = b.y-a.y, len = Math.sqrt(dx**2+dy**2)
          const angle = len > 0 ? Math.atan2(dy, dx) * 180/Math.PI : 0
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
  const ghostRooms = rooms.filter(r => r.floor === activeFloor - 1)

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-gray-50 select-none"
      style={{ touchAction: 'none' }}>
      <svg ref={svgRef} width={size.w} height={size.h}
        style={{ display:'block', cursor: tool==='draw'?'crosshair':tool==='pan'?'grab':'default' }}
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

        {/* Active floor rooms — non-selected first, selected on top */}
        {floorRooms.filter(r => r.id !== selectedId).map(r => renderRoom(r))}
        {floorRooms.filter(r => r.id === selectedId).map(r => renderRoom(r))}

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
          {tool==='select' && !selectedId && 'Click a room to select · Drag to move'}
          {tool==='select' && selectedId && 'Drag corner to resize · Drag wall to push/pull · Dbl-click wall edge to add vertex · Right-click wall for type'}
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
export default DesignCanvas