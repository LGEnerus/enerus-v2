'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (!rating) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: u } = await (supabase as any)
        .from('users').select('account_id').eq('id', session.user.id).single()

      await (supabase as any).from('feedback').insert({
        account_id: u?.account_id,
        user_id: session.user.id,
        rating,
        message: message || null,
        page: window.location.pathname,
      })

      setDone(true)
      setTimeout(() => { setOpen(false); setDone(false); setRating(0); setMessage('') }, 2000)
    } catch { /* silent */ }
    setSaving(false)
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="absolute bottom-12 right-0 bg-gray-900 border border-gray-700 rounded-2xl p-5 w-72 shadow-2xl mb-2">
          {done ? (
            <div className="text-center py-4">
              <div className="text-2xl mb-2">🙏</div>
              <div className="text-sm font-medium text-white">Thanks for the feedback!</div>
            </div>
          ) : (
            <>
              <div className="text-sm font-semibold text-white mb-1">How's the platform?</div>
              <div className="text-xs text-gray-500 mb-3">Rate your experience</div>
              <div className="flex gap-1 mb-3">
                {[1,2,3,4,5].map(n => (
                  <button key={n}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setRating(n)}
                    className={`text-2xl transition-transform hover:scale-110 ${n <= (hover || rating) ? 'text-amber-400' : 'text-gray-700'}`}>
                    ★
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Any comments? (optional)"
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-none mb-3"
                />
              )}
              <button
                onClick={submit}
                disabled={!rating || saving}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 text-xs font-bold py-2.5 rounded-xl transition-colors">
                {saving ? 'Sending…' : 'Send feedback'}
              </button>
            </>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen(p => !p)}
        className="w-10 h-10 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors shadow-lg"
        title="Share feedback">
        {open ? '×' : '💬'}
      </button>
    </div>
  )
}