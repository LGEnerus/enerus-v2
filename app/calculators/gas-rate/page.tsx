'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

// ─── GAS RATE ───────────────────────────────────────────────────────────────

export default function GasRateCalculator() {
  const [meterType, setMeterType] = useState<'metric' | 'imperial'>('metric')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [time, setTime] = useState(120) // seconds
  const [calorificValue, setCalorificValue] = useState(39.5) // MJ/m³ typical
  const [pressure, setPressure] = useState(21) // mbar

  const results = useMemo(() => {
    const s = parseFloat(start)
    const e = parseFloat(end)
    if (isNaN(s) || isNaN(e) || e <= s || time <= 0) return null

    let volumeM3 = e - s
    if (meterType === 'imperial') {
      // Convert ft³ to m³
      volumeM3 = volumeM3 * 0.0283168
    }

    // Correct for pressure (standard is 1013.25 mbar / 20°C)
    const pressureCorrection = (pressure + 1013.25) / 1013.25

    const volumeCorrected = volumeM3 * pressureCorrection

    // Flow rate in m³/hr
    const flowRateHr = (volumeCorrected / time) * 3600

    // Heat input in kW: Q = V * CV * correction / 3.6
    const heatInputKw = (flowRateHr * calorificValue) / 3.6

    // Gross vs Net (net is approx 90% of gross for natural gas)
    const heatInputNet = heatInputKw * 0.9

    return {
      volumeM3: volumeM3.toFixed(4),
      volumeCorrected: volumeCorrected.toFixed(4),
      flowRateHr: flowRateHr.toFixed(4),
      flowRateMin: (flowRateHr / 60).toFixed(4),
      heatInputGross: heatInputKw.toFixed(2),
      heatInputNet: heatInputNet.toFixed(2),
      timeMin: (time / 60).toFixed(1),
    }
  }, [start, end, time, meterType, calorificValue, pressure])

  const inp = "bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors w-full"
  const lbl = "block text-xs font-medium text-gray-500 mb-1.5"

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <Link href="/calculators" className="text-gray-600 hover:text-gray-400 text-sm">← Calculators</Link>
        <span className="text-gray-800">/</span>
        <span className="text-sm font-semibold text-white">Gas rate</span>
        <span className="text-xs text-gray-600 ml-2">IGE/UP/1B</span>
      </div>

      <div className="px-6 py-5 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-sm font-semibold text-white">Meter readings</div>
              <div className="flex gap-2">
                {(['metric', 'imperial'] as const).map(t => (
                  <button key={t} onClick={() => setMeterType(t)}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors capitalize ${meterType === t ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                    {t} ({t === 'metric' ? 'm³' : 'ft³'})
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Start reading ({meterType === 'metric' ? 'm³' : 'ft³'})</label>
                  <input type="number" step="0.001" className={inp} value={start} onChange={e => setStart(e.target.value)} placeholder="0.000"/>
                </div>
                <div>
                  <label className={lbl}>End reading ({meterType === 'metric' ? 'm³' : 'ft³'})</label>
                  <input type="number" step="0.001" className={inp} value={end} onChange={e => setEnd(e.target.value)} placeholder="0.000"/>
                </div>
              </div>
              <div>
                <label className={lbl}>Test time (seconds)</label>
                <div className="flex gap-2">
                  {[60, 120, 180, 300].map(t => (
                    <button key={t} onClick={() => setTime(t)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${time === t ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                      {t}s
                    </button>
                  ))}
                </div>
                <input type="number" min="10" step="1" className={`${inp} mt-2`} value={time} onChange={e => setTime(parseInt(e.target.value) || 60)}/>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="text-sm font-semibold text-white">Gas properties</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Calorific value (MJ/m³)</label>
                  <input type="number" step="0.1" className={inp} value={calorificValue} onChange={e => setCalorificValue(parseFloat(e.target.value) || 39.5)}/>
                  <div className="text-xs text-gray-600 mt-1">Natural gas: typically 38.5–40.5 MJ/m³</div>
                </div>
                <div>
                  <label className={lbl}>Working pressure (mbar)</label>
                  <select className={inp} value={pressure} onChange={e => setPressure(parseInt(e.target.value))}>
                    <option value={21}>21 mbar (standard domestic)</option>
                    <option value={25}>25 mbar</option>
                    <option value={30}>30 mbar</option>
                    <option value={37}>37 mbar (commercial)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="bg-gray-900 border border-blue-700/30 rounded-2xl p-5 sticky top-20 space-y-4">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Results</div>
              {!results ? (
                <div className="text-sm text-gray-600 text-center py-6">Enter meter readings to calculate</div>
              ) : (
                <>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Volume used</span><span className="text-gray-200">{results.volumeM3} m³</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Test duration</span><span className="text-gray-200">{results.timeMin} min</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Flow rate</span><span className="text-gray-200">{results.flowRateHr} m³/hr</span></div>
                  </div>

                  <div className="bg-blue-900/30 border border-blue-700/30 rounded-xl p-4 text-center">
                    <div className="text-xs text-blue-400/70 mb-1">Heat input (gross)</div>
                    <div className="text-4xl font-bold text-blue-400">{results.heatInputGross}</div>
                    <div className="text-sm text-blue-400/70">kW</div>
                    <div className="text-xs text-gray-500 mt-1">Net: {results.heatInputNet} kW</div>
                  </div>

                  <div className="text-xs text-gray-600 space-y-1">
                    <div>• Compare against appliance data plate rating</div>
                    <div>• Tolerance: ±2% of rated input</div>
                    <div>• Correct to dry gas at 15°C for official records</div>
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