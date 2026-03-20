// lib/canvas-geometry.ts
// Pure geometry utilities for the floor plan canvas
// All coordinates in millimetres (real-world)

export type Vec2 = { x: number; y: number }
export type Edge = { a: Vec2; b: Vec2 }
export type Polygon = Vec2[]

// ─── Basic vector math ────────────────────────────────────────────────────────

export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function vecSub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function vecScale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s }
}

export function vecLen(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}

export function vecDist(a: Vec2, b: Vec2): number {
  return vecLen(vecSub(b, a))
}

export function vecNorm(v: Vec2): Vec2 {
  const l = vecLen(v)
  return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 }
}

export function vecDot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

// ─── Polygon area (shoelace formula) ─────────────────────────────────────────

export function polygonArea(pts: Polygon): number {
  let area = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += pts[i].x * pts[j].y
    area -= pts[j].x * pts[i].y
  }
  return Math.abs(area) / 2
}

export function polygonAreaM2(pts: Polygon): number {
  return polygonArea(pts) / 1_000_000 // mm² → m²
}

// ─── Polygon centroid ─────────────────────────────────────────────────────────

export function polygonCentroid(pts: Polygon): Vec2 {
  if (pts.length === 0) return { x: 0, y: 0 }
  let cx = 0, cy = 0
  for (const p of pts) { cx += p.x; cy += p.y }
  return { x: cx / pts.length, y: cy / pts.length }
}

// ─── Polygon bounding box ─────────────────────────────────────────────────────

export function polygonBBox(pts: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

// ─── Point in polygon (ray casting) ──────────────────────────────────────────

export function pointInPolygon(pt: Vec2, poly: Polygon): boolean {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// ─── Segment-segment intersection ────────────────────────────────────────────

export function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const d1 = vecSub(a2, a1)
  const d2 = vecSub(b2, b1)
  const cross = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(cross) < 1e-10) return null // parallel
  const d3 = vecSub(b1, a1)
  const t = (d3.x * d2.y - d3.y * d2.x) / cross
  const u = (d3.x * d1.y - d3.y * d1.x) / cross
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: a1.x + t * d1.x, y: a1.y + t * d1.y }
  }
  return null
}

// ─── Point-to-segment distance ────────────────────────────────────────────────

export function pointToSegmentDist(pt: Vec2, a: Vec2, b: Vec2): number {
  const ab = vecSub(b, a)
  const ap = vecSub(pt, a)
  const t = Math.max(0, Math.min(1, vecDot(ap, ab) / vecDot(ab, ab)))
  const proj = vecAdd(a, vecScale(ab, t))
  return vecDist(pt, proj)
}

export function pointToSegmentParam(pt: Vec2, a: Vec2, b: Vec2): number {
  const ab = vecSub(b, a)
  const ap = vecSub(pt, a)
  return Math.max(0, Math.min(1, vecDot(ap, ab) / vecDot(ab, ab)))
}

// ─── Segment overlap (for shared wall detection) ──────────────────────────────
// Returns fraction of segment A that overlaps with segment B (collinear)

export function segmentOverlapLength(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2, tol = 50): number {
  // Check if segments are collinear (within tolerance)
  const dA = vecSub(a2, a1)
  const lenA = vecLen(dA)
  if (lenA < 1) return 0
  const nA = vecNorm(dA)

  // Check b1 and b2 are on the line of a1-a2
  const db1 = vecDist(b1, vecAdd(a1, vecScale(nA, vecDot(vecSub(b1, a1), nA))))
  const db2 = vecDist(b2, vecAdd(a1, vecScale(nA, vecDot(vecSub(b2, a1), nA))))
  if (db1 > tol || db2 > tol) return 0

  // Project b1, b2 onto a1-a2 axis
  const t1 = vecDot(vecSub(b1, a1), nA)
  const t2 = vecDot(vecSub(b2, a1), nA)
  const tMin = Math.min(t1, t2)
  const tMax = Math.max(t1, t2)
  const overlapStart = Math.max(0, tMin)
  const overlapEnd = Math.min(lenA, tMax)
  return Math.max(0, overlapEnd - overlapStart)
}

// ─── Snapping ─────────────────────────────────────────────────────────────────

export function snapToGrid(pt: Vec2, gridMm: number): Vec2 {
  return {
    x: Math.round(pt.x / gridMm) * gridMm,
    y: Math.round(pt.y / gridMm) * gridMm,
  }
}

export function snapToAngle(delta: Vec2, angleDeg: number): Vec2 {
  const len = vecLen(delta)
  if (len === 0) return delta
  const angle = Math.atan2(delta.y, delta.x)
  const snapRad = (angleDeg * Math.PI) / 180
  const snapped = Math.round(angle / snapRad) * snapRad
  return { x: Math.cos(snapped) * len, y: Math.sin(snapped) * len }
}

