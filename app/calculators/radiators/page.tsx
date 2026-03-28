'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

// U-values by construction type (W/m²K)
const U_VALUES: Record<string, Record<string, number>> = {
  wall: {
    'Solid brick (uninsulated)': 2.1,
    'Solid brick (insulated)': 0.45,
    'Cavity wall (uninsulated)': 1.6,
    'Cavity wall (insulated)': 0.35,
    'Timber frame (insulated)': 0.28,
    'Stone (uninsulated)': 1.7,
  },
  floor: {
    'Suspended timber (uninsulated)': 0.7,
    'Suspended timber (insulated)': 0.25,
    'Solid concrete (uninsulated)': 0.7,
    'Solid concrete (insulated)': 0.25,
  },
  ceiling: {
    'Flat roof (uninsulated)': 1.5,
    'Flat roof (insulated)': 0.18,
    'Pitched roof (uninsulated)': 2.3,
    'Pitched roof (insulated)': 0.16,
  },
  window: {
    'Single glazed': 5.6,
    'Double glazed (air)': 2.8,
    'Double glazed (argon)': 1.6,
    'Triple glazed': 0.8,
  },
  door: {
    'Solid timber': 3.0,
    'Hollow core': 2.0,
    'Insulated composite': 1.2,
    'Glazed door': 3.5,
  },
}

// Design temperatures
const DESIGN_TEMPS = { external: -3, internal: 21 } // UK default °C

// Radiator output correction factors (for different flow/return temps vs standard 70/50/20)
// Standard = 75/65/20 => DT50
function dtCorrection(flow: number, ret: number, room: number): number {
  const dtm = ((flow + ret) / 2) - room
  const dtStd = 50 // Standard deltaT
  return Math.pow(dtm / dtStd, 1.3)
}

type Element = { id: string; type: keyof typeof U_VALUES; construction: string; area: number }

