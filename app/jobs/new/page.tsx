'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Step = 1 | 2 | 3 | 4

type CustomerData = {
  first_name: string
  last_name: string
  email: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  postcode: string
}

type EpcData = {
  lmk_key: string
  address1: string
  address2: string
  postcode: string
  property_type: string
  built_form: string
  inspection_date: string
  current_energy_rating: string
  potential_energy_rating: string
  total_floor_area: string
  construction_age_band: string
  main_fuel: string
  walls_description: string
  roof_description: string
  windows_description: string
  floor_description: string
  hot_water_description: string
  mainheat_description: string
  lighting_description: string
  energy_consumption_current: string
  energy_cost_current: string
  co2_emissions_current: string
  number_habitable_rooms: string
  low_energy_lighting: string
}

type HeatLoss = {
  design_load_w: number
  recommended_kw: number
  fabric_loss_w: number
  ventilation_loss_w: number
  dhw_demand_w: number
  annual_kwh: number
  annual_cost_ashp: number
  annual_cost_gas: number
  annual_saving: number
  cop_estimate: number
}

const emptyCustomer: CustomerData = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  postcode: '',
}

function calcHeatLoss(epc: EpcData): HeatLoss {
  const area = parseFloat(epc.total_floor_area) || 80
  const era = epc.construction_age_band || ''

  let uWall = 0.45, uRoof = 0.25, uFloor = 0.35, uWindow = 1.8
  if (era.includes('2000') || era.includes('2007') || era.includes('2012')) {
    uWall = 0.28; uRoof = 0.16; uFloor = 0.22; uWindow = 1.4
  } else if (era.includes('1991') || era.includes('1996')) {
    uWall = 0.35; uRoof = 0.20; uFloor = 0.25; uWindow = 1.6
  } else if (era.includes('1976') || era.includes('1983')) {
    uWall = 0.60; uRoof = 0.35; uFloor = 0.45; uWindow = 2.8
  } else if (era.includes('1967') || era.includes('1975')) {
    uWall = 0.90; uRoof = 0.55; uFloor = 0.55; uWindow = 3.1
  } else if (era.includes('before') || era.includes('1929') || era.includes('1949')) {
    uWall = 1.5; uRoof = 0.8; uFloor = 0.7; uWindow = 4.8
  }

  const deltaT = 24
  const wallArea = area * 1.8
  const roofArea = area * 0.9
  const floorArea = area
  const windowArea = area * 0.22
  const doorArea = area * 0.04

  const fabricLoss = Math.round(
    (uWall * wallArea + uRoof * roofArea + uFloor * floorArea +
     uWindow * windowArea + 1.0 * doorArea) * deltaT
  )
  const ventLoss = Math.round(area * 2.4 * 0.5 * 0.33 * deltaT)
  const dhwDemand = Math.round(area * 8.5)
  const totalLoad = fabricLoss + ventLoss + dhwDemand
  const recommendedKw = Math.ceil(totalLoad / 1000)
  const cop = 3.5
  const annualKwh = area * 90
  const annualCostAshp = Math.round((annualKwh / cop) * 0.28)
  const annualCostGas = Math.round(annualKwh * 0.07)
  const annualSaving = annualCostGas - annualCostAshp

  return {
    design_load_w: totalLoad,
    recommended_kw: recommendedKw,
    fabric_loss_w: fabricLoss,
    ventilation_loss_w: ventLoss,
    dhw_demand_w: dhwDemand,
    annual_kwh: annualKwh,
    annual_cost_ashp: annualCostAshp,
    annual_cost_gas: annualCostGas,
    annual_saving: annualSaving,
    cop_estimate: cop,
  }
}

function checkBusEligibility(epc: EpcData): { eligible: boolean; reason: string; grant: number } {
  const rating = epc.current_energy_rating?.toUpperCase()
  const fuel = epc.main_fuel?.toLowerCase() || ''
  const badRatings = ['D', 'E', 'F', 'G']
  const fossilFuels = ['gas', 'oil', 'lpg', 'coal', 'solid']
  const ratingOk = badRatings.includes(rating)
  const fuelOk = fossilFuels.some(f => fuel.includes(f))

  if (ratingOk && fuelOk) {
    return { eligible: true, reason: `EPC ${rating} rating with ${epc.main_fuel} heating qualifies`, grant: 7500 }
  }
  if (!ratingOk) {
    return { eligible: false, reason: `EPC ${rating} rating — must be D or below for BUS`, grant: 0 }
  }
  return { eligible: false, reason: `Current fuel type (${epc.main_fuel}) may not qualify for BUS`, grant: 0 }
}

