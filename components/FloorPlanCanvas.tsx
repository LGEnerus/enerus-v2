'use client'

// components/FloorPlanCanvas.tsx

import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import {
  Vec2, Polygon, Viewport,
  vecAdd, vecSub, vecScale, vecDist, vecNorm,
  polygonAreaM2, polygonCentroid,
  pointInPolygon, snapToGrid, snapToVertex,
  worldToPx, pxToWorld, mmToPx, pxToMm,
  detectAdjacency, autoWallTypes, wallLength,
  rectFromDimensions,
} from '@/lib/canvas-geometry'

export type WallElement = {
  id: string
  wallIndex: number
  position: number
  type: 'window' | 'door' | 'radiator'
  widthMm: number
  heightMm: number
  uValue?: number
}

export type CanvasRoom = {
  id: string
  name: string
  roomType: string
  floor: number
  vertices: Polygon
  wallTypes: string[]
  elements: WallElement[]
  heatLossW?: number
}

export type CanvasTool = 'select' | 'draw' | 'addWindow' | 'addDoor' | 'addRadiator' | 'pan'

type CanvasProps = {
  rooms: CanvasRoom[]
  activeFloor: number
  tool: CanvasTool
  gridMm: number
  showGrid: boolean
  showDimensions: boolean
  showHeatLoss: boolean
  backgroundImage?: string
  onRoomsChange: (rooms: CanvasRoom[]) => void
  onRoomSelect: (roomId: string | null) => void
  selectedRoomId: string | null
}

export type CanvasRef = {
  fitToScreen: () => void
  zoomIn: () => void
  zoomOut: () => void
  deleteSelected: () => void
}

const ROOM_COLORS: Record<string, string> = {
  'Living room': '#d1fae5', 'Dining room': '#dbeafe', 'Kitchen': '#fef3c7',
  'Bedroom': '#ede9fe', 'Bathroom': '#fce7f3', 'En-suite': '#fce7f3',
  'Hall / Landing': '#f3f4f6', 'Study': '#d1fae5', 'Utility room': '#fef9c3',
  'WC': '#fce7f3', 'Conservatory': '#ecfdf5', 'Garage': '#f9fafb', 'Other': '#f3f4f6',
}

const WALL_TYPES = ['external', 'internal', 'party', 'open']
const WALL_TYPE_LABELS: Record<string, string> = {
  external: 'Ext', internal: 'Int', party: 'Party', open: 'Open'
}
const WALL_COLORS: Record<string, string> = {
  external: '#1f2937', internal: '#9ca3af', party: '#7c3aed', open: '#e5e7eb'
}
const WALL_WIDTHS: Record<string, number> = {
  external: 4, internal: 2, party: 3, open: 1
}

function heatColor(w: number, areaMm2: number): string {
  if (areaMm2 <= 0 || w === 0) return '#f0fdf4'
  const wm2 = w / (areaMm2 / 1_000_000)
  if (wm2 < 40) return '#d1fae5'
  if (wm2 < 70) return '#fef9c3'
  if (wm2 < 100) return '#fed7aa'
  return '#fecaca'
}

function isRect(verts: Polygon): boolean {
  if (verts.length !== 4) return false
  for (let i = 0; i < 4; i++) {
    const a = verts[(i + 3) % 4], b = verts[i], c = verts[(i + 1) % 4]
    const ab = vecSub(b, a), bc = vecSub(c, b)
    const dot = ab.x * bc.x + ab.y * bc.y
    if (Math.abs(dot) > 0.1 * vecDist(a, b) * vecDist(b, c)) return false
  }
  return true
}

function moveRectVertex(verts: Polygon, idx: number, newPos: Vec2): Polygon {
  const n = 4
  const prev = (idx + n - 1) % n
  const next = (idx + 1) % n
  const opp = (idx + 2) % n
  const orig = verts[idx]
  const dx = newPos.x - orig.x
  const dy = newPos.y - orig.y
  const dPrev = vecNorm(vecSub(verts[prev], orig))
  const dNext = vecNorm(vecSub(verts[next], orig))
  const movePrev = dx * dPrev.x + dy * dPrev.y
  const moveNext = dx * dNext.x + dy * dNext.y
  const result = [...verts]
  result[idx] = newPos
  result[prev] = vecAdd(verts[prev], vecScale(dNext, moveNext))
  result[next] = vecAdd(verts[next], vecScale(dPrev, movePrev))
  result[opp] = verts[opp]
  return result
}

