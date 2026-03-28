'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

// ─── VENTILATION ─────────────────────────────────────────────────────────────

// Vent areas per Document J / BS 5440-2
const VENT_REQUIREMENTS = {
  'Open flued — natural draught': {
    description: 'Air for combustion direct to appliance',
    airSupply: (kw: number) => Math.max(6500, kw * 450), // mm² free area
    flueVent: 0, // no vent at flue level needed
    notes: 'Vent to outside; no high-level vent required',
  },
  'Open flued — room sealed': {
    description: 'Room-sealed appliance with open flue',
    airSupply: (kw: number) => 0,
    flueVent: 0,
    notes: 'Room-sealed — no permanent air vent required for combustion',
  },
  'Flueless — natural gas': {
    description: 'Flueless appliance, e.g. gas fire, cooker',
    airSupply: (kw: number) => kw * 1100, // mm² per kW
    flueVent: 0,
    notes: 'High-level vent also required: 1/2 of low-level area',
  },
}

// Grille free area factors
const GRILLE_FACTORS: Record<string, number> = {
  'Hit-and-miss': 1.0,
  'Fixed louvre (single)': 0.5,
  'Fixed louvre (double)': 0.25,
  'Brick air brick': 0.5,
  'Telescopic duct': 0.9,
}

export default function VentilationCalculator() {
  const [appType, setAppType] = useState<keyof typeof VENT_REQUIREMENTS>('Open flued — natural draught')
  const [ratedInput, setRatedInput] = useState(20) // kW
  const [grille, setGrille] = useState('Hit-and-miss')
  const [extraAppliances, setExtraAppliances] = useState(0)

  const results = useMemo(() => {
    const req = VENT_REQUIREMENTS[appType]
    const totalKw = ratedInput + extraAppliances
    const freeAreaRequired = req.airSupply(totalKw)
    const factor = GRILLE_FACTORS[grille] || 1.0
    const grilleSizeRequired = freeAreaRequired / factor

    // Convert to equivalent circular duct diameter
    const diameter = Math.sqrt(4 * freeAreaRequired / Math.PI)

    // Brick air brick equivalent (215x65mm = ~6200mm² free area typical)
    const airBricksRequired = Math.ceil(freeAreaRequired / 6200)

    return {
      freeAreaRequired: Math.round(freeAreaRequired),
      grilleSizeRequired: Math.round(grilleSizeRequired),
      diameter: Math.round(diameter),
      airBricksRequired,
      highLevelArea: appType.includes('Flueless') ? Math.round(freeAreaRequired / 2) : 0,
    }
  }, [appType, ratedInput, grille, extraAppliances])

  const inp = "bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors w-full"
  const lbl = "block text-xs font-medium text-gray-500 mb-1.5"

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <Link href="/calculators" className="text-gray-600 hover:text-gray-400 text-sm">← Calculators</Link>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-semibold text-white">Ventilation</span>
        <span className="text-xs text-gray-600 ml-2">BS 5440-2 / Doc J</span>
      </div>

      <div className="px-6 py-5 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-sm font-semibold text-white">Appliance details</div>
              <div>
                <label className={lbl}>Appliance type</label>
                {(Object.keys(VENT_REQUIREMENTS) as (keyof typeof VENT_REQUIREMENTS)[]).map(type => (
                  <button key={type} onClick={() => setAppType(type)}
                    className={`w-full text-left px-4 py-3 rounded-xl border mb-2 transition-colors ${appType === type ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 hover:border-gray-500'}`}>
                    <div className={`text-sm font-medium ${appType === type ? 'text-purple-300' : 'text-gray-300'}`}>{type}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{VENT_REQUIREMENTS[type].description}</div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Rated heat input (kW)</label>
                  <input type="number" step="0.5" min="0" className={inp} value={ratedInput} onChange={e => setRatedInput(parseFloat(e.target.value) || 0)}/>
                </div>
                <div>
                  <label className={lbl}>Additional appliances (kW)</label>
                  <input type="number" step="0.5" min="0" className={inp} value={extraAppliances} onChange={e => setExtraAppliances(parseFloat(e.target.value) || 0)}/>
                  <div className="text-xs text-gray-600 mt-1">Total combined input for shared ventilation</div>
                </div>
              </div>
              <div>
                <label className={lbl}>Grille / vent type</label>
                <select className={inp} value={grille} onChange={e => setGrille(e.target.value)}>
                  {Object.keys(GRILLE_FACTORS).map(g => <option key={g}>{g}</option>)}
                </select>
                <div className="text-xs text-gray-600 mt-1">Free area factor: {GRILLE_FACTORS[grille]}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="bg-gray-900 border border-purple-700/30 rounded-2xl p-5 sticky top-20 space-y-4">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Required ventilation</div>

              {VENT_REQUIREMENTS[appType].airSupply(ratedInput) === 0 ? (
                <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4 text-center">
                  <div className="text-sm text-emerald-400 font-medium">No permanent air vent required</div>
                  <div className="text-xs text-gray-500 mt-1">{VENT_REQUIREMENTS[appType].notes}</div>
                </div>
              ) : (
                <>
                  <div className="bg-purple-900/30 border border-purple-700/30 rounded-xl p-4 text-center">
                    <div className="text-xs text-purple-400/70 mb-1">Free area required</div>
                    <div className="text-4xl font-bold text-purple-400">{results.freeAreaRequired.toLocaleString()}</div>
                    <div className="text-sm text-purple-400/70">mm²</div>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="bg-gray-800 rounded-xl p-3">
                      <div className="text-xs text-gray-500 mb-2">With {grille}</div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Grille size needed</span>
                        <span className="text-gray-200 font-semibold">{results.grilleSizeRequired.toLocaleString()} mm²</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-gray-400">Equiv. duct diameter</span>
                        <span className="text-gray-200">{results.diameter} mm</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-gray-400">Standard air bricks</span>
                        <span className="text-gray-200">{results.airBricksRequired}</span>
                      </div>
                    </div>

                    {results.highLevelArea > 0 && (
                      <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3">
                        <div className="text-xs text-amber-400 font-medium mb-1">High-level vent also required</div>
                        <div className="text-sm text-gray-200">{results.highLevelArea.toLocaleString()} mm² free area</div>
                        <div className="text-xs text-gray-500 mt-0.5">Located at high level, not more than 450mm from ceiling</div>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-gray-600 space-y-1">
                    <div>• Low-level vent: max 450mm above floor</div>
                    <div>• Must not be closeable or fitted with a draught excluder</div>
                    <div>• Reference: BS 5440-2:2000 Table 2</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}