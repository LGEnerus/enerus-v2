'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

// ─── PIPE SIZING ─────────────────────────────────────────────────────────────

const PIPE_DATA = [
  { size: '8mm', id: 6,   max_flow_lmin: 1.2,  vel_ms: 0.8,  pd_m: 250 },
  { size: '10mm', id: 8,  max_flow_lmin: 2.5,  vel_ms: 0.8,  pd_m: 200 },
  { size: '15mm', id: 13, max_flow_lmin: 8.5,  vel_ms: 1.0,  pd_m: 150 },
  { size: '22mm', id: 20, max_flow_lmin: 22,   vel_ms: 1.0,  pd_m: 100 },
  { size: '28mm', id: 26, max_flow_lmin: 40,   vel_ms: 1.2,  pd_m: 75  },
  { size: '35mm', id: 32, max_flow_lmin: 65,   vel_ms: 1.2,  pd_m: 60  },
  { size: '42mm', id: 38, max_flow_lmin: 95,   vel_ms: 1.2,  pd_m: 50  },
  { size: '54mm', id: 50, max_flow_lmin: 160,  vel_ms: 1.5,  pd_m: 40  },
]

export default function PipeSizingCalculator() {
  const [heatLoad, setHeatLoad] = useState(5000) // W
  const [deltaT, setDeltaT] = useState(10) // °C flow/return diff
  const [maxVelocity, setMaxVelocity] = useState(1.0) // m/s
  const [pipeMaterial, setPipeMaterial] = useState<'copper' | 'plastic'>('copper')

  const results = useMemo(() => {
    // Flow rate: Q = P / (ρ × Cp × ΔT)
    // Water: ρ = 1000 kg/m³, Cp = 4186 J/kgK
    const flowRate_ls = heatLoad / (1000 * 4186 * deltaT) * 1000 // litres/second
    const flowRate_lmin = flowRate_ls * 60

    // Find minimum pipe size
    const suitable = PIPE_DATA.filter(p => p.max_flow_lmin >= flowRate_lmin)
    const selected = suitable[0]

    // Velocity in selected pipe
    let velocity = 0
    if (selected) {
      const area = Math.PI * Math.pow(selected.id / 2000, 2) // m²
      velocity = (flowRate_ls / 1000) / area
    }

    return {
      flowRate_lmin: flowRate_lmin.toFixed(2),
      flowRate_ls: flowRate_ls.toFixed(4),
      selected,
      velocity: velocity.toFixed(2),
      velocityOk: velocity <= maxVelocity,
      suitable,
    }
  }, [heatLoad, deltaT, maxVelocity])

  const inp = "bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors w-full"
  const lbl = "block text-xs font-medium text-gray-500 mb-1.5"

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <Link href="/calculators" className="text-gray-600 hover:text-gray-400 text-sm">← Calculators</Link>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-semibold text-white">Pipe sizing</span>
        <span className="text-xs text-gray-600 ml-2">CIBSE / BS EN 12828</span>
      </div>

      <div className="px-6 py-5 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-sm font-semibold text-white">Circuit details</div>
              <div>
                <label className={lbl}>Heat load (W)</label>
                <input type="number" step="100" min="0" className={inp} value={heatLoad} onChange={e => setHeatLoad(parseFloat(e.target.value) || 0)}/>
              </div>
              <div>
                <label className={lbl}>Flow/return temperature difference (ΔT °C)</label>
                <div className="flex gap-2">
                  {[5, 10, 15, 20].map(d => (
                    <button key={d} onClick={() => setDeltaT(d)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${deltaT === d ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                      {d}°C
                    </button>
                  ))}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Standard CH: 20°C · Heat pump: 5-10°C · Underfloor: 5°C
                </div>
              </div>
              <div>
                <label className={lbl}>Max velocity (m/s)</label>
                <div className="flex gap-2">
                  {[0.5, 0.75, 1.0, 1.5].map(v => (
                    <button key={v} onClick={() => setMaxVelocity(v)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${maxVelocity === v ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                      {v}m/s
                    </button>
                  ))}
                </div>
                <div className="text-xs text-gray-600 mt-1">CIBSE recommends ≤1m/s for residential CH</div>
              </div>
              <div>
                <label className={lbl}>Pipe material</label>
                <div className="flex gap-2">
                  {(['copper', 'plastic'] as const).map(m => (
                    <button key={m} onClick={() => setPipeMaterial(m)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium capitalize transition-colors ${pipeMaterial === m ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pipe selection table */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-600 uppercase tracking-wide">Pipe sizing reference</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-4 py-2.5 text-gray-600">Size</th>
                    <th className="text-right px-4 py-2.5 text-gray-600">Max flow (l/min)</th>
                    <th className="text-right px-4 py-2.5 text-gray-600">Max vel (m/s)</th>
                    <th className="text-right px-4 py-2.5 text-gray-600">Pressure drop (Pa/m)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {PIPE_DATA.map(p => {
                    const isSelected = results.selected?.size === p.size
                    return (
                      <tr key={p.size} className={isSelected ? 'bg-emerald-900/20' : ''}>
                        <td className={`px-4 py-2 font-medium ${isSelected ? 'text-emerald-400' : 'text-gray-300'}`}>
                          {p.size} {isSelected && '← selected'}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-400">{p.max_flow_lmin}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{p.vel_ms}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{p.pd_m}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="bg-gray-900 border border-emerald-700/30 rounded-2xl p-5 sticky top-20 space-y-4">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Results</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Flow rate</span><span className="text-gray-200">{results.flowRate_lmin} l/min</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Flow rate</span><span className="text-gray-200">{results.flowRate_ls} l/s</span></div>
              </div>

              {results.selected ? (
                <>
                  <div className="bg-emerald-900/30 border border-emerald-700/30 rounded-xl p-4 text-center">
                    <div className="text-xs text-emerald-400/70 mb-1">Minimum pipe size</div>
                    <div className="text-4xl font-bold text-emerald-400">{results.selected.size}</div>
                    <div className="text-xs text-gray-500 mt-1">{results.selected.id}mm bore</div>
                  </div>
                  <div className={`rounded-xl p-3 border text-sm ${results.velocityOk ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-amber-900/20 border-amber-700/30'}`}>
                    <div className="flex justify-between">
                      <span className={results.velocityOk ? 'text-emerald-400' : 'text-amber-400'}>Velocity</span>
                      <span className={results.velocityOk ? 'text-emerald-300' : 'text-amber-300'}>{results.velocity} m/s</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">{results.velocityOk ? '✓ Within limit' : '⚠ Consider next size up'}</div>
                  </div>
                </>
              ) : (
                <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-center text-sm text-red-400">Check inputs</div>
              )}

              <div className="text-xs text-gray-600 space-y-1">
                <div>• Size each circuit independently</div>
                <div>• Allow for fittings (add 20% equivalent length)</div>
                <div>• Check pump head against pressure drop</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}