const FloorPlanCanvas = forwardRef<CanvasRef, CanvasProps>(({
  rooms, activeFloor, tool, gridMm, showGrid, showDimensions, showHeatLoss,
  backgroundImage, onRoomsChange, onRoomSelect, selectedRoomId,
}, ref) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState<Viewport>({ x: 200, y: 200, zoom: 0.8 })
  const [drawVerts, setDrawVerts] = useState<Polygon>([])
  const [cursorPt, setCursorPt] = useState<Vec2 | null>(null)
  const [dragState, setDragState] = useState<any>(null)
  const [selectedWall, setSelectedWall] = useState<{ roomId: string; wallIdx: number } | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 })
  const [isMobile, setIsMobile] = useState(false)
  const touchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null)

  // Wall context menu state
  const [wallMenu, setWallMenu] = useState<{ x: number; y: number; roomId: string; wallIdx: number } | null>(null)

  useEffect(() => {
    setIsMobile('ontouchstart' in window || window.innerWidth < 768)
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setContainerSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    if (containerRef.current) obs.observe(containerRef.current)

    const svgEl = svgRef.current
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = svgEl?.getBoundingClientRect()
      if (!rect) return
      const px = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const factor = e.deltaY > 0 ? 0.88 : 1.12
      setVp(prev => {
        const nz = Math.max(0.08, Math.min(6, prev.zoom * factor))
        const wp = pxToWorld(px, prev)
        return { x: px.x - mmToPx(wp.x, nz), y: px.y - mmToPx(wp.y, nz), zoom: nz }
      })
    }
    svgEl?.addEventListener('wheel', onWheel, { passive: false })
    return () => { obs.disconnect(); svgEl?.removeEventListener('wheel', onWheel) }
  }, [])

  useImperativeHandle(ref, () => ({
    fitToScreen() {
      const fr = rooms.filter(r => r.floor === activeFloor)
      if (!fr.length) { setVp({ x: 200, y: 200, zoom: 0.8 }); return }
      const all = fr.flatMap(r => r.vertices)
      const xs = all.map(v => v.x), ys = all.map(v => v.y)
      const pad = 1500
      const wMm = (Math.max(...xs) - Math.min(...xs)) + pad * 2
      const hMm = (Math.max(...ys) - Math.min(...ys)) + pad * 2
      const zoom = Math.min(containerSize.w / mmToPx(wMm, 1), containerSize.h / mmToPx(hMm, 1), 3)
      setVp({ x: -mmToPx(Math.min(...xs) - pad, zoom), y: -mmToPx(Math.min(...ys) - pad, zoom), zoom })
    },
    zoomIn() { setVp(v => ({ ...v, zoom: Math.min(v.zoom * 1.3, 6) })) },
    zoomOut() { setVp(v => ({ ...v, zoom: Math.max(v.zoom * 0.77, 0.08) })) },
    deleteSelected() {
      if (selectedRoomId) { onRoomsChange(rooms.filter(r => r.id !== selectedRoomId)); onRoomSelect(null) }
    },
  }))

  function getPt(e: React.PointerEvent | React.MouseEvent): Vec2 {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function world(pxPt: Vec2, snap = true): Vec2 {
    let pt = pxToWorld(pxPt, vp)
    if (snap) {
      const allV = rooms.filter(r => r.floor === activeFloor).flatMap(r => r.vertices)
      const s = snapToVertex(pt, allV, pxToMm(12, vp.zoom))
      if (s) return s
      return snapToGrid(pt, gridMm)
    }
    return pt
  }

  function reAdj(rs: CanvasRoom[]): CanvasRoom[] {
    const fr = rs.filter(r => r.floor === activeFloor)
    const shared = detectAdjacency(fr.map(r => ({ id: r.id, vertices: r.vertices })))
    return rs.map(r => r.floor !== activeFloor ? r : { ...r, wallTypes: autoWallTypes(r.id, r.vertices, shared) })
  }

  function closeDraw() {
    if (drawVerts.length < 3) { setDrawVerts([]); return }
    if (polygonAreaM2(drawVerts) < 0.3) { setDrawVerts([]); return }
    const id = `room_${Date.now()}`
    const nr: CanvasRoom = {
      id, name: '', roomType: 'Living room', floor: activeFloor,
      vertices: drawVerts, wallTypes: new Array(drawVerts.length).fill('external'), elements: [],
    }
    const upd = reAdj([...rooms, nr])
    onRoomsChange(upd)
    onRoomSelect(id)
    setDrawVerts([])
  }

  // ─── Hit testing helpers ──────────────────────────────────────────────────────

  function hitTestWall(pxPt: Vec2, room: CanvasRoom): number {
    // Returns wall index if within 10px of wall, -1 otherwise
    for (let i = 0; i < room.vertices.length; i++) {
      const a = worldToPx(room.vertices[i], vp)
      const b = worldToPx(room.vertices[(i + 1) % room.vertices.length], vp)
      const dx = b.x - a.x, dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      if (len2 < 1) continue
      const t = Math.max(0, Math.min(1, ((pxPt.x - a.x) * dx + (pxPt.y - a.y) * dy) / len2))
      const px = a.x + t * dx, py = a.y + t * dy
      const dist = Math.sqrt((pxPt.x - px) ** 2 + (pxPt.y - py) ** 2)
      if (dist < 10) return i
    }
    return -1
  }

  function hitTestVertex(pxPt: Vec2, room: CanvasRoom): number {
    const r = isMobile ? 18 : 10
    for (let i = 0; i < room.vertices.length; i++) {
      if (vecDist(pxPt, worldToPx(room.vertices[i], vp)) < r) return i
    }
    return -1
  }

  // Mid-wall handle hit test
  function hitTestMidHandle(pxPt: Vec2, room: CanvasRoom): number {
    const r = isMobile ? 18 : 12
    for (let i = 0; i < room.vertices.length; i++) {
      const a = worldToPx(room.vertices[i], vp)
      const b = worldToPx(room.vertices[(i + 1) % room.vertices.length], vp)
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      if (vecDist(pxPt, { x: mx, y: my }) < r) return i
    }
    return -1
  }

  function addElementToWall(roomId: string, wallIdx: number, worldPt: Vec2, type: 'window' | 'door' | 'radiator') {
    const room = rooms.find(r => r.id === roomId)
    if (!room) return
    const a = room.vertices[wallIdx]
    const b = room.vertices[(wallIdx + 1) % room.vertices.length]
    const wallLen = vecDist(a, b)
    if (wallLen < 1) return
    const t = Math.max(0.05, Math.min(0.95,
      ((worldPt.x - a.x) * (b.x - a.x) + (worldPt.y - a.y) * (b.y - a.y)) / (wallLen * wallLen)
    ))
    const widthMm = type === 'radiator' ? 1200 : type === 'door' ? 900 : 1200
    const el: WallElement = { id: `el_${Date.now()}`, wallIndex: wallIdx, position: t, type, widthMm, heightMm: type === 'door' ? 2100 : 1200 }
    onRoomsChange(rooms.map(r => r.id !== roomId ? r : { ...r, elements: [...r.elements, el] }))
  }

  // ─── Pointer events ───────────────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent) {
    setWallMenu(null)
    const pxPt = getPt(e)
    const worldPt = world(pxPt)

    if (tool === 'pan' || e.buttons === 4) {
      setDragState({ type: 'pan', startPx: pxPt, startVp: { ...vp } })
      return
    }

    if (tool === 'draw') {
      if (e.button === 2) { closeDraw(); return }
      if (drawVerts.length >= 3 && vecDist(pxPt, worldToPx(drawVerts[0], vp)) < 15) { closeDraw(); return }
      setDrawVerts(p => [...p, worldPt])
      return
    }

    if (tool === 'addWindow' || tool === 'addDoor' || tool === 'addRadiator') {
      const type = tool === 'addWindow' ? 'window' : tool === 'addDoor' ? 'door' : 'radiator'
      const fr = rooms.filter(r => r.floor === activeFloor)
      for (let i = fr.length - 1; i >= 0; i--) {
        const wi = hitTestWall(pxPt, fr[i])
        if (wi >= 0) { addElementToWall(fr[i].id, wi, worldPt, type); return }
      }
      return
    }

    if (tool === 'select') {
      const fr = rooms.filter(r => r.floor === activeFloor)
      const selRoom = fr.find(r => r.id === selectedRoomId)

      // 1. Vertex handle of selected room
      if (selRoom) {
        const vi = hitTestVertex(pxPt, selRoom)
        if (vi >= 0) {
          setDragState({ type: 'vertex', roomId: selRoom.id, vi, startVerts: [...selRoom.vertices], rect: isRect(selRoom.vertices) })
          return
        }
        // 2. Mid-wall handle (pushes/pulls that wall)
        const mi = hitTestMidHandle(pxPt, selRoom)
        if (mi >= 0) {
          setDragState({ type: 'midwall', roomId: selRoom.id, wi: mi, startVerts: [...selRoom.vertices] })
          return
        }
        // 3. Wall click — select wall
        const wi = hitTestWall(pxPt, selRoom)
        if (wi >= 0) {
          setSelectedWall({ roomId: selRoom.id, wallIdx: wi })
          return
        }
      }

      // 4. Room hit
      for (let i = fr.length - 1; i >= 0; i--) {
        if (pointInPolygon(worldPt, fr[i].vertices)) {
          onRoomSelect(fr[i].id)
          setSelectedWall(null)
          setDragState({ type: 'room', roomId: fr[i].id, startPx: pxPt, startVerts: [...fr[i].vertices] })
          return
        }
      }
      onRoomSelect(null)
      setSelectedWall(null)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const pxPt = getPt(e)
    setCursorPt(world(pxPt))
    if (!dragState) return

    if (dragState.type === 'pan') {
      const dx = pxPt.x - dragState.startPx.x, dy = pxPt.y - dragState.startPx.y
      setVp({ ...dragState.startVp, x: dragState.startVp.x + dx, y: dragState.startVp.y + dy })
      return
    }

    const worldPt = world(pxPt)

    if (dragState.type === 'vertex') {
      const upd = rooms.map(r => {
        if (r.id !== dragState.roomId) return r
        const nv = dragState.rect && r.vertices.length === 4
          ? moveRectVertex(dragState.startVerts, dragState.vi, worldPt)
          : dragState.startVerts.map((v: Vec2, i: number) => i === dragState.vi ? worldPt : v)
        return { ...r, vertices: nv }
      })
      onRoomsChange(reAdj(upd))
      return
    }

    if (dragState.type === 'midwall') {
      const room = rooms.find(r => r.id === dragState.roomId)
      if (!room) return
      const verts = dragState.startVerts
      const n = verts.length
      const wi = dragState.wi
      const a = verts[wi], b = verts[(wi + 1) % n]
      const prev = verts[(wi + n - 1) % n]
      const next = verts[(wi + 2) % n]

      // Wall normal (perpendicular direction)
      const wallDir = { x: b.x - a.x, y: b.y - a.y }
      const wallLen = Math.sqrt(wallDir.x ** 2 + wallDir.y ** 2)
      const normal = { x: -wallDir.y / wallLen, y: wallDir.x / wallLen }

      // How far has the cursor moved along the normal?
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      const dmm = { x: worldPt.x - mx, y: worldPt.y - my }
      const push = dmm.x * normal.x + dmm.y * normal.y
      const snappedPush = Math.round(push / gridMm) * gridMm

      // Move both vertices of this wall along the normal
      const newA = snapToGrid({ x: a.x + normal.x * snappedPush, y: a.y + normal.y * snappedPush }, gridMm)
      const newB = snapToGrid({ x: b.x + normal.x * snappedPush, y: b.y + normal.y * snappedPush }, gridMm)

      const newVerts = [...verts]
      newVerts[wi] = newA
      newVerts[(wi + 1) % n] = newB

      onRoomsChange(reAdj(rooms.map(r => r.id !== dragState.roomId ? r : { ...r, vertices: newVerts })))
      return
    }

    if (dragState.type === 'room') {
      const dpx = vecSub(pxPt, dragState.startPx)
      const dmm = snapToGrid({ x: pxToMm(dpx.x, vp.zoom), y: pxToMm(dpx.y, vp.zoom) }, gridMm)
      onRoomsChange(reAdj(rooms.map(r => r.id !== dragState.roomId ? r : {
        ...r, vertices: dragState.startVerts.map((v: Vec2) => vecAdd(v, dmm))
      })))
    }
  }

  function onPointerUp() { setDragState(null) }

  // Touch pinch zoom
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      touchRef.current = {
        dist: Math.sqrt(dx * dx + dy * dy),
        cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      }
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 2 && touchRef.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const factor = dist / touchRef.current.dist
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      setVp(prev => {
        const nz = Math.max(0.08, Math.min(6, prev.zoom * factor))
        const wp = pxToWorld({ x: cx, y: cy }, prev)
        return { x: cx - mmToPx(wp.x, nz), y: cy - mmToPx(wp.y, nz), zoom: nz }
      })
      touchRef.current.dist = dist
    }
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (tool !== 'select' || !selectedRoomId) return
    const pxPt = getPt(e)
    const worldPt = world(pxPt, false)
    const room = rooms.find(r => r.id === selectedRoomId)
    if (!room) return
    for (let i = 0; i < room.vertices.length; i++) {
      const a = room.vertices[i], b = room.vertices[(i + 1) % room.vertices.length]
      const dx = b.x - a.x, dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      if (len2 < 1) continue
      const t = Math.max(0, Math.min(1, ((worldPt.x - a.x) * dx + (worldPt.y - a.y) * dy) / len2))
      const px = a.x + t * dx, py = a.y + t * dy
      const pxDist = vecDist(worldToPx({ x: px, y: py }, vp), pxPt)
      if (pxDist < 12) {
        const nv = snapToGrid({ x: px, y: py }, gridMm)
        const newVerts = [...room.vertices]; newVerts.splice(i + 1, 0, nv)
        const newWT = [...room.wallTypes]; newWT.splice(i + 1, 0, newWT[i])
        onRoomsChange(reAdj(rooms.map(r => r.id === selectedRoomId ? { ...r, vertices: newVerts, wallTypes: newWT } : r)))
        return
      }
    }
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (tool === 'draw' && drawVerts.length >= 3) { closeDraw(); return }
    // Right-click on a wall → show wall menu
    if (tool === 'select' && selectedRoomId) {
      const pxPt = getPt(e)
      const room = rooms.find(r => r.id === selectedRoomId)
      if (room) {
        const wi = hitTestWall(pxPt, room)
        if (wi >= 0) {
          setWallMenu({ x: e.clientX, y: e.clientY, roomId: selectedRoomId, wallIdx: wi })
        }
      }
    }
  }

  function cycleWallType(roomId: string, wi: number) {
    onRoomsChange(rooms.map(r => r.id !== roomId ? r : {
      ...r,
      wallTypes: r.wallTypes.map((t, i) => i === wi ? WALL_TYPES[(WALL_TYPES.indexOf(t) + 1) % WALL_TYPES.length] : t)
    }))
    setWallMenu(null)
    setSelectedWall({ roomId, wallIdx: wi })
  }

  function setWallType(roomId: string, wi: number, type: string) {
    onRoomsChange(rooms.map(r => r.id !== roomId ? r : {
      ...r, wallTypes: r.wallTypes.map((t, i) => i === wi ? type : t)
    }))
    setWallMenu(null)
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  function renderGrid() {
    if (!showGrid) return null
    const step = mmToPx(gridMm, vp.zoom)
    if (step < 4) return null
    const lines = []
    for (let x = ((- vp.x % step) + step) % step; x < containerSize.w; x += step)
      lines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={containerSize.h} stroke="#e5e7eb" strokeWidth={0.5}/>)
    for (let y = ((- vp.y % step) + step) % step; y < containerSize.h; y += step)
      lines.push(<line key={`gy${y}`} x1={0} y1={y} x2={containerSize.w} y2={y} stroke="#e5e7eb" strokeWidth={0.5}/>)
    return <g>{lines}</g>
  }

  function renderRoom(room: CanvasRoom) {
    const pts = room.vertices.map(v => worldToPx(v, vp))
    const ptsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const isSel = room.id === selectedRoomId
    const areaMm2 = Math.abs(room.vertices.reduce((s, v, i) => {
      const j = (i + 1) % room.vertices.length
      return s + v.x * room.vertices[j].y - room.vertices[j].x * v.y
    }, 0)) / 2
    const fill = showHeatLoss && room.heatLossW ? heatColor(room.heatLossW, areaMm2) : (ROOM_COLORS[room.roomType] || '#f3f4f6')
    const centroid = polygonCentroid(pts)
    const lblSz = Math.max(7, Math.min(13, mmToPx(1400, vp.zoom)))

    return (
      <g key={room.id}>
        {/* Fill */}
        <polygon points={ptsStr} fill={fill}
          stroke={isSel ? '#059669' : '#9ca3af'} strokeWidth={isSel ? 0 : 0.5}
          style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
        />

        {/* Walls */}
        {room.vertices.map((v, i) => {
          const a = worldToPx(v, vp)
          const b = worldToPx(room.vertices[(i + 1) % room.vertices.length], vp)
          const wt = room.wallTypes[i] || 'external'
          const color = WALL_COLORS[wt] || '#1f2937'
          const width = WALL_WIDTHS[wt] || 2
          const isSelWall = isSel && selectedWall?.roomId === room.id && selectedWall.wallIdx === i
          const pxLen = vecDist(a, b)

          return (
            <g key={`w${i}`}>
              {/* Invisible thick hit target */}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="transparent" strokeWidth={16}
                style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); setSelectedWall({ roomId: room.id, wallIdx: i }); onRoomSelect(room.id) }}
                onContextMenu={e => { e.preventDefault(); setWallMenu({ x: e.clientX, y: e.clientY, roomId: room.id, wallIdx: i }); onRoomSelect(room.id) }}
              />
              {/* Visual wall */}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={isSelWall ? '#f59e0b' : color}
                strokeWidth={isSelWall ? width + 1.5 : width}
                strokeDasharray={wt === 'internal' ? '6,4' : wt === 'party' ? '12,5' : wt === 'open' ? '3,3' : 'none'}
                style={{ pointerEvents: 'none' }}
              />

              {/* Dimension label */}
              {showDimensions && isSel && pxLen > 40 && (() => {
                const len = wallLength(room.vertices, i)
                const dx = b.x - a.x, dy = b.y - a.y, nl = pxLen
                const nx = -dy / nl * 15, ny = dx / nl * 15
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
                return (
                  <text x={mx + nx} y={my + ny} textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.max(8, mmToPx(210, vp.zoom))} fill="#374151" fontFamily="monospace"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {len >= 1000 ? `${(len/1000).toFixed(2)}m` : `${Math.round(len)}mm`}
                  </text>
                )
              })()}

              {/* Mid-wall pill handle (selected room only, wall long enough) */}
              {isSel && pxLen > 50 && (() => {
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
                const isSelW = selectedWall?.roomId === room.id && selectedWall.wallIdx === i
                return (
                  <g style={{ cursor: 'ns-resize' }}>
                    {/* Pill background */}
                    <rect x={mx - 22} y={my - 9} width={44} height={18} rx={9}
                      fill={isSelW ? '#f59e0b' : 'white'}
                      stroke={color} strokeWidth={1.5}
                    />
                    {/* Wall type abbreviation */}
                    <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fill={isSelW ? 'white' : color}
                      fontWeight="600" fontFamily="sans-serif"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {WALL_TYPE_LABELS[wt] || 'Ext'}
                    </text>
                  </g>
                )
              })()}
            </g>
          )
        })}

        {/* Labels */}
        {lblSz > 6 && (
          <text x={centroid.x} y={centroid.y - (showHeatLoss && room.heatLossW ? lblSz * 0.7 : 0)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={lblSz} fill="#111827" fontWeight={isSel ? '600' : '400'}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {room.name || room.roomType}
          </text>
        )}
        {showHeatLoss && room.heatLossW && lblSz > 6 && (
          <text x={centroid.x} y={centroid.y + lblSz * 0.9}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={lblSz * 0.85} fill="#059669"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {room.heatLossW}W
          </text>
        )}
        {isSel && areaMm2 > 0 && lblSz > 8 && (
          <text x={centroid.x} y={centroid.y + lblSz * (showHeatLoss && room.heatLossW ? 1.8 : 1.1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={lblSz * 0.75} fill="#6b7280"
            style={{ pointerEvents: 'none' }}>
            {(areaMm2 / 1_000_000).toFixed(1)}m²
          </text>
        )}

        {/* Vertex handles */}
        {isSel && pts.map((p, i) => (
          <circle key={`vh${i}`} cx={p.x} cy={p.y} r={isMobile ? 10 : 7}
            fill="white" stroke="#059669" strokeWidth={2.5}
            style={{ cursor: 'grab' }}
          />
        ))}

        {/* Wall elements */}
        {room.elements.map(el => {
          const a = room.vertices[el.wallIndex]
          const b = room.vertices[(el.wallIndex + 1) % room.vertices.length]
          const pA = worldToPx(a, vp), pB = worldToPx(b, vp)
          const ex = pA.x + el.position * (pB.x - pA.x)
          const ey = pA.y + el.position * (pB.y - pA.y)
          const wPx = mmToPx(el.widthMm, vp.zoom)
          const col = el.type === 'window' ? '#60a5fa' : el.type === 'door' ? '#f59e0b' : '#f87171'
          const dx = pB.x - pA.x, dy = pB.y - pA.y, len = Math.sqrt(dx * dx + dy * dy)
          const angle = len > 0 ? Math.atan2(dy, dx) * 180 / Math.PI : 0
          return (
            <g key={el.id} transform={`translate(${ex},${ey}) rotate(${angle})`}
              style={{ cursor: 'pointer' }}
              onClick={e => {
                e.stopPropagation()
                onRoomsChange(rooms.map(r => r.id !== room.id ? r : { ...r, elements: r.elements.filter(e2 => e2.id !== el.id) }))
              }}>
              <rect x={-wPx/2} y={-5} width={wPx} height={10} fill={col} stroke="white" strokeWidth={1} rx={2}/>
              {wPx > 20 && (
                <text x={0} y={0} textAnchor="middle" dominantBaseline="middle"
                  fontSize={8} fill="white" fontWeight="600"
                  style={{ pointerEvents: 'none' }}>
                  {el.type === 'window' ? 'W' : el.type === 'door' ? 'D' : 'R'}
                </text>
              )}
            </g>
          )
        })}
      </g>
    )
  }

  function renderDrawPreview() {
    if (tool !== 'draw' || drawVerts.length === 0) return null
    const pts = drawVerts.map(v => worldToPx(v, vp))
    const cur = cursorPt ? worldToPx(cursorPt, vp) : null
    const all = cur ? [...pts, cur] : pts
    return (
      <g>
        <polyline points={all.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#059669" strokeWidth={2} strokeDasharray="7,4"/>
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y}
            r={i === 0 && drawVerts.length >= 3 ? 10 : 5}
            fill={i === 0 && drawVerts.length >= 3 ? '#059669' : 'white'}
            stroke="#059669" strokeWidth={2}/>
        ))}
        {drawVerts.length >= 3 && <text x={pts[0].x+14} y={pts[0].y-8} fontSize={10} fill="#059669">close</text>}
      </g>
    )
  }

  const fr = rooms.filter(r => r.floor === activeFloor)

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-white rounded-xl border border-gray-200 select-none"
      style={{ touchAction: 'none' }}>
      <svg ref={svgRef} width={containerSize.w} height={containerSize.h}
        style={{ cursor: tool === 'draw' ? 'crosshair' : tool === 'pan' ? 'grab' : dragState?.type === 'pan' ? 'grabbing' : 'default', display: 'block' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        {backgroundImage && (
          <image href={backgroundImage} x={vp.x} y={vp.y} opacity={0.35}
            width={mmToPx(20000, vp.zoom)}/>
        )}
        {renderGrid()}
        {fr.filter(r => r.id !== selectedRoomId).map(r => renderRoom(r))}
        {fr.filter(r => r.id === selectedRoomId).map(r => renderRoom(r))}
        {renderDrawPreview()}

        {/* Scale bar */}
        <g transform={`translate(${containerSize.w - 130},${containerSize.h - 30})`}>
          <rect x={0} y={0} width={110} height={20} fill="rgba(255,255,255,0.92)" rx={4}/>
          <line x1={10} y1={14} x2={100} y2={14} stroke="#374151" strokeWidth={2}/>
          <line x1={10} y1={10} x2={10} y2={18} stroke="#374151" strokeWidth={1.5}/>
          <line x1={100} y1={10} x2={100} y2={18} stroke="#374151" strokeWidth={1.5}/>
          <text x={55} y={9} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="monospace">
            {pxToMm(90,vp.zoom)>=1000 ? `${(pxToMm(90,vp.zoom)/1000).toFixed(1)}m` : `${Math.round(pxToMm(90,vp.zoom))}mm`}
          </text>
        </g>

        {/* Tool hints */}
        {tool === 'draw' && <text x={10} y={18} fontSize={10} fill="#6b7280">Click to add points · Right-click or click first point to close</text>}
        {(tool==='addWindow'||tool==='addDoor'||tool==='addRadiator') && <text x={10} y={18} fontSize={10} fill="#6b7280">Click on a wall to place {tool==='addWindow'?'window':tool==='addDoor'?'door':'radiator'} · Click element to remove</text>}
        {tool==='select' && selectedRoomId && <text x={10} y={18} fontSize={10} fill="#6b7280">Drag corner to resize · Drag pill to push wall · Click wall to select · Right-click wall for type · Dbl-click wall to add vertex</text>}
      </svg>

      {/* Wall context menu */}
      {wallMenu && (() => {
        const room = rooms.find(r => r.id === wallMenu.roomId)
        const currentType = room?.wallTypes[wallMenu.wallIdx] || 'external'
        const rect = svgRef.current?.getBoundingClientRect()
        const menuX = rect ? wallMenu.x - rect.left : wallMenu.x
        const menuY = rect ? wallMenu.y - rect.top : wallMenu.y
        return (
          <div className="absolute bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-50 min-w-[140px]"
            style={{ left: Math.min(menuX, containerSize.w - 160), top: Math.min(menuY, containerSize.h - 180) }}>
            <div className="px-3 py-1 text-xs font-medium text-gray-500 border-b border-gray-100 mb-1">Wall type</div>
            {WALL_TYPES.map(t => (
              <button key={t} onClick={() => setWallType(wallMenu.roomId, wallMenu.wallIdx, t)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${t === currentType ? 'text-emerald-700 font-semibold bg-emerald-50' : 'text-gray-700'}`}>
                <svg width={16} height={6}><line x1={0} y1={3} x2={16} y2={3} stroke={WALL_COLORS[t]} strokeWidth={2} strokeDasharray={t==='internal'?'4,2':t==='party'?'8,3':t==='open'?'2,2':'none'}/></svg>
                <span className="capitalize">{t} wall</span>
                {t === currentType && <span className="ml-auto">✓</span>}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button onClick={() => { setWallMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
})

FloorPlanCanvas.displayName = 'FloorPlanCanvas'
export default FloorPlanCanvas