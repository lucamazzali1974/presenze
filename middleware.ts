import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Fuori dal middleware:
     *   api/      le route API si autenticano da sole. Il job dei
     *             promemoria non ha una sessione, quindi qui veniva
     *             rimbalzato al login con un 307 — e un cron non segue
     *             i redirect: il promemoria non e' mai partito.
     *   sw.js, manifest, offline.html e le icone: se finiscono al login,
     *             l'installazione della web app non parte.
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
