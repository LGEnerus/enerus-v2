import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const postcode = req.nextUrl.searchParams.get('postcode')

  if (!postcode) {
    return NextResponse.json({ error: 'Postcode required' }, { status: 400 })
  }

  const apiKey = process.env.EPC_API_KEY
  const email = process.env.EPC_API_EMAIL || 'lee@enerus.co.uk'

  try {
    const params = new URLSearchParams({
      postcode: postcode.replace(/\s/g, ''),
      'page-size': '10',
    })

    const res = await fetch(
      `https://epc.opendatacommunities.org/api/v1/domestic/search?${params}`,
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`,
        },
      }
    )

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: 'EPC API error', status: res.status, detail: text }, { status: res.status })
    }

    const data = await res.json()

    // The EPC API returns hyphenated field names — map them to camelCase/underscore for easier use
    const rows = (data.rows || []).map((row: Record<string, string>) => ({
      lmk_key: row['lmk-key'],
      address1: row['address1'],
      address2: row['address2'],
      address3: row['address3'],
      postcode: row['postcode'],
      property_type: row['property-type'],
      built_form: row['built-form'],
      inspection_date: row['inspection-date'],
      current_energy_rating: row['current-energy-rating'],
      potential_energy_rating: row['potential-energy-rating'],
      total_floor_area: row['total-floor-area'],
      construction_age_band: row['construction-age-band'],
      main_fuel: row['main-fuel'],
      walls_description: row['walls-description'],
      roof_description: row['roof-description'],
      windows_description: row['windows-description'],
      floor_description: row['floor-description'],
      hot_water_description: row['hot-water-description'],
      mainheat_description: row['mainheat-description'],
      mainheatc_description: row['mainheatc-description'],
      lighting_description: row['lighting-description'],
      energy_consumption_current: row['energy-consumption-current'],
      energy_cost_current: row['energy-cost-current'],
      energy_cost_potential: row['energy-cost-potential'],
      co2_emissions_current: row['co2-emissions-current'],
      number_habitable_rooms: row['number-habitable-rooms'],
      heating_cost_current: row['heating-cost-current'],
      hot_water_cost_current: row['hot-water-cost-current'],
      lighting_cost_current: row['lighting-cost-current'],
      low_energy_lighting: row['low-energy-lighting'],
      tenure: row['tenure'],
      local_authority: row['local-authority'],
      constituency: row['constituency'],
      county: row['county'],
    }))

    return NextResponse.json({ rows, total: data.total || rows.length })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch EPC data', detail: String(err) }, { status: 500 })
  }
}