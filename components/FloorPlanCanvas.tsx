'use client'

// components/FloorPlanCanvas.tsx
// SVG-based floor plan canvas with touch + mouse support

import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import {
  Vec2, Polygon, Viewport,
  vecAdd, vecSub, vecScale, vecDist, vecLen,
  polygonArea, polygonAreaM2, polygonCentroid, polygonBBox,
  pointInPolygon, snapToGrid, snapToVertex, snapToEdge,
  worldToPx, pxToWorld, mmToPx, pxToMm,
  detectAdjacency, autoWallTypes, wallLength, wallAngleDeg,
  rectFromDimensions,
} from '@/lib/canvas-geometry'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WallElement = {
  id: string
  wallIndex: number
  position: number    // 0-1 along wall
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
  vertices: Polygon       // mm coordinates
  wallTypes: string[]     // per edge: external/internal/party/open
  elements: WallElement[]
  heatLossW?: number
  color?: string
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
  backgroundImage?: string   // base64 image for plan upload
  backgroundScale?: number   // mm per px for background image
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

const HEAT_LOSS_COLOR = (w: number, area: number): string => {
  if (area <= 0) return '#d1fae5'
  const wpm2 = w / area
  if (wpm2 < 40) return '#d1fae5'  // green — low
  if (wpm2 < 70) return '#fef9c3'  // yellow — medium
  if (wpm2 < 100) return '#fed7aa' // orange — high
  return '#fecaca'                  // red — very high
}

const FloorPlanCanvas = forwardRef<CanvasRef, CanvasProps>(({
  rooms, activeFloor, tool, gridMm, showGrid, showDimensions, showHeatLoss,
  backgroundImage, backgroundScale = 1,
  onRoomsChange, onRoomSelect, selectedRoomId,
}, ref) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [vp, setVp] = useState<Viewport>({ x: 200, y: 200, zoom: 0.8 })
  const [drawVerts, setDrawVerts] = useState<Polygon>([])
  const [cursorPt, setCursorPt] = useState<Vec2 | null>(null)
  const [dragState, setDragState] = useState<{
    type: 'room' | 'vertex' | 'pan'
    roomId?: string
    vertexIndex?: number
    startPt: Vec2
    startVerts?: Polygon
    startVp?: Viewport
  } | null>(null)
  const [selectedVertex, setSelectedVertex] = useState<{ roomId: string; index: number } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 })

  // Touch state for pinch zoom
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
    return () => obs.disconnect()
  }, [])

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    fitToScreen() {
      const floorRooms = rooms.filter(r => r.floor === activeFloor)
      if (floorRooms.length === 0) { setVp({ x: 200, y: 200, zoom: 0.8 }); return }
      const allVerts = floorRooms.flatMap(r => r.vertices)
      const xs = allVerts.map(v => v.x), ys = allVerts.map(v => v.y)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const wMm = maxX - minX + 2000, hMm = maxY - minY + 2000
      const zoomX = containerSize.w / mmToPx(wMm, 1)
      const zoomY = containerSize.h / mmToPx(hMm, 1)
      const zoom = Math.min(zoomX, zoomY, 3)
      const cx = mmToPx(minX - 1000, zoom)
      const cy = mmToPx(minY - 1000, zoom)
      setVp({ x: -cx, y: -cy, zoom })
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

  // ─── Coordinate helpers ──────────────────────────────────────────────────────

  function getSVGPoint(e: React.PointerEvent | PointerEvent): Vec2 {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function getWorldPoint(pxPt: Vec2, snap = true): Vec2 {
    let pt = pxToWorld(pxPt, vp)
    if (snap) {
      // Snap to existing vertices first
      const allVerts = rooms.filter(r => r.floor === activeFloor).flatMap(r => r.vertices)
      const snapTol = pxToMm(10, vp.zoom)
      const snapped = snapToVertex(pt, allVerts, snapTol)
      if (snapped) return snapped
      // Then snap to grid
      pt = snapToGrid(pt, gridMm)
    }
    return pt
  }

  // ─── Adjacency update ────────────────────────────────────────────────────────

  function updateAdjacency(updatedRooms: CanvasRoom[]): CanvasRoom[] {
    const floorRooms = updatedRooms.filter(r => r.floor === activeFloor)
    const shared = detectAdjacency(floorRooms.map(r => ({ id: r.id, vertices: r.vertices })))
    return updatedRooms.map(room => {
      if (room.floor !== activeFloor) return room
      const wallTypes = autoWallTypes(room.id, room.vertices, shared)
      return { ...room, wallTypes }
    })
  }

  // ─── Finish drawing a room ───────────────────────────────────────────────────

  function finishDrawing() {
    if (drawVerts.length < 3) { setDrawVerts([]); return }
    const area = polygonAreaM2(drawVerts)
    if (area < 0.5) { setDrawVerts([]); return }  // too small
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

  // ─── Pointer events ──────────────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent) {
    const pxPt = getSVGPoint(e)
    const worldPt = getWorldPoint(pxPt)

    if (tool === 'pan' || (e.buttons === 4) || (e.pointerType === 'touch' && touchRef.current.length >= 1)) {
      setDragState({ type: 'pan', startPt: pxPt, startVp: { ...vp } })
      return
    }

    if (tool === 'draw') {
      if (e.button === 2) { finishDrawing(); return }  // right click = finish
      // Check if clicking near first vertex to close
      if (drawVerts.length >= 3) {
        const firstPx = worldToPx(drawVerts[0], vp)
        if (vecDist(pxPt, firstPx) < 15) { finishDrawing(); return }
      }
      setDrawVerts(prev => [...prev, worldPt])
      return
    }

    if (tool === 'select') {
      // Check if clicking on a vertex handle of selected room
      if (selectedRoomId) {
        const room = rooms.find(r => r.id === selectedRoomId)
        if (room) {
          for (let i = 0; i < room.vertices.length; i++) {
            const vPx = worldToPx(room.vertices[i], vp)
            if (vecDist(pxPt, vPx) < 10) {
              setSelectedVertex({ roomId: selectedRoomId, index: i })
              setDragState({ type: 'vertex', roomId: selectedRoomId, vertexIndex: i, startPt: pxPt, startVerts: [...room.vertices] })
              return
            }
          }
        }
      }

      // Check if clicking on a room
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

    if (dragState.type === 'vertex' && dragState.roomId !== undefined && dragState.vertexIndex !== undefined && dragState.startVerts) {
      const updated = rooms.map(room => {
        if (room.id !== dragState.roomId) return room
        const newVerts = [...room.vertices]
        newVerts[dragState.vertexIndex!] = worldPt
        return { ...room, vertices: newVerts }
      })
      onRoomsChange(updateAdjacency(updated))
      return
    }

    if (dragState.type === 'room' && dragState.roomId && dragState.startVerts) {
      const dpx = vecSub(pxPt, dragState.startPt)
      const dmm = { x: pxToMm(dpx.x, vp.zoom), y: pxToMm(dpx.y, vp.zoom) }
      const snappedDmm = snapToGrid(dmm, gridMm)
      const updated = rooms.map(room => {
        if (room.id !== dragState.roomId) return room
        const newVerts = dragState.startVerts!.map(v => vecAdd(v, snappedDmm))
        return { ...room, vertices: newVerts }
      })
      onRoomsChange(updateAdjacency(updated))
    }
  }

  function onPointerUp() {
    setDragState(null)
  }

  // Mouse wheel zoom
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const pxPt = getSVGPoint(e as any)
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(5, vp.zoom * factor))
    // Zoom toward cursor
    const worldPt = pxToWorld(pxPt, vp)
    const newX = pxPt.x - mmToPx(worldPt.x, newZoom)
    const newY = pxPt.y - mmToPx(worldPt.y, newZoom)
    setVp({ x: newX, y: newY, zoom: newZoom })
  }

  // Touch events for pinch zoom
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
      const newZoom = Math.max(0.1, Math.min(5, vp.zoom * factor))
      const worldPt = pxToWorld(pxPt, vp)
      setVp({ x: pxPt.x - mmToPx(worldPt.x, newZoom), y: pxPt.y - mmToPx(worldPt.y, newZoom), zoom: newZoom })
    }
  }

  // Double-click to add vertex to selected room's wall
  function onDblClick(e: React.MouseEvent) {
    if (tool !== 'select' || !selectedRoomId) return
    const pxPt = { x: e.clientX - (svgRef.current?.getBoundingClientRect().left || 0), y: e.clientY - (svgRef.current?.getBoundingClientRect().top || 0) }
    const worldPt = getWorldPoint(pxPt, false)
    const room = rooms.find(r => r.id === selectedRoomId)
    if (!room) return
    // Find closest edge
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
    if (bestEdge < 0 || pxToMm(bestDist, vp.zoom) > 500) return  // too far
    // Insert vertex
    const a = room.vertices[bestEdge], b = room.vertices[(bestEdge + 1) % room.vertices.length]
    const newVert = { x: a.x + bestT * (b.x - a.x), y: a.y + bestT * (b.y - a.y) }
    const snapped = snapToGrid(newVert, gridMm)
    const newVerts = [...room.vertices]
    newVerts.splice(bestEdge + 1, 0, snapped)
    const newWallTypes = [...room.wallTypes]
    newWallTypes.splice(bestEdge + 1, 0, newWallTypes[bestEdge])
    const updated = rooms.map(r => r.id === selectedRoomId ? { ...r, vertices: newVerts, wallTypes: newWallTypes } : r)
    onRoomsChange(updateAdjacency(updated))
  }

  // Context menu — right click during draw to finish
  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (tool === 'draw' && drawVerts.length >= 3) finishDrawing()
  }

  // ─── Rendering helpers ────────────────────────────────────────────────────────

  function renderGrid() {
    if (!showGrid) return null
    const lines = []
    const stepPx = mmToPx(gridMm, vp.zoom)
    if (stepPx < 4) return null
    const startX = Math.floor(-vp.x / stepPx) * stepPx + vp.x
    const startY = Math.floor(-vp.y / stepPx) * stepPx + vp.y
    for (let x = startX; x < containerSize.w; x += stepPx) {
      lines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={containerSize.h} stroke="#e5e7eb" strokeWidth={0.5}/>)
    }
    for (let y = startY; y < containerSize.h; y += stepPx) {
      lines.push(<line key={`gy${y}`} x1={0} y1={y} x2={containerSize.w} y2={y} stroke="#e5e7eb" strokeWidth={0.5}/>)
    }
    return <g>{lines}</g>
  }

  function renderRoom(room: CanvasRoom) {
    const pts = room.vertices.map(v => worldToPx(v, vp))
    const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ')
    const isSelected = room.id === selectedRoomId
    const area = polygonAreaM2(room.vertices)
    const fill = showHeatLoss && room.heatLossW !== undefined
      ? HEAT_LOSS_COLOR(room.heatLossW, area * 1000000)
      : (ROOM_COLORS[room.roomType] || '#f3f4f6')
    const centroid = polygonCentroid(pts)
    const labelSize = Math.max(8, Math.min(14, mmToPx(1500, vp.zoom)))

    return (
      <g key={room.id}>
        {/* Room fill */}
        <polygon
          points={ptsStr}
          fill={fill}
          stroke={isSelected ? '#059669' : '#6b7280'}
          strokeWidth={isSelected ? 2 : 1}
          style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
        />

        {/* Wall type indicators */}
        {room.vertices.map((v, i) => {
          const a = worldToPx(v, vp)
          const b = worldToPx(room.vertices[(i + 1) % room.vertices.length], vp)
          const wallType = room.wallTypes[i] || 'external'
          const color = wallType === 'external' ? '#374151' : wallType === 'party' ? '#7c3aed' : '#d1d5db'
          const width = wallType === 'external' ? 3 : 1
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2

          return (
            <g key={`wall_${i}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={width} strokeDasharray={wallType === 'internal' ? '4,3' : wallType === 'party' ? '8,3' : 'none'}/>
              {/* Wall type toggle button (only when selected) */}
              {isSelected && mmToPx(wallLength(room.vertices, i), vp.zoom) > 30 && (
                <circle
                  cx={mx} cy={my} r={6}
                  fill="white" stroke={color} strokeWidth={1.5}
                  style={{ cursor: 'pointer' }}
                  onClick={e => {
                    e.stopPropagation()
                    const types = ['external', 'internal', 'party', 'open']
                    const next = types[(types.indexOf(wallType) + 1) % types.length]
                    const updated = rooms.map(r => r.id !== room.id ? r : {
                      ...r,
                      wallTypes: r.wallTypes.map((t, wi) => wi === i ? next : t)
                    })
                    onRoomsChange(updated)
                  }}
                />
              )}
            </g>
          )
        })}

        {/* Dimensions */}
        {showDimensions && isSelected && room.vertices.map((v, i) => {
          const a = worldToPx(v, vp)
          const b = worldToPx(room.vertices[(i + 1) % room.vertices.length], vp)
          const len = wallLength(room.vertices, i)
          if (len < 200) return null // don't show very short walls
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          const dx = b.x - a.x, dy = b.y - a.y
          const nl = Math.sqrt(dx * dx + dy * dy)
          const nx = -dy / nl * 12, ny = dx / nl * 12
          const label = len >= 1000 ? `${(len / 1000).toFixed(2)}m` : `${Math.round(len)}mm`
          return (
            <text key={`dim_${i}`} x={mx + nx} y={my + ny} textAnchor="middle" dominantBaseline="middle"
              fontSize={Math.max(8, mmToPx(250, vp.zoom))} fill="#374151" fontFamily="monospace">
              {label}
            </text>
          )
        })}

        {/* Room label */}
        {labelSize > 6 && (
          <text x={centroid.x} y={centroid.y - (showHeatLoss && room.heatLossW ? labelSize * 0.7 : 0)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={labelSize} fill="#111827" fontWeight={isSelected ? '600' : '400'} fontFamily="sans-serif"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {room.name || room.roomType}
          </text>
        )}
        {showHeatLoss && room.heatLossW !== undefined && labelSize > 6 && (
          <text x={centroid.x} y={centroid.y + labelSize * 0.9}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={labelSize * 0.8} fill="#059669" fontFamily="sans-serif"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {room.heatLossW}W
          </text>
        )}

        {/* Area */}
        {isSelected && area > 0 && labelSize > 8 && (
          <text x={centroid.x} y={centroid.y + labelSize * 1.8}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={labelSize * 0.75} fill="#6b7280" fontFamily="sans-serif"
            style={{ pointerEvents: 'none' }}>
            {area.toFixed(1)}m²
          </text>
        )}

        {/* Vertex handles (selected room) */}
        {isSelected && pts.map((p, i) => (
          <circle key={`vh_${i}`} cx={p.x} cy={p.y} r={isMobile ? 8 : 5}
            fill={selectedVertex?.roomId === room.id && selectedVertex.index === i ? '#059669' : 'white'}
            stroke="#059669" strokeWidth={2}
            style={{ cursor: 'grab' }}
          />
        ))}

        {/* Wall elements (windows, doors, radiators) */}
        {room.elements.map(el => {
          const a = room.vertices[el.wallIndex]
          const b = room.vertices[(el.wallIndex + 1) % room.vertices.length]
          const pA = worldToPx(a, vp)
          const pB = worldToPx(b, vp)
          const ex = pA.x + el.position * (pB.x - pA.x)
          const ey = pA.y + el.position * (pB.y - pA.y)
          const wPx = mmToPx(el.widthMm, vp.zoom)
          const color = el.type === 'window' ? '#93c5fd' : el.type === 'door' ? '#fbbf24' : '#f87171'
          return (
            <g key={el.id}>
              <rect x={ex - wPx / 2} y={ey - 4} width={wPx} height={8}
                fill={color} stroke="white" strokeWidth={1} rx={2}
                style={{ cursor: 'pointer' }}
              />
            </g>
          )
        })}
      </g>
    )
  }

  // Draw preview polygon
  function renderDrawPreview() {
    if (tool !== 'draw' || drawVerts.length === 0) return null
    const pts = drawVerts.map(v => worldToPx(v, vp))
    const cursor = cursorPt ? worldToPx(cursorPt, vp) : null

    return (
      <g>
        {/* Existing vertices + lines */}
        <polyline
          points={[...pts, cursor].filter(Boolean).map(p => `${p!.x},${p!.y}`).join(' ')}
          fill="none" stroke="#059669" strokeWidth={2} strokeDasharray="6,3"
        />
        {/* Vertex dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === 0 && drawVerts.length >= 3 ? 8 : 4}
            fill={i === 0 && drawVerts.length >= 3 ? '#059669' : 'white'}
            stroke="#059669" strokeWidth={2}
          />
        ))}
        {/* Close hint */}
        {drawVerts.length >= 3 && (
          <text x={pts[0].x + 10} y={pts[0].y - 8} fontSize={10} fill="#059669">close</text>
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
        width={containerSize.w}
        height={containerSize.h}
        style={{ cursor: tool === 'draw' ? 'crosshair' : tool === 'pan' ? 'grab' : 'default', display: 'block' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onDoubleClick={onDblClick}
        onContextMenu={onContextMenu}
      >
        {/* Background image */}
        {backgroundImage && (
          <image href={backgroundImage} x={vp.x} y={vp.y}
            width={mmToPx(backgroundScale * 1000, vp.zoom)}
            opacity={0.4}
          />
        )}

        {renderGrid()}

        {/* Rooms — non-selected first, then selected on top */}
        {floorRooms.filter(r => r.id !== selectedRoomId).map(r => renderRoom(r))}
        {floorRooms.filter(r => r.id === selectedRoomId).map(r => renderRoom(r))}

        {renderDrawPreview()}

        {/* Scale indicator */}
        <g transform={`translate(${containerSize.w - 120}, ${containerSize.h - 30})`}>
          <rect x={0} y={0} width={100} height={20} fill="rgba(255,255,255,0.9)" rx={4}/>
          <line x1={10} y1={14} x2={90} y2={14} stroke="#374151" strokeWidth={2}/>
          <line x1={10} y1={10} x2={10} y2={18} stroke="#374151" strokeWidth={2}/>
          <line x1={90} y1={10} x2={90} y2={18} stroke="#374151" strokeWidth={2}/>
          <text x={50} y={10} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="monospace">
            {pxToMm(80, vp.zoom) >= 1000 ? `${(pxToMm(80, vp.zoom) / 1000).toFixed(1)}m` : `${Math.round(pxToMm(80, vp.zoom))}mm`}
          </text>
        </g>

        {/* Draw hint */}
        {tool === 'draw' && (
          <text x={12} y={20} fontSize={11} fill="#6b7280" fontFamily="sans-serif">
            Click to add points · Double-click first point or right-click to close room
          </text>
        )}
      </svg>

      {/* Wall type legend */}
      {selectedRoomId && (
        <div className="absolute bottom-8 left-3 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs space-y-1 shadow-sm">
          <div className="text-gray-500 font-medium mb-1">Tap wall dot to cycle type</div>
          {[
            { color: '#374151', label: 'External wall', dash: false },
            { color: '#d1d5db', label: 'Internal wall', dash: true },
            { color: '#7c3aed', label: 'Party wall', dash: true },
          ].map(({ color, label, dash }) => (
            <div key={label} className="flex items-center gap-2">
              <svg width={24} height={8}><line x1={0} y1={4} x2={24} y2={4} stroke={color} strokeWidth={2} strokeDasharray={dash ? '4,2' : 'none'}/></svg>
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