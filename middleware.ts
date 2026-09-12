import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // sw.js, manifest e offline.html devono restare fuori: se il middleware
    // li rimanda al login, l'installazione della web app non parte.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
