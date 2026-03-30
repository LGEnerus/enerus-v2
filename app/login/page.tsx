'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      // Small delay to ensure session is stored before navigation
      await new Promise(r => setTimeout(r, 100))

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: userData } = await (supabase as any)
          .from('users')
          .select('role, account_id')
          .eq('id', data.user.id)
          .single()

        if (!userData?.account_id) {
          window.location.href = '/onboarding'
        } else if (userData.role === 'admin') {
          window.location.href = '/admin'
        } else {
          window.location.href = '/dashboard'
        }
      } catch {
        window.location.href = '/dashboard'
      }
    } else {
      setError('Sign in failed — please try again')
      setLoading(false)
    }
  }

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

<div className="flex items-center justify-center mb-10">
  <svg viewBox="0 0 200 46" width="200" height="46" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="34" fontFamily="system-ui, -apple-system, sans-serif" fontSize="34" fontWeight="800" fill="#9ca3af" letterSpacing="-0.5">trade stack</text>
    <text x="198" y="44" textAnchor="end" fontFamily="system-ui, -apple-system, sans-serif" fontSize="11" fontWeight="400" fill="#4b5563" letterSpacing="0.3">by enerus</text>
  </svg>
</div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h1 className="text-lg font-bold text-white mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 mb-6">Welcome back</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required className={inp}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required className={inp}/>
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl px-4 py-3">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-gray-950 text-sm font-bold py-3 rounded-xl transition-colors mt-2">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-xs text-gray-600 text-center mt-6">
            No account?{' '}
            <Link href="/register" className="text-amber-400 hover:text-amber-300 font-medium">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}