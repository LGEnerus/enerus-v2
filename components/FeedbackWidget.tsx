'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserId(session.user.id)
      const { data: u } = await (supabase as any)
        .from('users').select('account_id').eq('id', session.user.id).single()
      if (u?.account_id) setAccountId(u.account_id)
    }
    load()
  }, [])

  async function submit() {
    if (!rating) return
    setSaving(true)
    try {
      await (supabase as any).from('feedback').insert({
        account_id: accountId || null,
        user_id: userId || null,
        rating,
        message: message.trim() || null,
        page: typeof window !== 'undefined' ? window.location.pathname : null,
      })
      setDone(true)
      setTimeout(() => {
        setOpen(false)
        setDone(false)
        setRating(0)
        setHovered(0)
        setMessage('')
      }, 2500)
    } catch {
      // silent — don't block users on feedback errors
    }
    setSaving(false)
  }

  function close() {
    setOpen(false)
    setRating(0)
    setHovered(0)
    setMessage('')
    setDone(false)
  }

  const displayRating = hovered || rating

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">

      {/* Popover */}
      {open && (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-72 overflow-hidden">
          {done ? (
            <div className="py-8 text-center px-5">
              <div className="text-3xl mb-3">🙏</div>
              <div className="text-sm font-semibold text-white mb-1">Thanks for the feedback!</div>
              <div className="text-xs text-gray-500">It helps us improve trade stack.</div>
            </div>
          ) : (
            <>
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold text-white">How's it going?</div>
                  <button onClick={close} className="text-gray-600 hover:text-gray-400 text-lg leading-none">×</button>
                </div>
                <div className="text-xs text-gray-500 mb-4">Rate your experience with trade stack</div>

                {/* Stars */}
                <div className="flex gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onMouseEnter={() => setHovered(n)}
                      onMouseLeave={() => setHovered(0)}
                      onClick={() => setRating(n)}
                      className="text-3xl transition-all hover:scale-110 focus:outline-none">
                      <span className={n <= displayRating ? 'text-amber-400' : 'text-gray-700'}>★</span>
                    </button>
                  ))}
                </div>

                {/* Rating label */}
                {displayRating > 0 && (
                  <div className="text-xs text-gray-500 mb-3 h-4">
                    {['', 'Poor', 'Not great', 'Okay', 'Good', 'Love it!'][displayRating]}
                  </div>
                )}

                {/* Comment */}
                {rating > 0 && (
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Any comments? What could be better?"
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-none mb-3"
                  />
                )}

                <button
                  onClick={submit}
                  disabled={!rating || saving}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:cursor-not-allowed text-gray-950 text-xs font-bold py-2.5 rounded-xl transition-colors">
                  {saving ? 'Sending…' : rating ? 'Send feedback' : 'Select a rating first'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(p => !p)}
        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all border ${
          open
            ? 'bg-gray-700 border-gray-600 text-gray-300 rotate-0'
            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200 hover:border-gray-600'
        }`}
        title="Share feedback">
        {open ? (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
          </svg>
        )}
      </button>
    </div>
  )
}