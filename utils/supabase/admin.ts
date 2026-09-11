import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Client con la secret key: bypassa la RLS e puo' scrivere in auth.users.
 * Usarlo SOLO dentro server action, e solo dopo requireAdmin().
 *
 * La variabile non ha il prefisso NEXT_PUBLIC_ proprio perche' non deve
 * mai finire nel bundle del browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY

  if (!key) {
    throw new Error(
      'SUPABASE_SECRET_KEY non configurata. Senza, non si possono creare o eliminare utenti.'
    )
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function hasAdminKey() {
  return Boolean(process.env.SUPABASE_SECRET_KEY)
}
