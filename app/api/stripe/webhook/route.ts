import { NextRequest, NextResponse } from 'next/server'
// Run: npm install stripe
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
})

// Service role needed here - webhook has no user session
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body, sig, process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.CheckoutSession
      const accountId = session.metadata?.account_id
      const plan = session.metadata?.plan
      if (!accountId) break

      await db.from('accounts').update({
        plan: plan || 'basic',
        status: 'active',
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        updated_at: new Date().toISOString(),
      }).eq('id', accountId)
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const accountId = sub.metadata?.account_id
      if (!accountId) break

      const status = sub.status === 'active' ? 'active'
        : sub.status === 'past_due' ? 'past_due'
        : sub.status === 'canceled' ? 'cancelled'
        : 'active'

      const plan = sub.metadata?.plan || 'basic'

      await db.from('accounts').update({
        status, plan,
        updated_at: new Date().toISOString(),
      }).eq('id', accountId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const accountId = sub.metadata?.account_id
      if (!accountId) break

      await db.from('accounts').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', accountId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      if (!customerId) break

      await db.from('accounts').update({
        status: 'past_due',
        updated_at: new Date().toISOString(),
      }).eq('stripe_customer_id', customerId)
      break
    }
  }

  return NextResponse.json({ received: true })
}