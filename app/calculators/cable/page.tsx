'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

// Cable current capacity (It) at 30°C ambient, clipped direct
// CSA: 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50
const CABLE_DATA: Record<string, { csa: number; it_clipped: number; it_conduit: number; it_buried: number; r1r2: number }[]> = {
  'Twin & CPC (6242Y)': [
    { csa: 1.0,  it_clipped: 15,   it_conduit: 13.5, it_buried: 0,    r1r2: 36.2 },
    { csa: 1.5,  it_clipped: 20,   it_conduit: 17.5, it_buried: 26,   r1r2: 24.2 },
    { csa: 2.5,  it_clipped: 27,   it_conduit: 24,   it_buried: 34,   r1r2: 14.5 },
    { csa: 4.0,  it_clipped: 37,   it_conduit: 32,   it_buried: 44,   r1r2: 9.22 },
    { csa: 6.0,  it_clipped: 47,   it_conduit: 41,   it_buried: 56,   r1r2: 6.14 },
    { csa: 10.0, it_clipped: 65,   it_conduit: 57,   it_buried: 73,   r1r2: 3.66 },
    { csa: 16.0, it_clipped: 87,   it_conduit: 76,   it_buried: 95,   r1r2: 2.30 },
    { csa: 25.0, it_clipped: 114,  it_conduit: 96,   it_buried: 121,  r1r2: 1.47 },
  ],
  'SWA (Armoured)': [
    { csa: 1.5,  it_clipped: 24,   it_conduit: 21,   it_buried: 28,   r1r2: 24.2 },
    { csa: 2.5,  it_clipped: 32,   it_conduit: 28,   it_buried: 36,   r1r2: 14.5 },
    { csa: 4.0,  it_clipped: 42,   it_conduit: 37,   it_buried: 48,   r1r2: 9.22 },
    { csa: 6.0,  it_clipped: 54,   it_conduit: 47,   it_buried: 60,   r1r2: 6.14 },
    { csa: 10.0, it_clipped: 73,   it_conduit: 64,   it_buried: 80,   r1r2: 3.66 },
    { csa: 16.0, it_clipped: 98,   it_conduit: 85,   it_buried: 106,  r1r2: 2.30 },
    { csa: 25.0, it_clipped: 129,  it_conduit: 110,  it_buried: 138,  r1r2: 1.47 },
    { csa: 35.0, it_clipped: 159,  it_conduit: 134,  it_buried: 168,  r1r2: 1.05 },
    { csa: 50.0, it_clipped: 188,  it_conduit: 156,  it_buried: 198,  r1r2: 0.74 },
  ],
}

const INSTALLATION_METHODS = [
  { label: 'Clipped direct / surface', key: 'it_clipped' },
  { label: 'In conduit / trunking', key: 'it_conduit' },
  { label: 'Buried in ground', key: 'it_buried' },
]

// Derating factors for ambient temp (Table 4C1)
const AMBIENT_FACTORS: Record<number, number> = {
  25: 1.06, 30: 1.00, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71
}

// Grouping derating (Table 4B1 — cables touching)
const GROUPING_FACTORS: Record<number, number> = {
  1: 1.00, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60, 6: 0.57
}

