import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register', '/auth']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: getUser() deve stare subito dopo createServerClient, senza
  // codice in mezzo. E' questa chiamata che rinnova il token di sessione.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(p + '/')
  )

  if (!user) {
    return isPublic
      ? supabaseResponse
      : redirectTo('/login', request, supabaseResponse)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  const status = profile?.status ?? 'pending'

  if (status !== 'active') {
    return path === '/pending'
      ? supabaseResponse
      : redirectTo('/pending', request, supabaseResponse)
  }

  if (isPublic || path === '/pending') {
    return redirectTo('/', request, supabaseResponse)
  }

  if (path.startsWith('/admin') && profile?.role !== 'admin') {
    return redirectTo('/', request, supabaseResponse)
  }

  return supabaseResponse
}

// Il redirect deve portarsi dietro i cookie di sessione aggiornati,
// altrimenti il refresh del token appena fatto viene buttato via.
function redirectTo(pathname: string, request: NextRequest, from: NextResponse) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''

  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}