export default function NewJobPage() {
  const [step, setStep] = useState<Step>(1)
  const [customer, setCustomer] = useState<CustomerData>(emptyCustomer)
  const [postcodeSearch, setPostcodeSearch] = useState('')
  const [epcResults, setEpcResults] = useState<EpcData[]>([])
  const [selectedEpc, setSelectedEpc] = useState<EpcData | null>(null)
  const [heatLoss, setHeatLoss] = useState<HeatLoss | null>(null)
  const [busResult, setBusResult] = useState<{ eligible: boolean; reason: string; grant: number } | null>(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateCustomer(field: keyof CustomerData, value: string) {
    setCustomer(prev => ({ ...prev, [field]: value }))
  }

  async function searchEpc() {
    if (!postcodeSearch) return
    setSearching(true)
    setError('')
    setEpcResults([])
    setSelectedEpc(null)
    try {
      const res = await fetch(`/api/epc?postcode=${encodeURIComponent(postcodeSearch)}`)
      const data = await res.json()
      if (data.rows && data.rows.length > 0) {
        setEpcResults(data.rows)
      } else {
        setError('No EPC records found for this postcode. You can still continue manually.')
      }
    } catch {
      setError('Could not connect to EPC database. You can continue manually.')
    }
    setSearching(false)
  }

  function selectEpc(epc: EpcData) {
    setSelectedEpc(epc)
    if (!customer.address_line1) {
      updateCustomer('address_line1', epc.address1 || '')
      updateCustomer('address_line2', epc.address2 || '')
      updateCustomer('postcode', epc.postcode || '')
    }
    const hl = calcHeatLoss(epc)
    const bus = checkBusEligibility(epc)
    setHeatLoss(hl)
    setBusResult(bus)
  }

  async function createJob() {
    setSaving(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }

      const { data: profile } = await (supabase as any)
        .from('installer_profiles')
        .select('id')
        .eq('user_id', session.user.id)
        .single()

      if (!profile) {
        setError('Installer profile not found. Please complete your profile first.')
        setSaving(false)
        return
      }

      const { data: newCustomer, error: custError } = await (supabase as any)
        .from('customers')
        .insert({
          installer_id: profile.id,
          first_name: customer.first_name,
          last_name: customer.last_name,
          email: customer.email,
          phone: customer.phone,
          address_line1: customer.address_line1,
          address_line2: customer.address_line2,
          city: customer.city,
          postcode: customer.postcode,
          property_type: selectedEpc?.property_type?.toLowerCase().replace(' ', '_') || null,
          floor_area_m2: selectedEpc ? parseFloat(selectedEpc.total_floor_area) : null,
          epc_rating: selectedEpc?.current_energy_rating || null,
          bus_eligible: busResult?.eligible || false,
          bus_checked_at: busResult ? new Date().toISOString() : null,
          notes: selectedEpc ? `EPC reference: ${selectedEpc.lmk_key}` : null,
        })
        .select()
        .single()

      if (custError || !newCustomer) {
        setError('Failed to create customer: ' + custError?.message)
        setSaving(false)
        return
      }

      const { data: newJob, error: jobError } = await (supabase as any)
        .from('jobs')
        .insert({
          installer_id: profile.id,
          customer_id: newCustomer.id,
          hp_type: 'ashp',
          bus_status: busResult?.eligible ? 'eligible' : 'not_started',
        })
        .select()
        .single()

      if (jobError || !newJob) {
        setError('Failed to create job: ' + jobError?.message)
        setSaving(false)
        return
      }

      if (heatLoss && selectedEpc) {
        await (supabase as any)
          .from('heat_loss_calculations')
          .insert({
            job_id: newJob.id,
            property_type: selectedEpc.property_type?.toLowerCase().replace(' ', '_') || null,
            build_era: selectedEpc.construction_age_band || null,
            floor_area_m2: parseFloat(selectedEpc.total_floor_area) || null,
            design_temp_c: -3,
            indoor_temp_c: 21,
            fabric_loss_w: heatLoss.fabric_loss_w,
            ventilation_loss_w: heatLoss.ventilation_loss_w,
            dhw_demand_w: heatLoss.dhw_demand_w,
            total_heat_loss_w: heatLoss.design_load_w,
            recommended_hp_kw: heatLoss.recommended_kw,
          })
      }

      await (supabase as any)
        .from('audit_log')
        .insert({
          job_id: newJob.id,
          user_id: session.user.id,
          action: 'job_created',
          stage: 'customer',
          entity_type: 'job',
          entity_id: newJob.id,
          description: `Job created for ${customer.first_name} ${customer.last_name}`,
        })

      window.location.replace('/dashboard')
    } catch (err) {
      setError('Something went wrong: ' + String(err))
      setSaving(false)
    }
  }

  const inputClass = "w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
              <path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Enerus Plus</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">MCS Umbrella</div>
          </div>
        </div>
        <a href="/dashboard" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Dashboard</a>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Step indicator */}
        <div className="mb-8">
          <div className="flex items-center gap-0 mb-3">
            {[
              { n: 1, label: 'Customer' },
              { n: 2, label: 'EPC lookup' },
              { n: 3, label: 'Heat loss & BUS' },
              { n: 4, label: 'Confirm' },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    step > s.n ? 'bg-emerald-700 text-white' :
                    step === s.n ? 'bg-emerald-700 text-white' :
                    'bg-gray-200 text-gray-400'
                  }`}>
                    {step > s.n ? '✓' : s.n}
                  </div>
                  <div className={`text-xs mt-1 ${step >= s.n ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>
                    {s.label}
                  </div>
                </div>
                {i < 3 && <div className={`h-0.5 flex-1 mb-4 ${step > s.n ? 'bg-emerald-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* STEP 1 — Customer details */}
        {step === 1 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-medium text-gray-900 mb-5">Customer details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">First name *</label>
                  <input type="text" value={customer.first_name} onChange={e => updateCustomer('first_name', e.target.value)} placeholder="James" className={inputClass}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Last name *</label>
                  <input type="text" value={customer.last_name} onChange={e => updateCustomer('last_name', e.target.value)} placeholder="Thornton" className={inputClass}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                  <input type="email" value={customer.email} onChange={e => updateCustomer('email', e.target.value)} placeholder="james@example.com" className={inputClass}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone *</label>
                  <input type="tel" value={customer.phone} onChange={e => updateCustomer('phone', e.target.value)} placeholder="07700 900 000" className={inputClass}/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Address line 1 *</label>
                <input type="text" value={customer.address_line1} onChange={e => updateCustomer('address_line1', e.target.value)} placeholder="14 Oak Avenue" className={inputClass}/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Address line 2</label>
                <input type="text" value={customer.address_line2} onChange={e => updateCustomer('address_line2', e.target.value)} placeholder="Optional" className={inputClass}/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">City *</label>
                  <input type="text" value={customer.city} onChange={e => updateCustomer('city', e.target.value)} placeholder="Manchester" className={inputClass}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Postcode *</label>
                  <input type="text" value={customer.postcode} onChange={e => { updateCustomer('postcode', e.target.value); setPostcodeSearch(e.target.value) }} placeholder="M14 7AZ" className={inputClass}/>
                </div>
              </div>
            </div>
            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  if (!customer.first_name || !customer.last_name || !customer.phone || !customer.postcode) {
                    setError('Please fill in all required fields')
                    return
                  }
                  setError('')
                  setPostcodeSearch(customer.postcode)
                  setStep(2)
                }}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                Next: EPC lookup →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — EPC lookup */}
        {step === 2 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-medium text-gray-900 mb-1">EPC lookup</h2>
            <p className="text-xs text-gray-500 mb-5">Search the national EPC register to pull property data automatically</p>
            <div className="flex gap-3 mb-5">
              <input
                type="text"
                value={postcodeSearch}
                onChange={e => setPostcodeSearch(e.target.value)}
                placeholder="Enter postcode"
                className={`${inputClass} flex-1`}
                onKeyDown={e => e.key === 'Enter' && searchEpc()}
              />
              <button
                onClick={searchEpc}
                disabled={searching}
                className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {searching ? 'Searching...' : 'Search EPC'}
              </button>
            </div>
            {error && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2.5 mb-4">
                {error}
              </div>
            )}
            {epcResults.length > 0 && (
              <div className="space-y-2 mb-5 max-h-72 overflow-y-auto">
                <div className="text-xs font-medium text-gray-500 mb-2">{epcResults.length} properties found — select the correct one:</div>
                {epcResults.map((epc, i) => (
                  <button
                    key={i}
                    onClick={() => selectEpc(epc)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedEpc?.lmk_key === epc.lmk_key
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">{epc.address1}{epc.address2 ? `, ${epc.address2}` : ''}</div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-gray-500">{epc.property_type}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">EPC {epc.current_energy_rating}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{epc.total_floor_area}m²</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{epc.inspection_date}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedEpc && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-5">
                <div className="text-xs font-medium text-emerald-800 mb-1">Selected property</div>
                <div className="text-xs text-emerald-700">{selectedEpc.address1}, {selectedEpc.postcode}</div>
                <div className="text-xs text-emerald-600 mt-0.5">EPC ref: {selectedEpc.lmk_key?.slice(0, 20)}...</div>
              </div>
            )}
            <div className="flex justify-between mt-4">
              <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Back</button>
              <button
                onClick={() => setStep(3)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                {selectedEpc ? 'Next: Heat loss estimate →' : 'Skip & continue →'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Heat loss & BUS */}
        {step === 3 && (
          <div className="space-y-4">
            {busResult && (
              <div className={`rounded-xl p-5 border ${busResult.eligible ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${busResult.eligible ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                    {busResult.eligible ? (
                      <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                        <path d="M1 6l4 4 8-9" stroke="#065f46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="4" height="10" viewBox="0 0 4 10" fill="none">
                        <path d="M2 1v6M2 9v1" stroke="#92400e" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${busResult.eligible ? 'text-emerald-900' : 'text-amber-900'}`}>
                      {busResult.eligible ? `BUS eligible — £${busResult.grant.toLocaleString()} grant available` : 'BUS eligibility uncertain'}
                    </div>
                    <div className={`text-xs mt-0.5 ${busResult.eligible ? 'text-emerald-700' : 'text-amber-700'}`}>{busResult.reason}</div>
                  </div>
                </div>
              </div>
            )}
            {!busResult && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <div className="text-sm font-medium text-gray-700 mb-1">BUS eligibility</div>
                <div className="text-xs text-gray-500">No EPC data selected — eligibility will be confirmed at survey stage</div>
              </div>
            )}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="text-sm font-medium text-gray-900 mb-4">
                {heatLoss ? 'Estimated heat loss — MCS method' : 'Heat loss estimate'}
              </div>
              {heatLoss ? (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500 mb-1">Design load</div>
                      <div className="text-lg font-semibold text-gray-900">{(heatLoss.design_load_w / 1000).toFixed(1)} kW</div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-emerald-600 mb-1">Recommended</div>
                      <div className="text-lg font-semibold text-emerald-700">{heatLoss.recommended_kw} kW ASHP</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500 mb-1">Est. SCOP</div>
                      <div className="text-lg font-semibold text-gray-900">{heatLoss.cop_estimate}</div>
                    </div>
                  </div>
                  <div className="space-y-2 mb-5">
                    <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Fabric heat loss</span>
                      <span className="font-medium">{heatLoss.fabric_loss_w.toLocaleString()} W</span>
                    </div>
                    <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Ventilation loss</span>
                      <span className="font-medium">{heatLoss.ventilation_loss_w.toLocaleString()} W</span>
                    </div>
                    <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">DHW demand</span>
                      <span className="font-medium">{heatLoss.dhw_demand_w.toLocaleString()} W</span>
                    </div>
                    <div className="flex justify-between text-xs py-1.5 font-medium">
                      <span className="text-gray-900">Total design load</span>
                      <span className="text-emerald-700">{heatLoss.design_load_w.toLocaleString()} W</span>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs font-medium text-gray-700 mb-3">Estimated annual running costs</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <div className="text-xs text-gray-500 mb-1">Current (gas)</div>
                        <div className="text-base font-semibold text-gray-900">£{heatLoss.annual_cost_gas.toLocaleString()}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-emerald-600 mb-1">ASHP estimate</div>
                        <div className="text-base font-semibold text-emerald-700">£{heatLoss.annual_cost_ashp.toLocaleString()}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500 mb-1">Annual saving</div>
                        <div className={`text-base font-semibold ${heatLoss.annual_saving > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {heatLoss.annual_saving > 0 ? '+' : ''}£{heatLoss.annual_saving.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-3">
                      Based on current energy tariffs. Full analysis completed at design stage.
                      {selectedEpc?.energy_cost_current ? ` EPC energy cost: £${selectedEpc.energy_cost_current}/yr.` : ''}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-sm text-gray-400">
                  No EPC data available — heat loss will be calculated during survey
                </div>
              )}
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Back</button>
              <button onClick={() => setStep(4)} className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
                Next: Confirm & create →
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — Confirm */}
        {step === 4 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-medium text-gray-900 mb-5">Confirm & create job</h2>
            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-xs font-medium text-gray-600 mb-3">Customer</div>
                <div className="text-sm font-medium text-gray-900">{customer.first_name} {customer.last_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{customer.address_line1}, {customer.city}, {customer.postcode}</div>
                <div className="text-xs text-gray-500 mt-0.5">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</div>
              </div>
              {selectedEpc && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-xs font-medium text-gray-600 mb-3">Property (from EPC)</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-500">Type: </span><span className="text-gray-900 font-medium">{selectedEpc.property_type}</span></div>
                    <div><span className="text-gray-500">Built: </span><span className="text-gray-900 font-medium">{selectedEpc.construction_age_band}</span></div>
                    <div><span className="text-gray-500">Area: </span><span className="text-gray-900 font-medium">{selectedEpc.total_floor_area}m²</span></div>
                    <div><span className="text-gray-500">EPC: </span><span className="text-gray-900 font-medium">{selectedEpc.current_energy_rating}</span></div>
                    <div className="col-span-2"><span className="text-gray-500">Heating: </span><span className="text-gray-900 font-medium">{selectedEpc.mainheat_description?.slice(0, 50)}</span></div>
                    <div className="col-span-2"><span className="text-gray-500">Walls: </span><span className="text-gray-900 font-medium">{selectedEpc.walls_description?.slice(0, 50)}</span></div>
                  </div>
                </div>
              )}
              {heatLoss && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-xs font-medium text-gray-600 mb-3">Heat loss estimate</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-500">Design load: </span><span className="text-gray-900 font-medium">{(heatLoss.design_load_w / 1000).toFixed(1)} kW</span></div>
                    <div><span className="text-gray-500">Recommended: </span><span className="text-emerald-700 font-medium">{heatLoss.recommended_kw} kW ASHP</span></div>
                    <div><span className="text-gray-500">Est. gas cost: </span><span className="text-gray-900 font-medium">£{heatLoss.annual_cost_gas}/yr</span></div>
                    <div><span className="text-gray-500">Est. ASHP cost: </span><span className="text-emerald-700 font-medium">£{heatLoss.annual_cost_ashp}/yr</span></div>
                  </div>
                </div>
              )}
              {busResult && (
                <div className={`rounded-xl p-4 ${busResult.eligible ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  <div className="text-xs font-medium text-gray-600 mb-1">BUS eligibility</div>
                  <div className={`text-sm font-medium ${busResult.eligible ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {busResult.eligible ? `Eligible — £${busResult.grant.toLocaleString()} grant` : 'Not confirmed'}
                  </div>
                  <div className={`text-xs mt-0.5 ${busResult.eligible ? 'text-emerald-600' : 'text-amber-600'}`}>{busResult.reason}</div>
                </div>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5">
              <div className="text-xs text-blue-800">
                Creating this job will initialise all 10 workflow stages and generate the MCS document package. The survey stage will be unlocked first.
              </div>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2.5 mb-4">{error}</div>
            )}
            <div className="flex justify-between">
              <button onClick={() => setStep(3)} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Back</button>
              <button
                onClick={createJob}
                disabled={saving}
                className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                {saving ? 'Creating job...' : 'Create job →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}