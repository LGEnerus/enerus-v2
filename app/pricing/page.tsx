'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PLANS = [
  {
    id: 'solo',
    name: 'Basic',  // plan: solo
    price: 15,
    period: 'month',
    description: 'Perfect for sole traders',
    colour: 'border-gray-700',
    badge: null,
    features: [
      'Unlimited quotes & invoices',
      'Up to 50 customers',
      'Job management',
      'Calendar view',
      'Compliance tracker',
      'Business costs',
      'Calculator tools',
      'PDF generation',
      'Email support',
    ],
    missing: [
      'Time tracking',
      'Team members (1 only)',
      'VAT return builder',
      'Customer portal',
      'MCS compliance module',
    ],
  },
  {
    id: 'business',
    name: 'Premium',  // plan: business
    price: 30,
    period: 'month',
    description: 'For growing trade businesses',
    colour: 'border-amber-500/50',
    badge: 'Most popular',
    features: [
      'Everything in Basic',
      'Unlimited customers',
      'Up to 5 team members',
      'Time tracking & timesheets',
      'VAT return builder (MTD)',
      'Customer portal',
      'MCS compliance module',
      'Email open tracking',
      'Priority support',
    ],
    missing: [],
  },
]

export default function PricingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function subscribe(planId: string) {
    setLoading(planId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-12">

      {/* Logo */}
      <div className="mb-10">
        <svg viewBox="0 0 200 46" width="180" height="42" xmlns="http://www.w3.org/2000/svg">
          <text x="0" y="34" fontFamily="system-ui, -apple-system, sans-serif" fontSize="34" fontWeight="800" fill="#9ca3af" letterSpacing="-0.5">trade stack</text>
          <text x="198" y="44" textAnchor="end" fontFamily="system-ui, -apple-system, sans-serif" fontSize="11" fontWeight="400" fill="#4b5563" letterSpacing="0.3">by enerus</text>
        </svg>
      </div>

      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-white mb-2">Choose your plan</h1>
        <p className="text-gray-500 text-sm">Your 14-day free trial has ended. Subscribe to keep access.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-2xl">
        {PLANS.map(plan => (
          <div key={plan.id} className={`bg-gray-900 border-2 rounded-2xl p-6 flex flex-col relative ${plan.colour}`}>
            {plan.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-gray-950 text-xs font-bold px-3 py-1 rounded-full">
                {plan.badge}
              </div>
            )}

            <div className="mb-5">
              <div className="text-lg font-bold text-white">{plan.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{plan.description}</div>
              <div className="flex items-baseline gap-1 mt-3">
                <span className="text-4xl font-bold text-white">£{plan.price}</span>
                <span className="text-gray-500 text-sm">/month</span>
              </div>
              <div className="text-xs text-gray-600 mt-1">Billed monthly · cancel anytime</div>
            </div>

            <div className="flex-1 space-y-2 mb-6">
              {plan.features.map(f => (
                <div key={f} className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-400 flex-shrink-0">✓</span>
                  <span className="text-gray-300">{f}</span>
                </div>
              ))}
              {plan.missing.map(f => (
                <div key={f} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-700 flex-shrink-0">✕</span>
                  <span className="text-gray-600">{f}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => subscribe(plan.id)}
              disabled={loading === plan.id}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${
                plan.id === 'premium'
                  ? 'bg-amber-500 hover:bg-amber-400 text-gray-950'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              } disabled:opacity-50`}>
              {loading === plan.id ? 'Loading…' : `Start with ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 text-xs text-gray-700 text-center space-y-1">
        <div>Payments processed securely by Stripe</div>
        <div>Cancel anytime from your account settings</div>
      </div>
    </div>
  )
}