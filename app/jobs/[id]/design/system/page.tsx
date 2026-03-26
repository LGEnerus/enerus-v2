'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ULTRAHEAT_RADIATORS, radOutput } from '@/lib/radiators'

// ─── Types ───────────────────────────────────────────────────────────────────

type CanvasRoom = {
  id: string
  name: string
  roomType: string
  floor: number
  heatLossW: number
  elements: { id: string; type: string; wallIndex: number; position: number; widthMm?: number }[]
  vertices: { x: number; y: number }[]
}

type RoomEmitter = {
  roomId: string
  roomName: string
  roomType: string
  floor: number
  heatLossW: number
  emitterType: 'radiator' | 'ufh' | 'none'
  selectedRadiators: { radiatorId: string; quantity: number }[]
  ufhPipeSpacingMm: number
  ufhOutputWm2: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFloorName(f: number): string {
  return f === 0 ? 'Ground floor' : f === 1 ? 'First floor' : f === 2 ? 'Second floor' : `Floor ${f}`
}

function calcDeltaT(flowTemp: number, returnTemp: number, roomTemp: number): number {
  return (flowTemp + returnTemp) / 2 - roomTemp
}

function roomTempC(roomType: string): number {
  const temps: Record<string, number> = {
    'Living room': 21, 'Dining room': 21, 'Kitchen': 18, 'Bedroom': 18,
    'Bathroom': 22, 'En-suite': 22, 'Hall / Landing': 18, 'Study': 21,
    'Utility room': 18, 'WC': 18, 'Conservatory': 21, 'Playroom': 21,
  }
  return temps[roomType] || 21
}

function suggestRadiator(
  requiredW: number, flowTemp: number, returnTemp: number, roomType: string
): { radiatorId: string; quantity: number } | null {
  const dt = calcDeltaT(flowTemp, returnTemp, roomTempC(roomType))
  const suitable = ULTRAHEAT_RADIATORS
    .map(r => ({ ...r, output: radOutput(r, dt) }))
    .filter(r => r.output >= requiredW)
    .sort((a, b) => a.output - b.output)
  if (suitable.length > 0) return { radiatorId: suitable[0].id, quantity: 1 }
  const largest = ULTRAHEAT_RADIATORS
    .map(r => ({ ...r, output: radOutput(r, dt) }))
    .sort((a, b) => b.output - a.output)[0]
  if (largest && largest.output * 2 >= requiredW) return { radiatorId: largest.id, quantity: 2 }
  return null
}

function getSPF(flowTemp: number): number {
  if (flowTemp <= 35) return 3.8
  if (flowTemp <= 40) return 3.5
  if (flowTemp <= 45) return 3.2
  if (flowTemp <= 50) return 2.8
  if (flowTemp <= 55) return 2.5
  return 2.2
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EmitterSpecPage() {
  const params = useParams()
  const jobId = params.id as string

  const [rooms, setRooms] = useState<RoomEmitter[]>([])
  const [flowTemp, setFlowTemp] = useState(50)
  const [returnTemp, setReturnTemp] = useState(40)
  const [customer, setCustomer] = useState<any>(null)
  const [totalHeatLossW, setTotalHeatLossW] = useState(0)
  const [designTempExt, setDesignTempExt] = useState(-4)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null)
  const [radFilter, setRadFilter] = useState({ height: '', type: '' })

  useEffect(() => { load() }, [jobId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }
    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)
    const { data: sd } = await (supabase as any).from('system_designs').select('*').eq('job_id', jobId).single()
    if (!sd?.design_inputs) { setLoading(false); return }
    const di = sd.design_inputs
    const canvasRooms: CanvasRoom[] = di.rooms || []
    const savedEmitters: RoomEmitter[] = di.emitterSpecs || []
    setDesignTempExt(di.designTempExt || -4)
    if (di.flowTemp) setFlowTemp(di.flowTemp)
    if (di.returnTemp) setReturnTemp(di.returnTemp)
    const totalW = canvasRooms.reduce((s: number, r: CanvasRoom) => s + (r.heatLossW || 0), 0)
    setTotalHeatLossW(totalW)
    const emitters: RoomEmitter[] = canvasRooms.map(cr => {
      const saved = savedEmitters.find(e => e.roomId === cr.id)
      const hasUfh = cr.elements.some(el => el.type === 'ufh')
      const heatLoss = cr.heatLossW || 0
      if (saved) return { ...saved, heatLossW: heatLoss, roomName: cr.name || cr.roomType }
      const emitterType: 'radiator' | 'ufh' = hasUfh ? 'ufh' : 'radiator'
      let selectedRadiators: { radiatorId: string; quantity: number }[] = []
      if (emitterType === 'radiator' && heatLoss > 0) {
        const s = suggestRadiator(heatLoss, di.flowTemp || 50, di.returnTemp || 40, cr.roomType)
        if (s) selectedRadiators = [s]
      }
      return {
        roomId: cr.id, roomName: cr.name || cr.roomType, roomType: cr.roomType,
        floor: cr.floor, heatLossW: heatLoss, emitterType, selectedRadiators,
        ufhPipeSpacingMm: 200, ufhOutputWm2: 80,
      }
    })
    setRooms(emitters)
    setLoading(false)
  }

  function updRoom(roomId: string, updates: Partial<RoomEmitter>) {
    setRooms(prev => prev.map(r => r.roomId !== roomId ? r : { ...r, ...updates }))
  }

  function addRadiator(roomId: string, radiatorId: string) {
    setRooms(prev => prev.map(r => {
      if (r.roomId !== roomId) return r
      const existing = r.selectedRadiators.find(s => s.radiatorId === radiatorId)
      if (existing) return { ...r, selectedRadiators: r.selectedRadiators.map(s => s.radiatorId === radiatorId ? { ...s, quantity: s.quantity + 1 } : s) }
      return { ...r, selectedRadiators: [...r.selectedRadiators, { radiatorId, quantity: 1 }] }
    }))
  }

  function removeRadiator(roomId: string, radiatorId: string) {
    setRooms(prev => prev.map(r => r.roomId !== roomId ? r : {
      ...r, selectedRadiators: r.selectedRadiators.filter(s => s.radiatorId !== radiatorId)
    }))
  }

  async function save(redirect?: string) {
    setSaving(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: sd } = await (supabase as any).from('system_designs').select('design_inputs').eq('job_id', jobId).single()
      const existing = sd?.design_inputs || {}
      const { error: e } = await (supabase as any).from('system_designs').update({
        design_inputs: { ...existing, emitterSpecs: rooms, flowTemp, returnTemp },
        updated_at: new Date().toISOString(),
      }).eq('job_id', jobId)
      if (e) throw e
      setSaved(true); setTimeout(() => setSaved(false), 3000)
      if (redirect) window.location.href = redirect
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  // Derived totals
  const totalRadOutput = rooms.reduce((sum, room) => {
    if (room.emitterType !== 'radiator') return sum
    const dt = calcDeltaT(flowTemp, returnTemp, roomTempC(room.roomType))
    return sum + room.selectedRadiators.reduce((s, sr) => {
      const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.radiatorId)
      return s + (rad ? radOutput(rad, dt) * sr.quantity : 0)
    }, 0)
  }, 0)

  const spf = getSPF(flowTemp)
  const annualHeat = totalHeatLossW > 0 ? Math.round((totalHeatLossW / ((21 - designTempExt) * 1000)) * 2200 * 24) : 0
  const annualElec = annualHeat > 0 ? Math.round(annualHeat / spf) : 0
  const floors = Array.from(new Set(rooms.map(r => r.floor))).sort((a, b) => a - b)

  const heights = Array.from(new Set(ULTRAHEAT_RADIATORS.map(r => r.height_mm))).sort((a, b) => a - b)
  const types = Array.from(new Set(ULTRAHEAT_RADIATORS.map(r => r.type)))
  const filteredRads = ULTRAHEAT_RADIATORS.filter(r =>
    (!radFilter.height || r.height_mm === parseInt(radFilter.height)) &&
    (!radFilter.type || r.type === radFilter.type)
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-900">Emitter Specification</div>
              {customer && <div className="text-xs text-gray-400 truncate">{customer.first_name} {customer.last_name} · {customer.address_line1}</div>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={`/jobs/${jobId}/design`} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg">← Floor plan</a>
            <a href={`/jobs/${jobId}/design/heatpump`} className="text-xs text-emerald-700 border border-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-50">Heat pump →</a>
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button onClick={() => save()} disabled={saving}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total heat loss', value: totalHeatLossW > 0 ? `${(totalHeatLossW/1000).toFixed(1)} kW` : '—', warn: false },
            { label: 'Emitter output', value: totalRadOutput > 0 ? `${(totalRadOutput/1000).toFixed(1)} kW` : '—', warn: totalRadOutput > 0 && totalRadOutput < totalHeatLossW * 0.95 },
            { label: 'Flow / return', value: `${flowTemp}°C / ${returnTemp}°C`, warn: false },
            { label: 'Est. SPF', value: spf.toFixed(1), warn: false },
            { label: 'Annual electricity', value: annualElec > 0 ? `${annualElec.toLocaleString()} kWh` : '—', warn: false },
          ].map(s => (
            <div key={s.label} className={`${s.warn ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'} border rounded-xl p-3`}>
              <div className="text-xs text-gray-400">{s.label}</div>
              <div className={`text-base font-bold mt-0.5 ${s.warn ? 'text-amber-700' : 'text-gray-900'}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Flow temp slider */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-xs font-semibold text-gray-700 mb-3">System temperatures — affects all emitter output calculations</div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500">Flow temp</label>
              <input type="range" min={35} max={70} step={5} value={flowTemp}
                onChange={e => setFlowTemp(parseInt(e.target.value))} className="w-36 accent-emerald-600"/>
              <span className="text-sm font-bold text-gray-900 w-10">{flowTemp}°C</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500">Return temp</label>
              <input type="range" min={25} max={60} step={5} value={returnTemp}
                onChange={e => setReturnTemp(parseInt(e.target.value))} className="w-36 accent-emerald-600"/>
              <span className="text-sm font-bold text-gray-900 w-10">{returnTemp}°C</span>
            </div>
            <div className="text-xs text-gray-400">
              SPF {spf.toFixed(1)} · {annualHeat.toLocaleString()} kWh heat/yr · {annualElec.toLocaleString()} kWh elec/yr
            </div>
          </div>
        </div>

        {rooms.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
            <div className="text-2xl mb-2">📐</div>
            <div className="text-sm font-semibold text-amber-800">No rooms found</div>
            <div className="text-xs text-amber-700 mt-1 mb-3">Draw rooms on the floor plan and save before coming here.</div>
            <a href={`/jobs/${jobId}/design`} className="text-xs bg-emerald-700 text-white px-4 py-2 rounded-xl">Go to floor plan →</a>
          </div>
        )}

        {/* Rooms by floor */}
        {floors.map(floor => (
          <div key={floor}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">
              {getFloorName(floor)} · {rooms.filter(r => r.floor === floor).length} rooms
            </div>

            {rooms.filter(r => r.floor === floor).map(room => {
              const dt = calcDeltaT(flowTemp, returnTemp, roomTempC(room.roomType))
              const currentOutput = room.emitterType === 'radiator'
                ? room.selectedRadiators.reduce((s, sr) => {
                    const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.radiatorId)
                    return s + (rad ? radOutput(rad, dt) * sr.quantity : 0)
                  }, 0)
                : room.emitterType === 'ufh' ? room.heatLossW : 0 // UFH assumed adequate if selected
              const isAdequate = currentOutput >= room.heatLossW * 0.95
              const isExpanded = expandedRoom === room.roomId

              return (
                <div key={room.roomId} className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-2">
                  <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                    onClick={() => setExpandedRoom(isExpanded ? null : room.roomId)}>
                    <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${
                      room.heatLossW === 0 ? 'bg-gray-200' :
                      currentOutput === 0 ? 'bg-red-400' :
                      isAdequate ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{room.roomName}</span>
                        <span className="text-xs text-gray-400">{room.roomType}</span>
                        {room.emitterType === 'ufh' && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">♨ UFH</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400">Required <strong className="text-gray-700">{room.heatLossW.toLocaleString()}W</strong></span>
                        <span className="text-xs text-gray-400">Output <strong className={currentOutput === 0 ? 'text-red-500' : isAdequate ? 'text-emerald-600' : 'text-amber-600'}>{currentOutput.toLocaleString()}W</strong></span>
                        {currentOutput === 0 && room.heatLossW > 0 && <span className="text-xs text-red-500">⚠ No emitter</span>}
                        {isAdequate && currentOutput > 0 && <span className="text-xs text-emerald-600">✓ Adequate</span>}
                        {!isAdequate && currentOutput > 0 && <span className="text-xs text-amber-600">+{(room.heatLossW - currentOutput).toLocaleString()}W needed</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {(['radiator', 'ufh'] as const).map(t => (
                        <button key={t} onClick={() => updRoom(room.roomId, { emitterType: t })}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${room.emitterType === t ? 'bg-emerald-700 text-white border-emerald-700' : 'border-gray-200 text-gray-500 hover:border-emerald-300'}`}>
                          {t === 'radiator' ? '🔥 Rad' : '♨ UFH'}
                        </button>
                      ))}
                    </div>
                    <svg width="12" height="8" viewBox="0 0 12 8" className={`flex-shrink-0 text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none">
                      <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>

                  {isExpanded && room.emitterType === 'radiator' && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                      {room.selectedRadiators.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-gray-700 mb-2">Specified radiators</div>
                          <div className="space-y-1.5">
                            {room.selectedRadiators.map(sr => {
                              const rad = ULTRAHEAT_RADIATORS.find(r => r.id === sr.radiatorId)
                              if (!rad) return null
                              const out = radOutput(rad, dt) * sr.quantity
                              const ok = out >= room.heatLossW * 0.95
                              return (
                                <div key={sr.radiatorId} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-gray-900">{rad.type} — {rad.height_mm}×{rad.length_mm}mm · {rad.depth_mm}mm deep</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{radOutput(rad, dt).toLocaleString()}W × {sr.quantity} = <strong>{out.toLocaleString()}W</strong> at {flowTemp}°C flow</div>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={() => setRooms(prev => prev.map(r => r.roomId !== room.roomId ? r : { ...r, selectedRadiators: r.selectedRadiators.map(s => s.radiatorId !== sr.radiatorId ? s : { ...s, quantity: Math.max(1, s.quantity - 1) }) }))}
                                      className="w-6 h-6 rounded border border-gray-200 text-xs flex items-center justify-center hover:bg-gray-100">−</button>
                                    <span className="text-xs w-5 text-center font-bold">{sr.quantity}</span>
                                    <button onClick={() => setRooms(prev => prev.map(r => r.roomId !== room.roomId ? r : { ...r, selectedRadiators: r.selectedRadiators.map(s => s.radiatorId !== sr.radiatorId ? s : { ...s, quantity: s.quantity + 1 }) }))}
                                      className="w-6 h-6 rounded border border-gray-200 text-xs flex items-center justify-center hover:bg-gray-100">+</button>
                                    <button onClick={() => removeRadiator(room.roomId, sr.radiatorId)}
                                      className="w-6 h-6 rounded border border-red-100 text-red-400 hover:text-red-600 text-xs flex items-center justify-center ml-1">✕</button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-semibold text-gray-700">Add from catalogue <span className="text-gray-400 font-normal">({filteredRads.length} models)</span></div>
                          <div className="flex gap-2">
                            <select value={radFilter.height} onChange={e => setRadFilter(p => ({ ...p, height: e.target.value }))}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400">
                              <option value="">All heights</option>
                              {heights.map(h => <option key={h} value={h}>{h}mm</option>)}
                            </select>
                            <select value={radFilter.type} onChange={e => setRadFilter(p => ({ ...p, type: e.target.value }))}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400">
                              <option value="">All types</option>
                              {types.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl">
                          {filteredRads.map(rad => {
                            const out = radOutput(rad, dt)
                            const meetsReq = out >= room.heatLossW * 0.95
                            const alreadySelected = room.selectedRadiators.some(s => s.radiatorId === rad.id)
                            return (
                              <button key={rad.id} onClick={() => addRadiator(room.roomId, rad.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0 transition-colors ${alreadySelected ? 'bg-emerald-50' : ''}`}>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-medium text-gray-900">{rad.type}</span>
                                  <span className="text-xs text-gray-400 ml-1.5">{rad.height_mm}×{rad.length_mm}mm · {rad.depth_mm}mm</span>
                                </div>
                                <span className={`text-xs font-bold flex-shrink-0 ${meetsReq ? 'text-emerald-600' : 'text-gray-500'}`}>
                                  {out.toLocaleString()}W {meetsReq ? '✓' : ''}
                                </span>
                              </button>
                            )
                          })}
                          {filteredRads.length === 0 && (
                            <div className="px-3 py-6 text-xs text-gray-400 text-center">No radiators match the filter</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {isExpanded && room.emitterType === 'ufh' && (
                    <div className="border-t border-gray-100 px-4 py-4">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 mb-3">
                        UFH zone marked on floor plan. Specify pipe layout below.
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Pipe spacing</label>
                          <select className="w-full text-xs border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
                            value={room.ufhPipeSpacingMm}
                            onChange={e => updRoom(room.roomId, { ufhPipeSpacingMm: parseInt(e.target.value) })}>
                            <option value={100}>100mm — high output</option>
                            <option value={150}>150mm — medium</option>
                            <option value={200}>200mm — standard</option>
                            <option value={300}>300mm — low output</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Design output (W/m²)</label>
                          <input type="number" className="w-full text-xs border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
                            value={room.ufhOutputWm2}
                            onChange={e => updRoom(room.roomId, { ufhOutputWm2: parseInt(e.target.value) || 80 })}/>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        <div className="pt-2 pb-6">
          <button onClick={() => save(`/jobs/${jobId}/design/heatpump`)} disabled={saving}
            className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 text-white text-sm font-semibold py-3.5 rounded-2xl transition-colors">
            Save & continue to heat pump selection →
          </button>
        </div>
      </div>
    </div>
  )
}