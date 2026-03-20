'use client'

// components/FloorPlanCanvas.tsx

import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import {
  Vec2, Polygon, Viewport,
  vecAdd, vecSub, vecScale, vecDist,
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
  label?: string
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

function heatLossColor(w: number, areaMm2: number): string {
  if (areaMm2 <= 0) return '#d1fae5'
  const wpm2 = w / (areaMm2 / 1_000_000)
  if (wpm2 < 40) return '#d1fae5'
  if (wpm2 < 70) return '#fef9c3'
  if (wpm2 < 100) return '#fed7aa'
  return '#fecaca'
}

// Check if a polygon is approximately rectangular (all angles ~90°)
function isRectangular(verts: Polygon): boolean {
  if (verts.length !== 4) return false
  for (let i = 0; i < 4; i++) {
    const a = verts[(i + 3) % 4]
    const b = verts[i]
    const c = verts[(i + 1) % 4]
    const ab = vecSub(b, a)
    const bc = vecSub(c, b)
    const dot = ab.x * bc.x + ab.y * bc.y
    const lenAB = vecDist(a, b)
    const lenBC = vecDist(b, c)
    if (lenAB < 1 || lenBC < 1) return false
    const cosAngle = dot / (lenAB * lenBC)
    if (Math.abs(cosAngle) > 0.1) return false // not perpendicular
  }
  return true
}

// Move a vertex of a rectangle keeping it rectangular
function moveRectVertex(verts: Polygon, idx: number, newPos: Vec2): Polygon {
  const n = verts.length
  const prev = (idx + n - 1) % n
  const next = (idx + 1) % n
  const opp = (idx + 2) % n

  const newVerts = [...verts]
  newVerts[idx] = newPos

  // Keep adjacent vertices perpendicular
  const dPrev = vecSub(verts[prev], verts[idx]) // direction from moved to prev
  const dNext = vecSub(verts[next], verts[idx]) // direction from moved to next

  const lenPrev = vecDist(verts[prev], verts[idx])
  const lenNext = vecDist(verts[next], verts[idx])

  // Project movement onto the wall directions
  const dx = newPos.x - verts[idx].x
  const dy = newPos.y - verts[idx].y

  if (lenPrev > 0 && lenNext > 0) {
    const normPrev = { x: dPrev.x / lenPrev, y: dPrev.y / lenPrev }
    const normNext = { x: dNext.x / lenNext, y: dNext.y / lenNext }

    const movePrev = dx * normPrev.x + dy * normPrev.y
    const moveNext = dx * normNext.x + dy * normNext.y

    newVerts[prev] = {
      x: verts[prev].x + moveNext * normNext.x,
      y: verts[prev].y + moveNext * normNext.y,
    }
    newVerts[next] = {
      x: verts[next].x + movePrev * normPrev.x,
      y: verts[next].y + movePrev * normPrev.y,
    }
    // Opposite corner stays fixed (already unchanged)
    newVerts[opp] = verts[opp]
  }

  return newVerts
}

const FloorPlanCanvas = forwardRef<CanvasRef, CanvasProps>(({
  rooms, activeFloor, tool, gridMm, showGrid, showDimensions, showHeatLoss,
  backgroundImage,
  onRoomsChange, onRoomSelect, selectedRoomId,
}, ref) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [vp, setVp] = useState<Viewport>({ x: 200, y: 200, zoom: 0.8 })
  const vpRef = useRef(vp)
  useEffect(() => { vpRef.current = vp }, [vp])

  const [drawVerts, setDrawVerts] = useState<Polygon>([])
  const [cursorPt, setCursorPt] = useState<Vec2 | null>(null)
  const [dragState, setDragState] = useState<{
    type: 'room' | 'vertex' | 'pan'
    roomId?: string
    vertexIndex?: number
    startPt: Vec2
    startVerts?: Polygon
    startVp?: Viewport
    isRect?: boolean
  } | null>(null)
  const [selectedVertex, setSelectedVertex] = useState<{ roomId: string; index: number } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 })

  const touchRef = useRef<{ id: number; x: number; y: number }[]>([])
  const lastPinchDistRef = useRef<number>(0)

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)

    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        setContainerSize({ w: e.contentRect.width, h: e.contentRect.height })
      }
    })
    if (containerRef.current) obs.observe(containerRef.current)

    // Non-passive wheel listener — prevents page scroll when over canvas
    const svgEl = svgRef.current
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = svgEl?.getBoundingClientRect()
      if (!rect) return
      const pxPt = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      setVp(prev => {
        const newZoom = Math.max(0.1, Math.min(5, prev.zoom * factor))
        const worldPt = pxToWorld(pxPt, prev)
        return {
          x: pxPt.x - mmToPx(worldPt.x, newZoom),
          y: pxPt.y - mmToPx(worldPt.y, newZoom),
          zoom: newZoom,
        }
      })
    }
    svgEl?.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      obs.disconnect()
      svgEl?.removeEventListener('wheel', handleWheel)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    fitToScreen() {
      const fr = rooms.filter(r => r.floor === activeFloor)
      if (fr.length === 0) { setVp({ x: 200, y: 200, zoom: 0.8 }); return }
      const allV = fr.flatMap(r => r.vertices)
      const xs = allV.map(v => v.x), ys = allV.map(v => v.y)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const wMm = maxX - minX + 2000, hMm = maxY - minY + 2000
      const zoom = Math.min(containerSize.w / mmToPx(wMm, 1), containerSize.h / mmToPx(hMm, 1), 3)
      setVp({ x: -mmToPx(minX - 1000, zoom), y: -mmToPx(minY - 1000, zoom), zoom })
    },
    zoomIn() { setVp(v => ({ ...v, zoom: Math.min(v.zoom * 1.25, 5) })) },
    zoomOut() { setVp(v => ({ ...v, zoom: Math.max(v.zoom * 0.8, 0.1) })) },
    deleteSelected() {
      if (selectedRoomId) {
        onRoomsChange(rooms.filter(r => r.id !== selectedRoomId))
        onRoomSelect(null)
      }
    },
  }))

  function getSVGPoint(e: React.PointerEvent | React.MouseEvent): Vec2 {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function getWorldPoint(pxPt: Vec2, snap = true): Vec2 {
    let pt = pxToWorld(pxPt, vp)
    if (snap) {
      const allV = rooms.filter(r => r.floor === activeFloor).flatMap(r => r.vertices)
      const snapTol = pxToMm(12, vp.zoom)
      const snapped = snapToVertex(pt, allV, snapTol)
      if (snapped) return snapped
      pt = snapToGrid(pt, gridMm)
    }
    return pt
  }

  function updateAdjacency(updated: CanvasRoom[]): CanvasRoom[] {
    const floor = updated.filter(r => r.floor === activeFloor)
    const shared = detectAdjacency(floor.map(r => ({ id: r.id, vertices: r.vertices })))
    return updated.map(room => {
      if (room.floor !== activeFloor) return room
      return { ...room, wallTypes: autoWallTypes(room.id, room.vertices, shared) }
    })
  }

  function finishDrawing() {
    if (drawVerts.length < 3) { setDrawVerts([]); return }
    if (polygonAreaM2(drawVerts) < 0.5) { setDrawVerts([]); return }
    const id = `room_${Date.now()}`
    const newRoom: CanvasRoom = {
      id, name: '', roomType: 'Living room', floor: activeFloor,
      vertices: drawVerts,
      wallTypes: new Array(drawVerts.length).fill('external'),
      elements: [],
    }
    const updated = updateAdjacency([...rooms, newRoom])
    onRoomsChange(updated)
    onRoomSelect(id)
    setDrawVerts([])
  }

  function onPointerDown(e: React.PointerEvent) {
    const pxPt = getSVGPoint(e)
    const worldPt = getWorldPoint(pxPt)

    // Pan: middle mouse, pan tool, or two-finger touch
    if (tool === 'pan' || e.buttons === 4) {
      setDragState({ type: 'pan', startPt: pxPt, startVp: { ...vp } })
      return
    }

    if (tool === 'draw') {
      if (e.button === 2) { finishDrawing(); return }
      if (drawVerts.length >= 3) {
        const firstPx = worldToPx(drawVerts[0], vp)
        if (vecDist(pxPt, firstPx) < 15) { finishDrawing(); return }
      }
      setDrawVerts(prev => [...prev, worldPt])
      return
    }

    if (tool === 'select') {
      // Check vertex handles first
      if (selectedRoomId) {
        const room = rooms.find(r => r.id === selectedRoomId)
        if (room) {
          for (let i = 0; i < room.vertices.length; i++) {
            const vPx = worldToPx(room.vertices[i], vp)
            if (vecDist(pxPt, vPx) < (isMobile ? 16 : 10)) {
              setSelectedVertex({ roomId: selectedRoomId, index: i })
              setDragState({
                type: 'vertex', roomId: selectedRoomId, vertexIndex: i,
                startPt: pxPt, startVerts: [...room.vertices],
                isRect: isRectangular(room.vertices),
              })
              return
            }
          }
        }
      }

      // Check room hit
      const floorRooms = rooms.filter(r => r.floor === activeFloor)
      for (let i = floorRooms.length - 1; i >= 0; i--) {
        const room = floorRooms[i]
        if (pointInPolygon(worldPt, room.vertices)) {
          onRoomSelect(room.id)
          setDragState({ type: 'room', roomId: room.id, startPt: pxPt, startVerts: [...room.vertices] })
          return
        }
      }
      onRoomSelect(null)
      setSelectedVertex(null)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const pxPt = getSVGPoint(e)
    const worldPt = getWorldPoint(pxPt)
    setCursorPt(worldPt)

    if (!dragState) return

    if (dragState.type === 'pan' && dragState.startVp) {
      const dx = pxPt.x - dragState.startPt.x
      const dy = pxPt.y - dragState.startPt.y
      setVp({ ...dragState.startVp, x: dragState.startVp.x + dx, y: dragState.startVp.y + dy })
      return
    }

    if (dragState.type === 'vertex' && dragState.roomId && dragState.vertexIndex !== undefined && dragState.startVerts) {
      const updated = rooms.map(room => {
        if (room.id !== dragState.roomId) return room
        let newVerts: Polygon
        if (dragState.isRect && room.vertices.length === 4) {
          // Keep rectangular when dragging vertex of a rectangle
          newVerts = moveRectVertex(dragState.startVerts!, dragState.vertexIndex!, worldPt)
        } else {
          newVerts = [...room.vertices]
          newVerts[dragState.vertexIndex!] = worldPt
        }
        return { ...room, vertices: newVerts }
      })
      onRoomsChange(updateAdjacency(updated))
      return
    }

    if (dragState.type === 'room' && dragState.roomId && dragState.startVerts) {
      const dpx = vecSub(pxPt, dragState.startPt)
      const dmm = snapToGrid(
        { x: pxToMm(dpx.x, vp.zoom), y: pxToMm(dpx.y, vp.zoom) },
        gridMm
      )
      const updated = rooms.map(room => {
        if (room.id !== dragState.roomId) return room
        return { ...room, vertices: dragState.startVerts!.map(v => vecAdd(v, dmm)) }
      })
      onRoomsChange(updateAdjacency(updated))
    }
  }

  function onPointerUp() { setDragState(null) }

  function onTouchStart(e: React.TouchEvent) {
    touchRef.current = Array.from(e.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }))
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy)
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const factor = dist / (lastPinchDistRef.current || dist)
      lastPinchDistRef.current = dist
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const pxPt = { x: cx - rect.left, y: cy - rect.top }
      setVp(prev => {
        const newZoom = Math.max(0.1, Math.min(5, prev.zoom * factor))
        const worldPt = pxToWorld(pxPt, prev)
        return { x: pxPt.x - mmToPx(worldPt.x, newZoom), y: pxPt.y - mmToPx(worldPt.y, newZoom), zoom: newZoom }
      })
    }
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (tool !== 'select' || !selectedRoomId) return
    const pxPt = getSVGPoint(e)
    const worldPt = getWorldPoint(pxPt, false)
    const room = rooms.find(r => r.id === selectedRoomId)
    if (!room) return
    let bestEdge = -1, bestT = 0, bestDist = Infinity
    for (let i = 0; i < room.vertices.length; i++) {
      const a = room.vertices[i], b = room.vertices[(i + 1) % room.vertices.length]
      const dx = b.x - a.x, dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      if (len2 === 0) continue
      const t = Math.max(0, Math.min(1, ((worldPt.x - a.x) * dx + (worldPt.y - a.y) * dy) / len2))
      const px = a.x + t * dx, py = a.y + t * dy
      const d = Math.sqrt((worldPt.x - px) ** 2 + (worldPt.y - py) ** 2)
      if (d < bestDist) { bestDist = d; bestEdge = i; bestT = t }
    }
    if (bestEdge < 0 || pxToMm(bestDist, vp.zoom) > 500) return
    const a = room.vertices[bestEdge], b = room.vertices[(bestEdge + 1) % room.vertices.length]
    const newVert = snapToGrid({ x: a.x + bestT * (b.x - a.x), y: a.y + bestT * (b.y - a.y) }, gridMm)
    const newVerts = [...room.vertices]
    newVerts.splice(bestEdge + 1, 0, newVert)
    const newWallTypes = [...room.wallTypes]
    newWallTypes.splice(bestEdge + 1, 0, newWallTypes[bestEdge])
    const updated = rooms.map(r => r.id === selectedRoomId ? { ...r, vertices: newVerts, wallTypes: newWallTypes } : r)
    onRoomsChange(updateAdjacency(updated))
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (tool === 'draw' && drawVerts.length >= 3) finishDrawing()
  }

  // ─── Rendering ────────────────────────────────────────────────────────────────

  function renderGrid() {
    if (!showGrid) return null
    const stepPx = mmToPx(gridMm, vp.zoom)
    if (stepPx < 4) return null
    const lines = []
    const startX = Math.floor(-vp.x / stepPx) * stepPx + vp.x
    const startY = Math.floor(-vp.y / stepPx) * stepPx + vp.y
    for (let x = startX; x < containerSize.w; x += stepPx)
      lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={containerSize.h} stroke="#e5e7eb" strokeWidth={0.5}/>)
    for (let y = startY; y < containerSize.h; y += stepPx)
      lines.push(<line key={`y${y}`} x1={0} y1={y} x2={containerSize.w} y2={y} stroke="#e5e7eb" strokeWidth={0.5}/>)
    return <g>{lines}</g>
  }

  function renderRoom(room: CanvasRoom) {
    const pts = room.vertices.map(v => worldToPx(v, vp))
    const ptsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const isSelected = room.id === selectedRoomId
    const areaMm2 = room.vertices.reduce((s, v, i) => {
      const j = (i + 1) % room.vertices.length
      return s + v.x * room.vertices[j].y - room.vertices[j].x * v.y
    }, 0)
    const fill = showHeatLoss && room.heatLossW !== undefined
      ? heatLossColor(room.heatLossW, Math.abs(areaMm2) / 2)
      : (ROOM_COLORS[room.roomType] || '#f3f4f6')
    const centroid = polygonCentroid(pts)
    const labelSize = Math.max(8, Math.min(14, mmToPx(1500, vp.zoom)))
    const areaM2 = Math.abs(areaMm2) / 2 / 1_000_000

    return (
      <g key={room.id}>
        <polygon points={ptsStr} fill={fill}
          stroke={isSelected ? '#059669' : '#6b7280'}
          strokeWidth={isSelected ? 2.5 : 1}
          style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
        />

        {/* Walls */}
        {room.vertices.map((v, i) => {
          const a = worldToPx(v, vp)
          const b = worldToPx(room.vertices[(i + 1) % room.vertices.length], vp)
          const wallType = room.wallTypes[i] || 'external'
          const color = wallType === 'external' ? '#1f2937' : wallType === 'party' ? '#7c3aed' : '#9ca3af'
          const width = wallType === 'external' ? 3 : 1.5
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          const wallPxLen = vecDist(a, b)

          return (
            <g key={`w${i}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={color} strokeWidth={width}
                strokeDasharray={wallType === 'internal' ? '5,3' : wallType === 'party' ? '10,4' : 'none'}
              />
              {/* Dimension label */}
              {showDimensions && isSelected && wallPxLen > 35 && (() => {
                const len = wallLength(room.vertices, i)
                const dx = b.x - a.x, dy = b.y - a.y
                const nl = Math.sqrt(dx * dx + dy * dy)
                const nx = -dy / nl * 14, ny = dx / nl * 14
                const label = len >= 1000 ? `${(len / 1000).toFixed(2)}m` : `${Math.round(len)}mm`
                return (
                  <text x={mx + nx} y={my + ny} textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.max(8, mmToPx(220, vp.zoom))} fill="#374151" fontFamily="monospace"
                    style={{ pointerEvents: 'none' }}>
                    {label}
                  </text>
                )
              })()}
              {/* Wall type toggle */}
              {isSelected && wallPxLen > 24 && (
                <circle cx={mx} cy={my} r={isMobile ? 8 : 6}
                  fill="white" stroke={color} strokeWidth={1.5}
                  style={{ cursor: 'pointer' }}
                  onClick={e => {
                    e.stopPropagation()
                    const types = ['external', 'internal', 'party', 'open']
                    const next = types[(types.indexOf(wallType) + 1) % types.length]
                    onRoomsChange(rooms.map(r => r.id !== room.id ? r : {
                      ...r, wallTypes: r.wallTypes.map((t, wi) => wi === i ? next : t)
                    }))
                  }}
                />
              )}
            </g>
          )
        })}

        {/* Room label */}
        {labelSize > 6 && (
          <text x={centroid.x} y={centroid.y - (showHeatLoss && room.heatLossW ? labelSize * 0.6 : 0)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={labelSize} fill="#111827" fontWeight={isSelected ? '600' : '400'}
            fontFamily="sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {room.name || room.roomType}
          </text>
        )}
        {showHeatLoss && room.heatLossW !== undefined && labelSize > 6 && (
          <text x={centroid.x} y={centroid.y + labelSize * 0.9}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={labelSize * 0.85} fill="#059669" fontFamily="sans-serif"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {room.heatLossW}W
          </text>
        )}
        {isSelected && areaM2 > 0 && labelSize > 8 && (
          <text x={centroid.x} y={centroid.y + labelSize * (showHeatLoss && room.heatLossW ? 1.9 : 1.2)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={labelSize * 0.75} fill="#6b7280" fontFamily="sans-serif"
            style={{ pointerEvents: 'none' }}>
            {areaM2.toFixed(1)}m²
          </text>
        )}

        {/* Vertex handles */}
        {isSelected && pts.map((p, i) => (
          <circle key={`vh${i}`} cx={p.x} cy={p.y} r={isMobile ? 9 : 6}
            fill={selectedVertex?.roomId === room.id && selectedVertex.index === i ? '#059669' : 'white'}
            stroke="#059669" strokeWidth={2}
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
          const color = el.type === 'window' ? '#93c5fd' : el.type === 'door' ? '#fbbf24' : '#f87171'
          return (
            <rect key={el.id} x={ex - wPx / 2} y={ey - 5} width={wPx} height={10}
              fill={color} stroke="white" strokeWidth={1} rx={2}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
      </g>
    )
  }

  function renderDrawPreview() {
    if (tool !== 'draw' || drawVerts.length === 0) return null
    const pts = drawVerts.map(v => worldToPx(v, vp))
    const cursor = cursorPt ? worldToPx(cursorPt, vp) : null
    const allPts = cursor ? [...pts, cursor] : pts
    return (
      <g>
        <polyline points={allPts.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#059669" strokeWidth={2} strokeDasharray="6,3"/>
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y}
            r={i === 0 && drawVerts.length >= 3 ? 9 : 5}
            fill={i === 0 && drawVerts.length >= 3 ? '#059669' : 'white'}
            stroke="#059669" strokeWidth={2}/>
        ))}
        {drawVerts.length >= 3 && (
          <text x={pts[0].x + 12} y={pts[0].y - 8} fontSize={10} fill="#059669">click to close</text>
        )}
      </g>
    )
  }

  const floorRooms = rooms.filter(r => r.floor === activeFloor)

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-white rounded-xl border border-gray-200 select-none"
      style={{ touchAction: 'none' }}>
      <svg
        ref={svgRef}
        width={containerSize.w} height={containerSize.h}
        style={{ cursor: tool === 'draw' ? 'crosshair' : tool === 'pan' ? 'grab' : 'default', display: 'block' }}
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
          <image href={backgroundImage} x={vp.x} y={vp.y} opacity={0.4}
            width={mmToPx(10000, vp.zoom)}/>
        )}

        {renderGrid()}

        {floorRooms.filter(r => r.id !== selectedRoomId).map(r => renderRoom(r))}
        {floorRooms.filter(r => r.id === selectedRoomId).map(r => renderRoom(r))}

        {renderDrawPreview()}

        {/* Scale bar */}
        <g transform={`translate(${containerSize.w - 130}, ${containerSize.h - 32})`}>
          <rect x={0} y={0} width={110} height={22} fill="rgba(255,255,255,0.9)" rx={4}/>
          <line x1={10} y1={15} x2={100} y2={15} stroke="#374151" strokeWidth={2}/>
          <line x1={10} y1={11} x2={10} y2={19} stroke="#374151" strokeWidth={2}/>
          <line x1={100} y1={11} x2={100} y2={19} stroke="#374151" strokeWidth={2}/>
          <text x={55} y={10} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="monospace">
            {pxToMm(90, vp.zoom) >= 1000 ? `${(pxToMm(90, vp.zoom) / 1000).toFixed(1)}m` : `${Math.round(pxToMm(90, vp.zoom))}mm`}
          </text>
        </g>

        {/* Hints */}
        {tool === 'draw' && (
          <text x={10} y={20} fontSize={11} fill="#6b7280" fontFamily="sans-serif">
            Click to place points · Right-click or click first point to close room
          </text>
        )}
        {tool === 'select' && selectedRoomId && (
          <text x={10} y={20} fontSize={11} fill="#6b7280" fontFamily="sans-serif">
            Drag room to move · Drag corner handles to resize · Double-click wall edge to add vertex · Tap wall dot to change type
          </text>
        )}
      </svg>

      {/* Wall legend */}
      {selectedRoomId && (
        <div className="absolute bottom-10 left-3 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm space-y-1">
          {[
            { color: '#1f2937', label: 'External', dash: false },
            { color: '#9ca3af', label: 'Internal', dash: true },
            { color: '#7c3aed', label: 'Party wall', dash: true },
          ].map(({ color, label, dash }) => (
            <div key={label} className="flex items-center gap-2">
              <svg width={20} height={6}><line x1={0} y1={3} x2={20} y2={3} stroke={color} strokeWidth={2} strokeDasharray={dash ? '4,2' : 'none'}/></svg>
              <span className="text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

FloorPlanCanvas.displayName = 'FloorPlanCanvas'
export default FloorPlanCanvas