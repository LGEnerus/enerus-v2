import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── MCS 031 SPF lookup ───────────────────────────────────────────────────────
const MCS031: number[][] = [
  [20,4.5,4.2,3.9,3.6,3.3,3.0,2.7],
  [30,4.3,4.0,3.7,3.4,3.1,2.8,2.6],
  [40,4.1,3.8,3.5,3.2,2.9,2.7,2.5],
  [50,3.9,3.6,3.3,3.0,2.8,2.6,2.4],
  [60,3.7,3.4,3.1,2.9,2.7,2.5,2.3],
  [80,3.5,3.2,2.9,2.7,2.6,2.4,2.2],
  [100,3.3,3.0,2.8,2.6,2.5,2.3,2.1],
  [120,3.1,2.9,2.7,2.5,2.4,2.2,2.0],
  [999,2.9,2.7,2.5,2.4,2.3,2.1,1.9],
]
function getSpf(shl: number, emitter: string, ft: number): number {
  const row = MCS031.find(r => shl <= r[0]) || MCS031[MCS031.length-1]
  const col = emitter === 'ufh' ? (ft<=35?1:ft<=40?2:3) : (ft<=45?4:ft<=50?5:ft<=55?6:7)
  return row[col]
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id

  try {
    // Load all job data — separate queries to avoid RLS join issues
    const [jobRes, designRes] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).single(),
      supabase.from('system_designs').select('*').eq('job_id', jobId).single(),
    ])

    const job = (jobRes.data as any)
    const design = (designRes.data as any)

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Load customer separately
    const { data: customerData } = await supabase
      .from('customers')
      .select('*')
      .eq('id', job.customer_id)
      .single()

    const customer = customerData
    const di = design?.design_inputs || {}


    // Extract design data
    const rooms: any[] = di.rooms || []
    const settings = di.settings || {}
    const hpSel = di.hpSelection || {}
    const cylSel = di.cylinderSelection || {}
    const systemSpec = di.systemSpec || {}
    const noiseAssessment = di.noiseAssessment || {}

    const totalW = rooms.reduce((s: number, r: any) => s + (r.totalLossW || 0), 0)
    const shl = settings.totalFloorAreaM2 > 0 ? Math.round(totalW / settings.totalFloorAreaM2) : 0
    const flowTemp = systemSpec.flowTemp || hpSel.flowTemp || 50
    const emitter = systemSpec.emitterType || hpSel.emitterType || 'radiators'
    const spf = getSpf(shl, emitter, flowTemp)
    const stars = spf >= 4.0 ? 6 : spf >= 3.5 ? 5 : spf >= 3.0 ? 4 : spf >= 2.7 ? 3 : spf >= 2.4 ? 2 : 1
    const annualHeat = Math.round((totalW / ((21 - (settings.designTempExt || -4)) * 1000)) * 2200 * 24)
    const annualElec = Math.round(annualHeat / spf)
    const annualDhw = Math.round(45 * (settings.numBedrooms || 3) * 365 * 4.18 * 0.001 / 1.7) * 100

    // Generate HTML proposal
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const refNum = `ENR-${jobId.slice(0,8).toUpperCase()}`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Heat Pump System Proposal — ${customer.first_name} ${customer.last_name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1f2937; background: white; }
  @media print {
    body { font-size: 10px; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
  .page { max-width: 794px; margin: 0 auto; padding: 40px; }
  
  /* Header */
  .proposal-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 3px solid #059669; margin-bottom: 24px; }
  .logo-block { display: flex; align-items: center; gap: 12px; }
  .logo-icon { width: 40px; height: 40px; background: #059669; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  .logo-text { font-size: 18px; font-weight: 700; color: #059669; }
  .logo-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .ref-block { text-align: right; }
  .ref-num { font-size: 14px; font-weight: 700; color: #1f2937; }
  .ref-date { font-size: 10px; color: #6b7280; margin-top: 2px; }
  
  /* Section headings */
  .section-heading { font-size: 13px; font-weight: 700; color: #059669; padding: 8px 0; border-bottom: 1px solid #d1fae5; margin: 20px 0 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  
  /* Customer + property */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .info-block { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
  .info-label { font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
  .info-value { font-size: 11px; font-weight: 500; color: #1f2937; }
  
  /* Heat loss table */
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #059669; color: white; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 600; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; font-size: 10px; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #f9fafb; }
  .total-row td { background: #d1fae5 !important; font-weight: 700; border-top: 2px solid #059669; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  
  /* System spec cards */
  .spec-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
  .spec-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
  .spec-card-title { font-size: 9px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .spec-card-value { font-size: 16px; font-weight: 800; color: #059669; }
  .spec-card-sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
  
  /* HP + cylinder */
  .product-card { border: 2px solid #059669; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
  .product-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .product-brand { font-size: 9px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .product-name { font-size: 14px; font-weight: 700; color: #1f2937; margin-top: 2px; }
  .product-badge { background: #059669; color: white; font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 12px; }
  .product-specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .product-spec-item { text-align: center; background: #f9fafb; border-radius: 6px; padding: 6px; }
  .product-spec-label { font-size: 8px; color: #6b7280; display: block; }
  .product-spec-value { font-size: 11px; font-weight: 700; color: #1f2937; display: block; margin-top: 1px; }
  
  /* MCS 031 */
  .mcs-box { background: #f0fdf4; border: 2px solid #059669; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .mcs-title { font-size: 11px; font-weight: 700; color: #059669; margin-bottom: 8px; }
  .mcs-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .mcs-item { text-align: center; }
  .mcs-label { font-size: 8px; color: #6b7280; display: block; }
  .mcs-value { font-size: 13px; font-weight: 800; color: #059669; display: block; margin-top: 2px; }
  .stars { color: #f59e0b; font-size: 14px; }
  .mcs-disclosure { font-size: 9px; color: #374151; margin-top: 10px; background: white; border-radius: 6px; padding: 8px; border: 1px solid #d1fae5; }
  
  /* Noise */
  .noise-box { border-radius: 10px; padding: 14px; margin-bottom: 16px; }
  .noise-pass { background: #f0fdf4; border: 2px solid #059669; }
  .noise-fail { background: #fef2f2; border: 2px solid #ef4444; }
  
  /* BUS grant */
  .bus-box { background: #fefce8; border: 2px solid #f59e0b; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .bus-title { font-size: 12px; font-weight: 700; color: #92400e; margin-bottom: 8px; }
  
  /* Footer */
  .proposal-footer { margin-top: 32px; padding-top: 16px; border-top: 2px solid #e5e7eb; }
  .footer-text { font-size: 8px; color: #9ca3af; line-height: 1.5; }
  .mcs-logo-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .mcs-badge { background: #059669; color: white; font-size: 9px; font-weight: 700; padding: 4px 10px; border-radius: 4px; }
  
  /* Print button */
  .print-bar { position: fixed; bottom: 20px; right: 20px; display: flex; gap: 10px; }
  .btn { background: #059669; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .btn:hover { background: #047857; }
  .btn-outline { background: white; color: #059669; border: 2px solid #059669; }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="proposal-header">
    <div class="logo-block">
      <div class="logo-icon">
        <svg width="24" height="24" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
      </div>
      <div>
        <div class="logo-text">Enerus Plus</div>
        <div class="logo-sub">MCS Umbrella Scheme · Heat Pump Design & Specification</div>
      </div>
    </div>
    <div class="ref-block">
      <div class="ref-num">PROPOSAL ${refNum}</div>
      <div class="ref-date">Prepared: ${today}</div>
      <div class="ref-date">Valid for 30 days</div>
    </div>
  </div>

  <!-- Customer + property -->
  <div class="section-heading">Customer & Property</div>
  <div class="two-col">
    <div class="info-block">
      <div class="info-label">Prepared for</div>
      <div class="info-value" style="font-size:14px;font-weight:700;margin-bottom:4px">${customer.first_name} ${customer.last_name}</div>
      <div class="info-value">${customer.address_line1 || ''}${customer.address_line2 ? ', ' + customer.address_line2 : ''}</div>
      <div class="info-value">${customer.city || ''}</div>
      <div class="info-value">${customer.postcode || ''}</div>
      ${customer.email ? `<div class="info-value" style="margin-top:6px">${customer.email}</div>` : ''}
      ${customer.phone ? `<div class="info-value">${customer.phone}</div>` : ''}
    </div>
    <div class="info-block">
      <div class="info-label">Property details</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
        <div><div class="info-label">Type</div><div class="info-value">${(settings.propertyType || 'N/A').replace('_', ' ')}</div></div>
        <div><div class="info-label">Floor area</div><div class="info-value">${settings.totalFloorAreaM2 || 'N/A'} m²</div></div>
        <div><div class="info-label">Bedrooms</div><div class="info-value">${settings.numBedrooms || 'N/A'}</div></div>
        <div><div class="info-label">Design temp</div><div class="info-value">${settings.designTempExt || -4}°C ext</div></div>
        <div><div class="info-label">EPC reference</div><div class="info-value">${customer.epc_certificate_number || 'N/A'}</div></div>
        <div><div class="info-label">Job reference</div><div class="info-value">${job.job_reference || refNum}</div></div>
      </div>
    </div>
  </div>

  <!-- Heat loss summary -->
  <div class="section-heading">Heat Loss Calculation — BS EN 12831-1:2017 · MIS 3005-D</div>
  ${rooms.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Room</th>
        <th>Type</th>
        <th class="text-right">Area (m²)</th>
        <th class="text-right">Fabric (W)</th>
        <th class="text-right">Ventilation (W)</th>
        <th class="text-right">Total (W)</th>
      </tr>
    </thead>
    <tbody>
      ${rooms.map((r: any) => `
      <tr>
        <td>${r.name || r.roomType}</td>
        <td>${r.roomType}</td>
        <td class="text-right">${r.areaMm2 > 0 ? (r.areaMm2 / 1e6).toFixed(1) : (r.lengthMm * r.widthMm / 1e6).toFixed(1)}</td>
        <td class="text-right">${r.fabricLossW}</td>
        <td class="text-right">${r.ventLossW}</td>
        <td class="text-right" style="font-weight:600">${r.totalLossW}</td>
      </tr>`).join('')}
      <tr class="total-row">
        <td colspan="3"><strong>Total building heat loss</strong></td>
        <td class="text-right">${rooms.reduce((s: number, r: any) => s + r.fabricLossW, 0)}</td>
        <td class="text-right">${rooms.reduce((s: number, r: any) => s + r.ventLossW, 0)}</td>
        <td class="text-right"><strong>${totalW.toLocaleString()} W</strong></td>
      </tr>
    </tbody>
  </table>
  ` : '<p style="color:#6b7280;font-size:11px">Heat loss calculation not yet complete.</p>'}

  <div class="spec-grid" style="margin-top:12px">
    <div class="spec-card"><div class="spec-card-title">Total heat loss</div><div class="spec-card-value">${(totalW/1000).toFixed(2)} kW</div><div class="spec-card-sub">Full building at ${settings.designTempExt || -4}°C</div></div>
    <div class="spec-card"><div class="spec-card-title">Specific heat loss</div><div class="spec-card-value">${shl} W/m²</div><div class="spec-card-sub">Used for MCS 031 SPF lookup</div></div>
    <div class="spec-card"><div class="spec-card-title">Recommended HP</div><div class="spec-card-value">≥ ${Math.ceil(totalW/1000)} kW</div><div class="spec-card-sub">Minimum rated output required</div></div>
    <div class="spec-card"><div class="spec-card-title">Flow temperature</div><div class="spec-card-value">${flowTemp}°C</div><div class="spec-card-sub">Design flow / ${(systemSpec.returnTemp || 40)}°C return</div></div>
  </div>

  <!-- Proposed system -->
  <div class="section-heading">Proposed System</div>
  
  <!-- Heat pump -->
  ${systemSpec.hpModel ? `
  <div class="product-card">
    <div class="product-header">
      <div>
        <div class="product-brand">Heat pump</div>
        <div class="product-name">${systemSpec.hpManufacturer || ''} ${systemSpec.hpModel}</div>
      </div>
      <div>
        <span class="product-badge">MCS Listed</span>
        ${job.bus_eligible ? '<span class="product-badge" style="margin-left:6px;background:#f59e0b">BUS Eligible</span>' : ''}
      </div>
    </div>
    <div class="product-specs">
      <div class="product-spec-item"><span class="product-spec-label">Rated output</span><span class="product-spec-value">${systemSpec.hpOutputKw || '—'} kW</span></div>
      <div class="product-spec-item"><span class="product-spec-label">Sound power</span><span class="product-spec-value">${systemSpec.hpSoundPowerDb || '—'} dB(A)</span></div>
      <div class="product-spec-item"><span class="product-spec-label">Refrigerant</span><span class="product-spec-value">R290</span></div>
    </div>
  </div>
  ` : '<p style="color:#6b7280;font-size:11px;margin-bottom:12px">Heat pump not yet selected.</p>'}

  <!-- Cylinder -->
  ${systemSpec.cylinderModel ? `
  <div class="product-card" style="border-color:#3b82f6">
    <div class="product-header">
      <div>
        <div class="product-brand">Hot water cylinder</div>
        <div class="product-name">${systemSpec.cylinderManufacturer || ''} ${systemSpec.cylinderModel}</div>
      </div>
      <span class="product-badge" style="background:#3b82f6">Unvented</span>
    </div>
    <div class="product-specs">
      <div class="product-spec-item"><span class="product-spec-label">Capacity</span><span class="product-spec-value">${systemSpec.cylinderSizeLitres || '—'} L</span></div>
      <div class="product-spec-item"><span class="product-spec-label">Type</span><span class="product-spec-value">${systemSpec.cylinderType || 'Indirect'}</span></div>
      <div class="product-spec-item"><span class="product-spec-label">MIS 3005-D</span><span class="product-spec-value">✓ Compliant</span></div>
    </div>
  </div>
  ` : ''}

  <!-- MCS 031 performance -->
  <div class="section-heading">MCS 031 v4.0 — Performance Estimate</div>
  <div class="mcs-box">
    <div class="mcs-title">Estimated annual performance — mandatory disclosure (MCS 031 Issue 4.0, March 2025)</div>
    <div class="mcs-grid">
      <div class="mcs-item"><span class="mcs-label">Seasonal Performance</span><span class="mcs-value">${spf}</span><span class="mcs-label">SPF (MCS 031 Table 2)</span></div>
      <div class="mcs-item"><span class="mcs-label">Star Rating</span><span class="mcs-value stars">${'★'.repeat(stars)}${'☆'.repeat(6-stars)}</span><span class="mcs-label">${stars}/6 stars</span></div>
      <div class="mcs-item"><span class="mcs-label">Annual heat demand</span><span class="mcs-value">${annualHeat.toLocaleString()}</span><span class="mcs-label">kWh/year</span></div>
      <div class="mcs-item"><span class="mcs-label">Annual electricity</span><span class="mcs-value">${(annualElec+annualDhw).toLocaleString()}</span><span class="mcs-label">kWh/year (space + DHW)</span></div>
    </div>
    <div class="mcs-disclosure">
      <strong>Mandatory customer disclosure (MCS 031 Issue 4.0):</strong> This is not a detailed system design. It offers a reasonable estimate of likely performance based on the heat loss calculation above. Details may change following the full survey. Estimated annual electricity consumption: <strong>${(annualElec+annualDhw).toLocaleString()} kWh/year</strong> (indicative range: ${Math.round((annualElec+annualDhw)*0.9).toLocaleString()}–${Math.round((annualElec+annualDhw)*1.1).toLocaleString()} kWh/year). This estimate must be provided to the customer before any contract is signed.
    </div>
  </div>

  <!-- Noise assessment -->
  ${noiseAssessment.assessmentPoints?.length > 0 ? `
  <div class="section-heading">MCS 020(a) — Noise Assessment</div>
  <div class="noise-box ${noiseAssessment.overallPass ? 'noise-pass' : 'noise-fail'}">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:12px;font-weight:700;color:${noiseAssessment.overallPass ? '#059669' : '#dc2626'}">${noiseAssessment.overallPass ? '✓ MCS 020(a) Compliant' : '✗ MCS 020(a) Non-Compliant'}</div>
        <div style="font-size:10px;color:#6b7280;margin-top:3px">${noiseAssessment.assessmentPoints.length} assessment point(s) · Limit: 37 dB(A)</div>
      </div>
      <div style="font-size:24px;font-weight:800;color:${noiseAssessment.overallPass ? '#059669' : '#dc2626'}">${Math.max(...noiseAssessment.assessmentPoints.map((p: any) => p.result))} dB</div>
    </div>
  </div>
  ` : ''}

  <!-- BUS grant -->
  ${job.bus_eligible ? `
  <div class="section-heading">Boiler Upgrade Scheme (BUS)</div>
  <div class="bus-box">
    <div class="bus-title">🏷 BUS Grant — £7,500 available</div>
    <div style="font-size:10px;color:#92400e;line-height:1.6">
      This property appears eligible for the Boiler Upgrade Scheme grant of <strong>£7,500</strong> toward the installation cost of an air source heat pump. 
      Grant eligibility is subject to confirmation of a valid EPC (Band D or above, no outstanding loft or cavity wall insulation recommendations) 
      and application approval by Ofgem. The grant is paid directly to the installer and deducted from the customer invoice.
    </div>
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="proposal-footer">
    <div class="mcs-logo-bar">
      <span class="mcs-badge">MCS Accredited</span>
      <span class="mcs-badge" style="background:#3b82f6">MIS 3005-D</span>
      <span class="mcs-badge" style="background:#7c3aed">BS EN 12831-1:2017</span>
    </div>
    <div class="footer-text">
      This proposal has been prepared by an installer operating under the Enerus Plus MCS Umbrella Scheme. 
      Heat loss calculated in accordance with BS EN 12831-1:2017 and MIS 3005-D. 
      Performance estimates comply with MCS 031 Issue 4.0 (mandatory from 18 March 2025). 
      Noise assessment conducted in accordance with MCS 020(a) Issue 2 (mandatory from 20 September 2025 for PDR installations in England).
      All figures are estimates based on survey data and standard assumptions. Final specification may be subject to change following detailed site survey.
      This proposal is valid for 30 days from the date of preparation.
    </div>
  </div>

</div>

<!-- Print button (hidden when printing) -->
<div class="print-bar no-print">
  <button class="btn btn-outline" onclick="window.history.back()">← Back</button>
  <button class="btn" onclick="window.print()">Print / Save PDF</button>
</div>

</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}