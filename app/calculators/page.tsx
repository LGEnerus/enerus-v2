'use client'

import { useState } from 'react'
import Link from 'next/link'

const CALCULATORS = [
  {
    slug: 'radiator',
    title: 'Radiator sizing',
    description: 'Calculate required radiator output for any room using BS EN 12831',
    icon: '🌡',
    colour: 'from-orange-900/40 to-red-900/20 border-orange-700/30',
    accent: 'text-orange-400',
  },
  {
    slug: 'cable',
    title: 'Cable sizing',
    description: 'Calculate correct cable CSA for circuits per BS 7671 18th edition',
    icon: '⚡',
    colour: 'from-yellow-900/40 to-amber-900/20 border-yellow-700/30',
    accent: 'text-yellow-400',
  },
  {
    slug: 'gas-rate',
    title: 'Gas rate',
    description: 'Calculate appliance gas rate from meter readings in m³ or ft³',
    icon: '🔥',
    colour: 'from-blue-900/40 to-cyan-900/20 border-blue-700/30',
    accent: 'text-blue-400',
  },
  {
    slug: 'pipe',
    title: 'Pipe sizing',
    description: 'Size central heating pipework for flow rate and velocity',
    icon: '🔧',
    colour: 'from-emerald-900/40 to-teal-900/20 border-emerald-700/30',
    accent: 'text-emerald-400',
  },
  {
    slug: 'ventilation',
    title: 'Ventilation',
    description: 'Permanent vent sizing for open flued and flueless appliances',
    icon: '💨',
    colour: 'from-purple-900/40 to-violet-900/20 border-purple-700/30',
    accent: 'text-purple-400',
  },
]

export default function CalculatorsPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center sticky top-0 z-20">
        <h1 className="text-sm font-semibold text-white">Calculators</h1>
      </div>
      <div className="px-6 py-6 max-w-4xl mx-auto">
        <div className="text-xs text-gray-600 mb-6">
          Engineering reference tools. All calculations follow current UK standards.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CALCULATORS.map(c => (
            <Link key={c.slug} href={`/calculators/${c.slug}`}
              className={`bg-gradient-to-br ${c.colour} border rounded-2xl p-5 hover:brightness-110 transition-all group`}>
              <div className="text-3xl mb-3">{c.icon}</div>
              <div className={`text-base font-bold mb-1 ${c.accent}`}>{c.title}</div>
              <div className="text-xs text-gray-400 leading-relaxed">{c.description}</div>
              <div className={`text-xs mt-3 ${c.accent} opacity-0 group-hover:opacity-100 transition-opacity`}>
                Open calculator →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}