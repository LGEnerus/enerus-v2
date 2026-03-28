'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) { setError(error.message); setLoading(false); return }

    if (data.session) {
      window.location.replace('/onboarding')
    } else {
      setDone(true)
    }
    setLoading(false)
  }

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"

  if (done) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
        <p className="text-sm text-gray-500 mb-2">
          We sent a confirmation link to <span className="text-amber-400">{email}</span>
        </p>
        <p className="text-xs text-gray-600 mb-6">
          Click the link in the email to activate your account and continue setup.
        </p>
        <Link href="/login" className="text-xs text-amber-400 hover:text-amber-300">
          Back to sign in →
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

<div className="flex items-center justify-center mb-10">
  <svg viewBox="0 0 200 46" width="200" height="46" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="34" fontFamily="system-ui, -apple-system, sans-serif" fontSize="34" fontWeight="800" fill="#9ca3af" letterSpacing="-0.5">trade stack</text>
    <text x="124" y="44" fontFamily="system-ui, -apple-system, sans-serif" fontSize="11" fontWeight="400" fill="#4b5563" letterSpacing="0.2">by enerus</text>
  </svg>
</div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h1 className="text-lg font-bold text-white mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-6">Free 30-day trial — no card required</p>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@yourcompany.co.uk" required className={inp}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters" required className={inp}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Confirm password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" required className={inp}/>
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl px-4 py-3">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-gray-950 text-sm font-bold py-3 rounded-xl transition-colors">
              {loading ? 'Creating account…' : 'Create account →'}
            </button>
          </form>

          <p className="text-xs text-gray-600 text-center mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-amber-400 hover:text-amber-300 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}