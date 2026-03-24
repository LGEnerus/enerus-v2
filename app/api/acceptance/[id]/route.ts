// app/api/acceptance/[id]/route.ts
// POST /api/acceptance/[id] — creates acceptance record and returns link

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id
  try {
    const { data: job } = await supabase.from('jobs').select('*, customers(*)').eq('id', jobId).single() as any
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const { data: customer } = await supabase.from('customers').select('*').eq('id', job.customer_id).single() as any
    const { data: design } = await supabase.from('system_designs').select('*').eq('job_id', jobId).single() as any
    const { data: ip } = await supabase.from('installer_profiles').select('*').eq('user_id', job.installer_id).single() as any

    // Check for existing acceptance
    const { data: existing } = await supabase.from('customer_acceptances').select('acceptance_token').eq('job_id', jobId).single() as any
    if (existing?.acceptance_token) {
      const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://enerus-v2.vercel.app'}/accept/${existing.acceptance_token}`
      return NextResponse.json({ url, token: existing.acceptance_token, existing: true })
    }

    const token = randomBytes(32).toString('hex')

    const di = design?.design_inputs || {}
    const proposalSnapshot = {
      installerName: ip?.company_name || 'Enerus Plus Installer',
      installerLogoUrl: ip?.logo_url || null,
      installerPrimaryColour: ip?.primary_colour || '#059669',
      hpModel: di.systemSpec?.hpModel,
      cylinderModel: di.systemSpec?.cylinderModel,
      totalHeatLossKw: design?.total_heat_loss_w ? (design.total_heat_loss_w / 1000).toFixed(2) : null,
      spf: design?.scop_estimate,
      annualElecKwh: null,
      busGrant: job.bus_eligible ? 7500 : null,
    }

    await supabase.from('customer_acceptances').insert({
      job_id: jobId,
      acceptance_token: token,
      customer_name: `${customer?.first_name} ${customer?.last_name}`.trim(),
      customer_email: customer?.email,
      proposal_snapshot: proposalSnapshot,
      sent_at: new Date().toISOString(),
    })

    // Mark acceptance stage in progress
    await supabase.from('job_stages').update({ status: 'in_progress' }).eq('job_id', jobId).eq('stage', 'acceptance')

    const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://enerus-v2.vercel.app'}/accept/${token}`
    return NextResponse.json({ url, token })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}