export default function RadiatorCalculator() {
  const [room, setRoom] = useState({
    name: 'Living room',
    length: 5.0,
    width: 4.0,
    height: 2.4,
    targetTemp: 21,
    ach: 1.0, // air changes per hour
  })

  const [elements, setElements] = useState<Element[]>([
    { id: '1', type: 'wall', construction: 'Cavity wall (uninsulated)', area: 12 },
    { id: '2', type: 'window', construction: 'Double glazed (air)', area: 3.6 },
  ])

  const [flowTemp, setFlowTemp] = useState(55)
  const [returnTemp, setReturnTemp] = useState(45)
  const [extTemp, setExtTemp] = useState(-3)

  function addElement() {
    setElements(p => [...p, { id: Date.now().toString(), type: 'wall', construction: 'Cavity wall (uninsulated)', area: 0 }])
  }

  function updateElement(id: string, updates: Partial<Element>) {
    setElements(p => p.map(e => e.id === id ? { ...e, ...updates } : e))
  }

  function removeElement(id: string) {
    setElements(p => p.filter(e => e.id !== id))
  }

  const results = useMemo(() => {
    const deltaT = room.targetTemp - extTemp
    // Fabric heat loss
    const fabricLoss = elements.reduce((sum, el) => {
      const u = U_VALUES[el.type]?.[el.construction] || 1.0
      return sum + (u * el.area * deltaT)
    }, 0)
    // Ventilation heat loss: 0.33 * N * V * deltaT
    const volume = room.length * room.width * room.height
    const ventLoss = 0.33 * room.ach * volume * deltaT
    const totalW = fabricLoss + ventLoss
    // Apply flow/return temp correction
    const correction = dtCorrection(flowTemp, returnTemp, room.targetTemp)
    const requiredOutput = totalW / correction
    return {
      fabricLoss: Math.round(fabricLoss),
      ventLoss: Math.round(ventLoss),
      totalW: Math.round(totalW),
      correction: correction.toFixed(3),
      requiredOutput: Math.round(requiredOutput),
      volume: (volume).toFixed(1),
    }
  }, [room, elements, flowTemp, returnTemp, extTemp])

  const inp = "bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors w-full"
  const lbl = "block text-xs font-medium text-gray-500 mb-1.5"

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <Link href="/calculators" className="text-gray-600 hover:text-gray-400 text-sm">← Calculators</Link>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-semibold text-white">Radiator sizing</span>
        <span className="text-xs text-gray-600 ml-2">BS EN 12831</span>
      </div>

      <div className="px-6 py-5 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Inputs */}
          <div className="lg:col-span-2 space-y-4">

            {/* Room dimensions */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-sm font-semibold text-white">Room details</div>
              <div>
                <label className={lbl}>Room name</label>
                <input className={inp} value={room.name} onChange={e => setRoom(p => ({ ...p, name: e.target.value }))}/>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Length (m)</label>
                  <input type="number" step="0.1" min="0" className={inp} value={room.length} onChange={e => setRoom(p => ({ ...p, length: parseFloat(e.target.value) || 0 }))}/>
                </div>
                <div>
                  <label className={lbl}>Width (m)</label>
                  <input type="number" step="0.1" min="0" className={inp} value={room.width} onChange={e => setRoom(p => ({ ...p, width: parseFloat(e.target.value) || 0 }))}/>
                </div>
                <div>
                  <label className={lbl}>Height (m)</label>
                  <input type="number" step="0.1" min="0" className={inp} value={room.height} onChange={e => setRoom(p => ({ ...p, height: parseFloat(e.target.value) || 0 }))}/>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Room temp (°C)</label>
                  <select className={inp} value={room.targetTemp} onChange={e => setRoom(p => ({ ...p, targetTemp: parseFloat(e.target.value) }))}>
                    <option value={18}>18°C — Bedroom</option>
                    <option value={21}>21°C — Living room</option>
                    <option value={22}>22°C — Bathroom</option>
                    <option value={18}>18°C — Hall / landing</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>External temp (°C)</label>
                  <select className={inp} value={extTemp} onChange={e => setExtTemp(parseFloat(e.target.value))}>
                    <option value={-3}>-3°C (UK default)</option>
                    <option value={-5}>-5°C (Northern UK)</option>
                    <option value={0}>0°C (Mild region)</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Air changes/hr</label>
                  <select className={inp} value={room.ach} onChange={e => setRoom(p => ({ ...p, ach: parseFloat(e.target.value) }))}>
                    <option value={0.5}>0.5 — Well sealed</option>
                    <option value={1.0}>1.0 — Average</option>
                    <option value={1.5}>1.5 — Draughty</option>
                    <option value={2.0}>2.0 — Very draughty</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Building elements */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-white">Building elements</div>
                <button onClick={addElement} className="text-xs text-amber-400 hover:text-amber-300">+ Add element</button>
              </div>
              <div className="space-y-3">
                {elements.map(el => (
                  <div key={el.id} className="grid grid-cols-7 gap-2 items-end">
                    <div className="col-span-2">
                      <label className={lbl}>Type</label>
                      <select className={inp} value={el.type}
                        onChange={e => {
                          const type = e.target.value as keyof typeof U_VALUES
                          const firstOption = Object.keys(U_VALUES[type])[0]
                          updateElement(el.id, { type, construction: firstOption })
                        }}>
                        <option value="wall">Wall</option>
                        <option value="floor">Floor</option>
                        <option value="ceiling">Ceiling/roof</option>
                        <option value="window">Window</option>
                        <option value="door">Door</option>
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className={lbl}>Construction</label>
                      <select className={inp} value={el.construction}
                        onChange={e => updateElement(el.id, { construction: e.target.value })}>
                        {Object.keys(U_VALUES[el.type] || {}).map(k => <option key={k}>{k}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Area (m²)</label>
                      <input type="number" step="0.1" min="0" className={inp} value={el.area}
                        onChange={e => updateElement(el.id, { area: parseFloat(e.target.value) || 0 })}/>
                    </div>
                    <div className="flex items-end pb-0.5">
                      <button onClick={() => removeElement(el.id)} className="text-gray-600 hover:text-red-400 text-lg w-full text-center">×</button>
                    </div>
                  </div>
                ))}
              </div>
              {/* U-value summary */}
              <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-2 gap-2">
                {elements.map(el => {
                  const u = U_VALUES[el.type]?.[el.construction] || 0
                  return (
                    <div key={el.id} className="flex justify-between text-xs">
                      <span className="text-gray-500">{el.construction.split('(')[0].trim()}</span>
                      <span className="text-gray-400">U = {u} W/m²K</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* System temperatures */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-white mb-4">System temperatures</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Flow temp (°C)</label>
                  <input type="range" min="35" max="80" step="1" value={flowTemp}
                    onChange={e => setFlowTemp(parseInt(e.target.value))}
                    className="w-full mb-1"/>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>35°C</span>
                    <span className="text-amber-400 font-semibold">{flowTemp}°C</span>
                    <span>80°C</span>
                  </div>
                </div>
                <div>
                  <label className={lbl}>Return temp (°C)</label>
                  <input type="range" min="25" max="70" step="1" value={returnTemp}
                    onChange={e => setReturnTemp(parseInt(e.target.value))}
                    className="w-full mb-1"/>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>25°C</span>
                    <span className="text-amber-400 font-semibold">{returnTemp}°C</span>
                    <span>70°C</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-600">
                Mean water temp: {((flowTemp + returnTemp) / 2).toFixed(1)}°C · ΔT to room: {(((flowTemp + returnTemp) / 2) - room.targetTemp).toFixed(1)}K · Correction factor: {results.correction}
              </div>
            </div>
          </div>

          {/* Results */}
          <div>
            <div className="bg-gray-900 border border-orange-700/30 rounded-2xl p-5 sticky top-20">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">Results — {room.name}</div>

              <div className="space-y-3 mb-5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Room volume</span>
                  <span className="text-gray-200">{results.volume} m³</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Fabric loss</span>
                  <span className="text-gray-200">{results.fabricLoss} W</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Ventilation loss</span>
                  <span className="text-gray-200">{results.ventLoss} W</span>
                </div>
                <div className="border-t border-gray-700 pt-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Heat loss at design temps</span>
                    <span className="text-gray-200 font-semibold">{results.totalW} W</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>At {flowTemp}/{returnTemp}°C flow/return</span>
                    <span>×{results.correction}</span>
                  </div>
                </div>
              </div>

              <div className="bg-orange-900/30 border border-orange-700/30 rounded-xl p-4 text-center">
                <div className="text-xs text-orange-400/70 mb-1">Required radiator output</div>
                <div className="text-4xl font-bold text-orange-400">{results.requiredOutput}</div>
                <div className="text-sm text-orange-400/70">watts</div>
                <div className="text-xs text-gray-600 mt-2">{(results.requiredOutput / 1000).toFixed(2)} kW</div>
              </div>

              <div className="mt-4 space-y-2 text-xs text-gray-600">
                <div>• Add 10-15% to required output for radiator selection</div>
                <div>• Lower flow temps need larger radiators</div>
                <div>• Heat pump systems: use 45/35°C or 55/45°C</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}