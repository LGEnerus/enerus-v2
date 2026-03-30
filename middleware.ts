import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC = ['/login', '/register', '/onboarding', '/portal', '/pricing', '/api/stripe', '/api/pdf']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const pathname = req.nextUrl.pathname

  if (PUBLIC.some(p => pathname.startsWith(p))) return res
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) return res

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) { res.cookies.set({ name, value, ...options }) },
        remove(name: string, options: CookieOptions) { res.cookies.set({ name, value: '', ...options }) },
      },
    }
  )
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: user, error: userError } = await (supabase as any)
      .from('users')
      .select('account_id')
      .eq('id', session.user.id)
      .single()

    // If query fails, let through — don't block on DB errors
    if (userError || !user) return res

    if (!user.account_id) {
      return NextResponse.redirect(new URL('/onboarding', req.url))
    }

    // Check account status separately to avoid join issues
    const { data: account, error: accError } = await (supabase as any)
      .from('accounts')
      .select('status, trial_ends_at')
      .eq('id', user.account_id)
      .single()

    // If account query fails, let through
    if (accError || !account) return res

    const { status, trial_ends_at } = account
    const isSettings = pathname.startsWith('/settings')
    const isPricing = pathname.startsWith('/pricing')

    // Trial expired
    if (status === 'trial' && trial_ends_at && new Date(trial_ends_at) < new Date()) {
      if (!isSettings && !isPricing) {
        return NextResponse.redirect(new URL('/pricing', req.url))
      }
    }

    // Cancelled or past due
    if ((status === 'cancelled' || status === 'past_due') && !isSettings && !isPricing) {
      return NextResponse.redirect(new URL('/pricing', req.url))
    }

  } catch {
    // Any unexpected error — let through, don't block
    return res
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}