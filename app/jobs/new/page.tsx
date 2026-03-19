'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react'
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
  address3: string
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
  mainheatc_description: string
  lighting_description: string
  energy_consumption_current: string
  energy_cost_current: string
  energy_cost_potential: string
  co2_emissions_current: string
  number_habitable_rooms: string
  heating_cost_current: string
  hot_water_cost_current: string
  lighting_cost_current: string
  low_energy_lighting: string
  tenure: string
  local_authority: string
  constituency: string
  county: string
}

type HeatLoss = {
  design_load_w: number
  recommended_kw: number
  fabric_loss_w: number
  ventilation_loss_w: number
  dhw_demand_w: number
  annual_kwh_heat: number
  current_heating_cost: number
  current_hotwater_cost: number
  current_relevant_cost: number
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

function hasHeatPump(epc: EpcData): boolean {
  const fields = [
    epc.mainheat_description,
    epc.mainheatc_description,
    epc.hot_water_description,
  ].join(' ').toLowerCase()
  return fields.includes('heat pump') || fields.includes('ground source') || fields.includes('air source')
}

function calcHeatLoss(epc: EpcData): HeatLoss {
  const area = parseFloat(epc.total_floor_area) || 80
  const era = epc.construction_age_band || ''
  const propType = (epc.property_type || '').toLowerCase()
  const wallsDesc = (epc.walls_description || '').toLowerCase()
  const roofDesc = (epc.roof_description || '').toLowerCase()
  const windowsDesc = (epc.windows_description || '').toLowerCase()

  // ── U-values: start with era defaults, then refine from EPC descriptions ──

  // Wall U-value
  let uWall = 1.7 // pre-1920 solid uninsulated default
  if (era.includes('2012') || era.includes('2007')) uWall = 0.18
  else if (era.includes('2000') || era.includes('1996')) uWall = 0.27
  else if (era.includes('1991') || era.includes('1983')) uWall = 0.35
  else if (era.includes('1976') || era.includes('1967')) uWall = 0.60
  else if (era.includes('1950') || era.includes('1966')) uWall = 1.0
  else if (era.includes('1930') || era.includes('1949')) uWall = 1.7

  // Override wall U-value from EPC description
  if (wallsDesc.includes('cavity insulation') || wallsDesc.includes('filled cavity')) uWall = Math.min(uWall, 0.50)
  else if (wallsDesc.includes('external insulation') || wallsDesc.includes('internal insulation')) uWall = Math.min(uWall, 0.30)
  else if (wallsDesc.includes('cavity') && !wallsDesc.includes('insulation')) uWall = Math.min(uWall, 1.6)

  // Roof U-value
  let uRoof = 0.60
  if (roofDesc.includes('200mm') || roofDesc.includes('300mm') || roofDesc.includes('well insulated')) uRoof = 0.13
  else if (roofDesc.includes('100mm') || roofDesc.includes('150mm') || roofDesc.includes('insulated')) uRoof = 0.22
  else if (roofDesc.includes('no insulation') || roofDesc.includes('uninsulated')) uRoof = 2.0
  else if (era.includes('2000') || era.includes('2007') || era.includes('2012')) uRoof = 0.16
  else if (era.includes('1991') || era.includes('1996')) uRoof = 0.20

  // Window U-value
  let uWindow = 4.8
  if (windowsDesc.includes('triple')) uWindow = 0.8
  else if (windowsDesc.includes('double') && windowsDesc.includes('low-e')) uWindow = 1.4
  else if (windowsDesc.includes('double')) uWindow = 2.0
  else if (windowsDesc.includes('secondary')) uWindow = 2.4
  // single glazing stays at 4.8

  // Floor U-value — less variation, era-based
  let uFloor = 0.45
  if (era.includes('2000') || era.includes('2007') || era.includes('2012')) uFloor = 0.18
  else if (era.includes('1991') || era.includes('1996')) uFloor = 0.22
  else if (era.includes('1983') || era.includes('1976')) uFloor = 0.35

  // ── Element areas from floor area and property type ──
  // These ratios are based on SAP/MCS guidance for typical UK properties
  let heightFactor = 2.5
  if (propType.includes('flat') || propType.includes('maisonette')) heightFactor = 2.4

  // Exposed wall area: perimeter estimate from floor area
  // Typical semi-detached: 3 exposed faces; detached: 4; terrace: 2; flat: varies
  let exposedWallFactor = 1.4
  if (propType.includes('detached')) exposedWallFactor = 1.8
  else if (propType.includes('semi')) exposedWallFactor = 1.4
  else if (propType.includes('terrace') || propType.includes('mid-terrace')) exposedWallFactor = 1.0
  else if (propType.includes('end-terrace') || propType.includes('end terrace')) exposedWallFactor = 1.3
  else if (propType.includes('flat')) exposedWallFactor = 0.9

  const wallArea = area * exposedWallFactor * heightFactor * 0.75 // subtract 25% for windows/doors
  const roofArea = propType.includes('flat') ? 0 : area * 1.05
  const floorArea = area
  const windowArea = area * 0.15 // ~15% of floor area — typical UK
  const doorArea = 3.6 // standard 1.8m x 2.0m x 1 door exposed

  // ── Fabric heat loss ──
  const designDeltaT = 24 // indoor 21°C, outdoor -3°C
  const fabricLoss = Math.round(
    (uWall * wallArea + uRoof * roofArea + uFloor * floorArea +
     uWindow * windowArea + 2.0 * doorArea) * designDeltaT
  )

  // ── Ventilation loss ── (SAP method: 0.33 × volume × ACH × deltaT)
  const volume = area * heightFactor
  const ach = propType.includes('flat') ? 0.5 : 0.6
  const ventLoss = Math.round(0.33 * volume * ach * designDeltaT)

  // ── DHW demand ── (MCS method: 40 litres/person/day, 2.3 people avg, 45°C rise)
  const dhwDemand = Math.round((40 * 2.3 * 4.18 * 45) / (3600 * 8) * 1000) // ~600–700W typical

  const totalLoad = fabricLoss + ventLoss + dhwDemand
  const recommendedKw = Math.ceil(totalLoad / 1000)

  // ── Annual energy from EPC or estimate ──
  const annualKwhHeat = parseInt(epc.energy_consumption_current) || Math.round(area * 110)

  // Relevant costs: heating + hot water only (no lighting)
  const heatingCost = parseInt(epc.heating_cost_current) || Math.round(area * 8)
  const hotWaterCost = parseInt(epc.hot_water_cost_current) || Math.round(area * 2.5)
  const relevantCost = heatingCost + hotWaterCost

  return {
    design_load_w: totalLoad,
    recommended_kw: recommendedKw,
    fabric_loss_w: fabricLoss,
    ventilation_loss_w: ventLoss,
    dhw_demand_w: dhwDemand,
    annual_kwh_heat: annualKwhHeat,
    current_heating_cost: heatingCost,
    current_hotwater_cost: hotWaterCost,
    current_relevant_cost: relevantCost,
  }
}

export default function NewJobPage() {
  const [step, setStep] = useState<Step>(1)
  const [customer, setCustomer] = useState<CustomerData>(emptyCustomer)
  const [epcResults, setEpcResults] = useState<EpcData[]>([])
  const [selectedEpc, setSelectedEpc] = useState<EpcData | null>(null)
  const [heatLoss, setHeatLoss] = useState<HeatLoss | null>(null)
  const [epcLoading, setEpcLoading] = useState(false)
  const [epcError, setEpcError] = useState('')
  const [showEpcList, setShowEpcList] = useState(false)
  const [claimBus, setClaimBus] = useState<boolean | null>(null)
  const [busEligible, setBusEligible] = useState(false)
  const [busReason, setBusReason] = useState('')
  const [heatPumpDetected, setHeatPumpDetected] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateCustomer(field: keyof CustomerData, value: string) {
    setCustomer(prev => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    if (step === 2 && customer.postcode && epcResults.length === 0 && !epcLoading) {
      searchEpc(customer.postcode)
    }
  }, [step])

  async function searchEpc(postcode: string) {
    setEpcLoading(true)
    setEpcError('')
    try {
      const res = await fetch(`/api/epc?postcode=${encodeURIComponent(postcode)}`)
      const data = await res.json()
      if (data.rows && data.rows.length > 0) {
        setEpcResults(data.rows)
        setShowEpcList(true)
        if (data.rows.length === 1) handleSelectEpc(data.rows[0])
      } else {
        setEpcError('No EPC records found for this postcode.')
      }
    } catch {
      setEpcError('Could not connect to EPC database.')
    }
    setEpcLoading(false)
  }

  function handleSelectEpc(epc: EpcData) {
    setSelectedEpc(epc)
    setShowEpcList(false)
    const hl = calcHeatLoss(epc)
    setHeatLoss(hl)
    const hp = hasHeatPump(epc)
    setHeatPumpDetected(hp)
    setBusEligible(!hp)
    setBusReason(hp
      ? 'A heat pump appears to already be installed — BUS cannot be claimed'
      : `Valid EPC (${epc.current_energy_rating}) confirmed · No existing heat pump detected`
    )
  }

  function checkBusFromEpc() {
    if (!selectedEpc) {
      setBusEligible(true)
      setBusReason('No EPC data — eligibility to be confirmed at survey stage')
    }
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
          property_type: selectedEpc?.property_type?.toLowerCase().replace(/\s+/g, '_') || null,
          floor_area_m2: selectedEpc ? parseFloat(selectedEpc.total_floor_area) || null : null,
          epc_rating: selectedEpc?.current_energy_rating || null,
          bus_eligible: claimBus && busEligible,
          bus_checked_at: new Date().toISOString(),
          notes: selectedEpc ? `EPC Certificate Number: ${selectedEpc.lmk_key}` : null,
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
          bus_status: claimBus && busEligible ? 'eligible' : 'not_started',
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
            property_type: selectedEpc.property_type?.toLowerCase().replace(/\s+/g, '_') || null,
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

      if (claimBus && busEligible) {
        await (supabase as any)
          .from('audit_log')
          .insert({
            job_id: newJob.id,
            user_id: session.user.id,
            action: 'bus_application_requested',
            stage: 'customer',
            entity_type: 'job',
            entity_id: newJob.id,
            description: `BUS application requested for ${customer.first_name} ${customer.last_name} — £7,500 grant`,
            metadata: { bus_grant: 7500, epc_rating: selectedEpc?.current_energy_rating, epc_cert: selectedEpc?.lmk_key },
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

  const steps = [
    { n: 1, label: 'Customer' },
    { n: 2, label: 'Property & EPC' },
    { n: 3, label: 'BUS grant' },
    { n: 4, label: 'Confirm' },
  ]

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
          <div className="flex items-center">
            {steps.map((s, i) => (
              <div key={s.n} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    step > s.n ? 'bg-emerald-700 text-white' :
                    step === s.n ? 'bg-emerald-700 text-white' :
                    'bg-gray-200 text-gray-400'
                  }`}>
                    {step > s.n ? '✓' : s.n}
                  </div>
                  <div className={`text-xs mt-1 text-center ${step >= s.n ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>
                    {s.label}
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div className={`h-0.5 flex-1 mb-4 ${step > s.n ? 'bg-emerald-600' : 'bg-gray-200'}`} />
                )}
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
                  <input type="text" value={customer.postcode} onChange={e => updateCustomer('postcode', e.target.value)} placeholder="M14 7AZ" className={inputClass}/>
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
                  setStep(2)
                }}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                Next: Property & EPC →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — Property & EPC */}
        {step === 2 && (
          <div className="space-y-4">
            {epcLoading && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin flex-shrink-0"/>
                <span className="text-sm text-gray-600">Looking up EPC register for {customer.postcode}...</span>
              </div>
            )}

            {epcError && !epcLoading && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-sm font-medium text-amber-900 mb-1">EPC not found</div>
                <div className="text-xs text-amber-700 mb-2">{epcError} You can continue — property details will be collected at survey stage.</div>
                <button onClick={() => searchEpc(customer.postcode)} className="text-xs text-amber-800 underline">Try again</button>
              </div>
            )}

            {showEpcList && epcResults.length > 1 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="text-sm font-medium text-gray-900 mb-1">Select the correct property</div>
                <div className="text-xs text-gray-500 mb-4">{epcResults.length} EPC records found for {customer.postcode}</div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {epcResults.map((epc, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectEpc(epc)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {[epc.address1, epc.address2, epc.address3].filter(Boolean).join(', ')}
                      </div>
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
              </div>
            )}

            {selectedEpc && !showEpcList && (
              <>
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-medium text-gray-900">Property details</div>
                    <button onClick={() => setShowEpcList(true)} className="text-xs text-emerald-700 hover:underline">Change property</button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
                    {[
                      { label: 'Address', value: [selectedEpc.address1, selectedEpc.address2, selectedEpc.address3].filter(Boolean).join(', '), full: true },
                      { label: 'Postcode', value: selectedEpc.postcode },
                      { label: 'Property type', value: selectedEpc.property_type },
                      { label: 'Built form', value: selectedEpc.built_form },
                      { label: 'Construction era', value: selectedEpc.construction_age_band },
                      { label: 'Floor area', value: selectedEpc.total_floor_area ? `${selectedEpc.total_floor_area} m²` : '—' },
                      { label: 'EPC rating (current)', value: selectedEpc.current_energy_rating },
                      { label: 'EPC rating (potential)', value: selectedEpc.potential_energy_rating },
                      { label: 'Main heating', value: selectedEpc.mainheat_description, full: true },
                      { label: 'Hot water', value: selectedEpc.hot_water_description, full: true },
                      { label: 'Main fuel', value: selectedEpc.main_fuel },
                      { label: 'Habitable rooms', value: selectedEpc.number_habitable_rooms },
                      { label: 'Walls', value: selectedEpc.walls_description, full: true },
                      { label: 'Roof', value: selectedEpc.roof_description, full: true },
                      { label: 'Windows', value: selectedEpc.windows_description, full: true },
                    ].map(row => (
                      <div key={row.label} className={row.full ? 'col-span-2' : 'col-span-1'}>
                        <div className="text-xs text-gray-400">{row.label}</div>
                        <div className="text-xs font-medium text-gray-900 mt-0.5">{row.value || '—'}</div>
                      </div>
                    ))}
                  </div>

                  {/* EPC Certificate Number — prominent */}
                  <div className="border-t border-gray-100 pt-4">
                    <div className="text-xs font-medium text-gray-500 mb-1">EPC Certificate Number</div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-mono bg-gray-50 border border-gray-200 rounded px-3 py-2 flex-1 text-gray-800 break-all">
                        {selectedEpc.lmk_key}
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(selectedEpc.lmk_key)}
                        className="text-xs text-emerald-700 hover:underline flex-shrink-0 px-2 py-2"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Inspection date: {selectedEpc.inspection_date}</div>
                  </div>

                  {heatPumpDetected && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                      <div className="text-xs font-medium text-amber-800">Heat pump detected in EPC</div>
                      <div className="text-xs text-amber-700 mt-0.5">The EPC indicates a heat pump may already be installed. Please verify on site.</div>
                    </div>
                  )}
                </div>

                {/* Heat loss */}
                {heatLoss && (
                  <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <div className="text-sm font-medium text-gray-900 mb-4">Estimated heat loss</div>
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="bg-emerald-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-emerald-600 mb-1">Recommended system</div>
                        <div className="text-xl font-semibold text-emerald-700">{heatLoss.recommended_kw} kW ASHP</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">Design load</div>
                        <div className="text-xl font-semibold text-gray-900">{(heatLoss.design_load_w / 1000).toFixed(1)} kW</div>
                      </div>
                    </div>
                    <div className="space-y-2 mb-5 text-xs">
                      <div className="flex justify-between py-1.5 border-b border-gray-100">
                        <span className="text-gray-500">Fabric heat loss</span>
                        <span className="font-medium">{heatLoss.fabric_loss_w.toLocaleString()} W</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-gray-100">
                        <span className="text-gray-500">Ventilation loss</span>
                        <span className="font-medium">{heatLoss.ventilation_loss_w.toLocaleString()} W</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-gray-100">
                        <span className="text-gray-500">DHW demand</span>
                        <span className="font-medium">{heatLoss.dhw_demand_w.toLocaleString()} W</span>
                      </div>
                      <div className="flex justify-between py-1.5 font-medium">
                        <span className="text-gray-900">Total design load</span>
                        <span className="text-emerald-700">{heatLoss.design_load_w.toLocaleString()} W</span>
                      </div>
                    </div>

                    {/* Current energy costs — heating & hot water only */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="text-xs font-medium text-gray-700 mb-3">Current estimated annual energy costs (heating & hot water)</div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Space heating</span>
                          <span className="font-medium">£{heatLoss.current_heating_cost.toLocaleString()}/yr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Hot water</span>
                          <span className="font-medium">£{heatLoss.current_hotwater_cost.toLocaleString()}/yr</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 font-medium">
                          <span className="text-gray-900">Total relevant spend</span>
                          <span className="text-gray-900">£{heatLoss.current_relevant_cost.toLocaleString()}/yr</span>
                        </div>
                        <div className="flex justify-between pt-1">
                          <span className="text-gray-500">Annual energy consumption</span>
                          <span className="font-medium">{heatLoss.annual_kwh_heat.toLocaleString()} kWh/yr</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-3">Based on EPC data. Full running cost comparison completed at design stage once system is specified.</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {!selectedEpc && !epcLoading && !showEpcList && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="text-sm font-medium text-gray-900 mb-1">No EPC data</div>
                <div className="text-xs text-gray-500">Property and heat loss details will be collected during the site survey stage.</div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Back</button>
              <button
                onClick={() => { checkBusFromEpc(); setStep(3) }}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                Next: BUS grant →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — BUS grant */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="text-sm font-medium text-gray-900 mb-1">Boiler Upgrade Scheme (BUS)</div>
              <div className="text-xs text-gray-500 mb-6">The BUS grant provides £7,500 towards the cost of an air-to-water heat pump installation, claimed on the customer&apos;s behalf.</div>

              <div className={`rounded-xl p-4 mb-6 border ${busEligible ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${busEligible ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                    {busEligible ? (
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5l3.5 3.5 6.5-8" stroke="#065f46" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="4" height="10" viewBox="0 0 4 10" fill="none">
                        <path d="M2 1v6M2 9v1" stroke="#92400e" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${busEligible ? 'text-emerald-900' : 'text-amber-900'}`}>
                      {busEligible ? 'BUS eligible — £7,500 grant available' : 'BUS eligibility to confirm on site'}
                    </div>
                    <div className={`text-xs mt-1 ${busEligible ? 'text-emerald-700' : 'text-amber-700'}`}>{busReason}</div>
                  </div>
                </div>
              </div>

              <div className="text-sm font-medium text-gray-900 mb-3">Will you be claiming the BUS grant for this customer?</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setClaimBus(true)}
                  className={`p-4 rounded-xl border-2 text-left transition-colors ${
                    claimBus === true ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900 mb-1">Yes — claim BUS grant</div>
                  <div className="text-xs text-gray-500">£7,500 deducted from customer invoice. Admin team notified to process the application.</div>
                </button>
                <button
                  onClick={() => setClaimBus(false)}
                  className={`p-4 rounded-xl border-2 text-left transition-colors ${
                    claimBus === false ? 'border-gray-500 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900 mb-1">No — proceed without BUS</div>
                  <div className="text-xs text-gray-500">Continue without the BUS grant. This can be added later if circumstances change.</div>
                </button>
              </div>

              {claimBus === true && (
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="text-xs font-medium text-blue-900 mb-1">What happens next</div>
                  <div className="text-xs text-blue-800 space-y-1">
                    <div>· Admin team will be notified and will begin the BUS application</div>
                    <div>· Customer must own and live in the property</div>
                    <div>· Property must have a valid EPC lodged within the last 10 years</div>
                    <div>· Grant redeemed after installation and commissioning sign-off</div>
                  </div>
                </div>
              )}

              {claimBus === false && (
                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <div className="text-xs text-gray-600">Job will proceed without BUS funding. Full installation cost will be invoiced to the customer.</div>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Back</button>
              <button
                onClick={() => {
                  if (claimBus === null) { setError('Please select a BUS option'); return }
                  setError('')
                  setStep(4)
                }}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                Next: Confirm →
              </button>
            </div>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        )}

        {/* STEP 4 — Confirm */}
        {step === 4 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-medium text-gray-900 mb-5">Confirm & create job</h2>
            <div className="space-y-4 mb-6">

              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Customer</div>
                <div className="text-sm font-medium text-gray-900">{customer.first_name} {customer.last_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{customer.address_line1}, {customer.city}, {customer.postcode}</div>
                <div className="text-xs text-gray-500 mt-0.5">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</div>
              </div>

              {selectedEpc && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Property details</div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div><span className="text-gray-500">Type: </span><span className="text-gray-900 font-medium">{selectedEpc.property_type}</span></div>
                    <div><span className="text-gray-500">Built: </span><span className="text-gray-900 font-medium">{selectedEpc.construction_age_band}</span></div>
                    <div><span className="text-gray-500">Area: </span><span className="text-gray-900 font-medium">{selectedEpc.total_floor_area}m²</span></div>
                    <div><span className="text-gray-500">EPC: </span><span className="text-gray-900 font-medium">{selectedEpc.current_energy_rating}</span></div>
                    <div className="col-span-2"><span className="text-gray-500">Heating: </span><span className="text-gray-900 font-medium">{selectedEpc.mainheat_description}</span></div>
                    <div className="col-span-2"><span className="text-gray-500">Walls: </span><span className="text-gray-900 font-medium">{selectedEpc.walls_description}</span></div>
                  </div>
                  <div className="border-t border-gray-200 pt-3">
                    <div className="text-xs text-gray-500 mb-1">EPC Certificate Number</div>
                    <div className="text-xs font-mono text-gray-700 break-all">{selectedEpc.lmk_key}</div>
                  </div>
                </div>
              )}

              {heatLoss && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Heat loss estimate</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-500">Design load: </span><span className="text-gray-900 font-medium">{(heatLoss.design_load_w / 1000).toFixed(1)} kW</span></div>
                    <div><span className="text-gray-500">Recommended: </span><span className="text-emerald-700 font-medium">{heatLoss.recommended_kw} kW ASHP</span></div>
                    <div><span className="text-gray-500">Heating + HW cost: </span><span className="text-gray-900 font-medium">£{heatLoss.current_relevant_cost}/yr</span></div>
                    <div><span className="text-gray-500">Annual usage: </span><span className="text-gray-900 font-medium">{heatLoss.annual_kwh_heat.toLocaleString()} kWh</span></div>
                  </div>
                </div>
              )}

              <div className={`rounded-xl p-4 ${claimBus ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">BUS grant</div>
                <div className={`text-sm font-medium ${claimBus ? 'text-emerald-800' : 'text-gray-700'}`}>
                  {claimBus ? '£7,500 grant — admin team will be notified' : 'Not claiming BUS grant'}
                </div>
              </div>
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