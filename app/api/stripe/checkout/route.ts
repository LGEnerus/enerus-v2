import { NextRequest, NextResponse } from 'next/server'
// Run: npm install stripe
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Stripe price IDs — create these in Stripe dashboard
// Products: Basic (£15/mo) and Premium (£30/mo)
const PRICE_IDS: Record<string, string> = {
  basic:   process.env.STRIPE_PRICE_BASIC   || '',
  premium: process.env.STRIPE_PRICE_PREMIUM || '',
}

export async function POST(req: NextRequest) {
  try {
    const { plan } = await req.json()

    // Get current user's account
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    let accountId = ''
    let email = ''

    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: u } = await (supabase as any)
          .from('users')
          .select('account_id, email, accounts(stripe_customer_id)')
          .eq('id', user.id)
          .single()
        accountId = u?.account_id || ''
        email = u?.email || user.email || ''
      }
    }

    const priceId = PRICE_IDS[plan]
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://enerus-v2.vercel.app'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?subscribed=1`,
      cancel_url: `${appUrl}/pricing`,
      customer_email: email || undefined,
      metadata: {
        account_id: accountId,
        plan,
      },
      subscription_data: {
        metadata: { account_id: accountId, plan },
        trial_period_days: 0, // Trial handled by app logic, not Stripe
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}