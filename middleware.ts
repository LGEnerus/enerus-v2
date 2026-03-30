import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC = [
  '/login', '/register', '/onboarding',
  '/portal', '/pricing',
  '/api/stripe', '/api/pdf',
]

export async function middleware(req: NextRequest) {
  // Must create a new response to allow cookie mutation
  let res = NextResponse.next({
    request: { headers: req.headers },
  })

  const pathname = req.nextUrl.pathname

  // Always allow public paths
  if (PUBLIC.some(p => pathname.startsWith(p))) return res
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) return res

  // Skip if no Supabase URL configured (prevents build-time errors)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return res
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // Must update both request and response cookies
          req.cookies.set({ name, value, ...options })
          res = NextResponse.next({
            request: { headers: req.headers },
          })
          res.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: '', ...options })
          res = NextResponse.next({
            request: { headers: req.headers },
          })
          res.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refresh session — this is required to keep the session alive
  const { data: { session } } = await supabase.auth.getSession()

  // Not logged in — redirect to login
  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Subscription gating — only if we have a session
  try {
    const { data: user } = await (supabase as any)
      .from('users')
      .select('account_id')
      .eq('id', session.user.id)
      .single()

    if (!user) return res
    if (!user.account_id) {
      const url = req.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }

    const { data: account } = await (supabase as any)
      .from('accounts')
      .select('status, trial_ends_at')
      .eq('id', user.account_id)
      .single()

    if (!account) return res

    const isSettings = pathname.startsWith('/settings')
    const isPricing = pathname.startsWith('/pricing')
    const { status, trial_ends_at } = account

    if (status === 'trial' && trial_ends_at && new Date(trial_ends_at) < new Date()) {
      if (!isSettings && !isPricing) {
        const url = req.nextUrl.clone()
        url.pathname = '/pricing'
        return NextResponse.redirect(url)
      }
    }

    if ((status === 'cancelled' || status === 'past_due') && !isSettings && !isPricing) {
      const url = req.nextUrl.clone()
      url.pathname = '/pricing'
      return NextResponse.redirect(url)
    }

  } catch {
    // DB errors must not block users
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}