export default function CableCalculator() {
  const [load, setLoad] = useState(3000) // watts
  const [voltage, setVoltage] = useState(230)
  const [pf, setPf] = useState(1.0)
  const [length, setLength] = useState(20)
  const [cableType, setCableType] = useState('Twin & CPC (6242Y)')
  const [method, setMethod] = useState('it_clipped')
  const [ambientTemp, setAmbientTemp] = useState(30)
  const [grouping, setGrouping] = useState(1)
  const [thermalInsulation, setThermalInsulation] = useState(false)
  const [protectionType, setProtectionType] = useState('mcb_b')

  // Protection ratings
  const PROTECTION: Record<string, { label: string; rating: number }[]> = {
    mcb_b: [
      { label: '6A Type B', rating: 6 },
      { label: '10A Type B', rating: 10 },
      { label: '16A Type B', rating: 16 },
      { label: '20A Type B', rating: 20 },
      { label: '25A Type B', rating: 25 },
      { label: '32A Type B', rating: 32 },
      { label: '40A Type B', rating: 40 },
      { label: '50A Type B', rating: 50 },
      { label: '63A Type B', rating: 63 },
    ],
  }
  const [protection, setProtection] = useState(32)

  const results = useMemo(() => {
    const ib = load / (voltage * pf) // Design current
    // Correction factors
    const ca = AMBIENT_FACTORS[ambientTemp] || 1.0
    const cg = GROUPING_FACTORS[Math.min(grouping, 6)] || 0.57
    const ci = thermalInsulation ? 0.5 : 1.0
    const combinedFactor = ca * cg * ci
    // Required It
    const itRequired = protection / combinedFactor
    // Find minimum cable
    const cables = CABLE_DATA[cableType] || []
    const itKey = method as 'it_clipped' | 'it_conduit' | 'it_buried'
    const suitable = cables.filter(c => c[itKey] >= itRequired && c[itKey] >= ib)
    const selected = suitable[0]
    // Voltage drop calculation
    let vdrop = 0
    let vdropPct = 0
    if (selected) {
      // mV/A/m from r1r2 — simplified: VD = (r1r2/1000) * Ib * L * 2 (for single phase)
      vdrop = (selected.r1r2 / 1000) * ib * length * 2
      vdropPct = (vdrop / voltage) * 100
    }
    return {
      ib: ib.toFixed(2),
      itRequired: itRequired.toFixed(1),
      ca, cg, ci,
      combinedFactor: combinedFactor.toFixed(3),
      selected,
      vdrop: vdrop.toFixed(2),
      vdropPct: vdropPct.toFixed(2),
      vdropOk: vdropPct <= 3.0,
      allSuitable: suitable,
    }
  }, [load, voltage, pf, length, cableType, method, ambientTemp, grouping, thermalInsulation, protection])

  const inp = "bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors w-full"
  const lbl = "block text-xs font-medium text-gray-500 mb-1.5"

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <Link href="/calculators" className="text-gray-600 hover:text-gray-400 text-sm">← Calculators</Link>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-semibold text-white">Cable sizing</span>
        <span className="text-xs text-gray-600 ml-2">BS 7671:2018+A2:2022</span>
      </div>

      <div className="px-6 py-5 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">

            {/* Load details */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-sm font-semibold text-white">Circuit details</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Load (watts)</label>
                  <input type="number" min="0" step="100" className={inp} value={load} onChange={e => setLoad(parseFloat(e.target.value) || 0)}/>
                </div>
                <div>
                  <label className={lbl}>Supply voltage (V)</label>
                  <select className={inp} value={voltage} onChange={e => setVoltage(parseInt(e.target.value))}>
                    <option value={230}>230V (Single phase)</option>
                    <option value={400}>400V (Three phase)</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Power factor</label>
                  <select className={inp} value={pf} onChange={e => setPf(parseFloat(e.target.value))}>
                    <option value={1.0}>1.0 — Resistive (heaters)</option>
                    <option value={0.95}>0.95 — LED lighting</option>
                    <option value={0.85}>0.85 — Motors</option>
                    <option value={0.8}>0.8 — General</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Circuit length (m)</label>
                  <input type="number" min="1" step="1" className={inp} value={length} onChange={e => setLength(parseFloat(e.target.value) || 1)}/>
                </div>
              </div>
              <div>
                <label className={lbl}>Protection device</label>
                <div className="grid grid-cols-3 gap-2">
                  {[6, 10, 16, 20, 25, 32, 40, 50, 63].map(r => (
                    <button key={r} onClick={() => setProtection(r)}
                      className={`py-2 rounded-xl border text-sm font-medium transition-colors ${protection === r ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                      {r}A
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Installation */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-sm font-semibold text-white">Installation conditions</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Cable type</label>
                  <select className={inp} value={cableType} onChange={e => setCableType(e.target.value)}>
                    {Object.keys(CABLE_DATA).map(k => <option key={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Installation method</label>
                  <select className={inp} value={method} onChange={e => setMethod(e.target.value)}>
                    {INSTALLATION_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Ambient temperature</label>
                  <select className={inp} value={ambientTemp} onChange={e => setAmbientTemp(parseInt(e.target.value))}>
                    {[25, 30, 35, 40, 45, 50].map(t => <option key={t} value={t}>{t}°C {t === 30 ? '(standard)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Cables grouped</label>
                  <select className={inp} value={grouping} onChange={e => setGrouping(parseInt(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} cable{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setThermalInsulation(p => !p)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${thermalInsulation ? 'bg-amber-500' : 'bg-gray-700'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${thermalInsulation ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                </button>
                <span className="text-sm text-gray-300">Surrounded by thermal insulation (×0.5)</span>
              </div>
            </div>
          </div>

          {/* Results */}
          <div>
            <div className="bg-gray-900 border border-yellow-700/30 rounded-2xl p-5 sticky top-20 space-y-4">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Results</div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Design current (Ib)</span><span className="text-gray-200">{results.ib} A</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Correction factors</span><span className="text-gray-200">{results.combinedFactor}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Required It</span><span className="text-gray-200">{results.itRequired} A</span></div>
              </div>

              {results.selected ? (
                <>
                  <div className="bg-yellow-900/30 border border-yellow-700/30 rounded-xl p-4 text-center">
                    <div className="text-xs text-yellow-400/70 mb-1">Minimum cable size</div>
                    <div className="text-4xl font-bold text-yellow-400">{results.selected.csa}</div>
                    <div className="text-sm text-yellow-400/70">mm²</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Capacity: {(results.selected as any)[method]}A
                    </div>
                  </div>

                  <div className={`rounded-xl p-3 border text-sm ${results.vdropOk ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
                    <div className="flex justify-between mb-1">
                      <span className={results.vdropOk ? 'text-emerald-400' : 'text-red-400'}>Voltage drop</span>
                      <span className={results.vdropOk ? 'text-emerald-300' : 'text-red-300'}>{results.vdrop}V ({results.vdropPct}%)</span>
                    </div>
                    <div className="text-xs text-gray-600">{results.vdropOk ? '✓ Within 3% limit (BS 7671)' : '✗ Exceeds 3% limit — increase CSA'}</div>
                  </div>

                  {!results.vdropOk && results.allSuitable.length > 1 && (
                    <div className="text-xs text-gray-500">
                      Consider {results.allSuitable[1]?.csa}mm² to reduce voltage drop
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-center text-sm text-red-400">
                  No suitable cable found in table — check inputs or consult BS 7671
                </div>
              )}

              <div className="pt-2 border-t border-gray-800 space-y-1 text-xs text-gray-600">
                <div>Ca={results.ca} · Cg={results.cg} · Ci={results.ci}</div>
                <div>• Always verify with full BS 7671 calculation</div>
                <div>• Earth fault loop impedance must also be checked</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}