// Find nearest vertex in a list within snapRadius
export function snapToVertex(pt: Vec2, vertices: Vec2[], snapRadius: number): Vec2 | null {
  let best: Vec2 | null = null
  let bestDist = snapRadius
  for (const v of vertices) {
    const d = vecDist(pt, v)
    if (d < bestDist) { bestDist = d; best = v }
  }
  return best
}

// Snap point to nearest edge midpoint or edge itself
export function snapToEdge(pt: Vec2, poly: Polygon, snapRadius: number): { snapped: Vec2; wallIndex: number; t: number } | null {
  let best: { snapped: Vec2; wallIndex: number; t: number } | null = null
  let bestDist = snapRadius
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const d = pointToSegmentDist(pt, a, b)
    if (d < bestDist) {
      bestDist = d
      const t = pointToSegmentParam(pt, a, b)
      const snapped = vecAdd(a, vecScale(vecSub(b, a), t))
      best = { snapped, wallIndex: i, t }
    }
  }
  return best
}

// ─── Adjacency detection ──────────────────────────────────────────────────────

export type SharedWall = {
  roomAId: string
  wallIndexA: number
  roomBId: string
  wallIndexB: number
  overlapLength: number // mm
}

export function detectAdjacency(
  rooms: Array<{ id: string; vertices: Polygon }>,
  minOverlapFraction = 0.8
): SharedWall[] {
  const shared: SharedWall[] = []
  for (let i = 0; i < rooms.length; i++) {
    const rA = rooms[i]
    const nA = rA.vertices.length
    for (let j = i + 1; j < rooms.length; j++) {
      const rB = rooms[j]
      const nB = rB.vertices.length
      for (let wA = 0; wA < nA; wA++) {
        const a1 = rA.vertices[wA]
        const a2 = rA.vertices[(wA + 1) % nA]
        const lenA = vecDist(a1, a2)
        for (let wB = 0; wB < nB; wB++) {
          const b1 = rB.vertices[wB]
          const b2 = rB.vertices[(wB + 1) % nB]
          const lenB = vecDist(b1, b2)
          const overlap = segmentOverlapLength(a1, a2, b1, b2)
          const shorter = Math.min(lenA, lenB)
          if (shorter > 50 && overlap / shorter >= minOverlapFraction) {
            shared.push({ roomAId: rA.id, wallIndexA: wA, roomBId: rB.id, wallIndexB: wB, overlapLength: overlap })
          }
        }
      }
    }
  }
  return shared
}

// ─── Rectangle helpers ────────────────────────────────────────────────────────

export function rectFromDimensions(x: number, y: number, wMm: number, hMm: number): Polygon {
  return [
    { x, y },
    { x: x + wMm, y },
    { x: x + wMm, y: y + hMm },
    { x, y: y + hMm },
  ]
}

// ─── Coordinate transforms ────────────────────────────────────────────────────

export type Viewport = { x: number; y: number; zoom: number } // x,y = pan offset in px

export function mmToPx(mm: number, zoom: number): number {
  // 1000mm (1m) = 100px at zoom 1.0
  return (mm / 1000) * 100 * zoom
}

export function pxToMm(px: number, zoom: number): number {
  return (px / (100 * zoom)) * 1000
}

export function worldToPx(pt: Vec2, vp: Viewport): Vec2 {
  return {
    x: mmToPx(pt.x, vp.zoom) + vp.x,
    y: mmToPx(pt.y, vp.zoom) + vp.y,
  }
}

export function pxToWorld(pt: Vec2, vp: Viewport): Vec2 {
  return {
    x: pxToMm(pt.x - vp.x, vp.zoom),
    y: pxToMm(pt.y - vp.y, vp.zoom),
  }
}

// ─── Wall length from vertices ────────────────────────────────────────────────

export function wallLength(vertices: Polygon, wallIndex: number): number {
  const a = vertices[wallIndex]
  const b = vertices[(wallIndex + 1) % vertices.length]
  return vecDist(a, b)
}

export function wallAngleDeg(vertices: Polygon, wallIndex: number): number {
  const a = vertices[wallIndex]
  const b = vertices[(wallIndex + 1) % vertices.length]
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

// ─── Auto-detect external walls ───────────────────────────────────────────────
// A wall is likely external if no other room shares it

export function autoWallTypes(
  roomId: string,
  vertices: Polygon,
  sharedWalls: SharedWall[]
): string[] {
  const n = vertices.length
  return Array.from({ length: n }, (_, i) => {
    const isShared = sharedWalls.some(
      sw =>
        (sw.roomAId === roomId && sw.wallIndexA === i) ||
        (sw.roomBId === roomId && sw.wallIndexB === i)
    )
    return isShared ? 'internal' : 'external'
  })
}

// ─── Perimeter of polygon ─────────────────────────────────────────────────────

export function polygonPerimeter(pts: Polygon): number {
  let p = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    p += vecDist(pts[i], pts[(i + 1) % n])
  }
  return p
}