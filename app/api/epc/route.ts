import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const postcode = req.nextUrl.searchParams.get('postcode')
  const address = req.nextUrl.searchParams.get('address')

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
    if (address) params.append('address', address)

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
      return NextResponse.json({ error: 'EPC API error', status: res.status }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch EPC data' }, { status: 500 })
  }
}