'use server'

import { createClient } from '@/utils/supabase/server'
import { requireProfile } from '@/lib/auth'

type Result = { ok?: true; error?: string }

export type PushSubscriptionInput = {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}

/**
 * Registra il telefono. L'endpoint e' unico: se lo stesso dispositivo si
 * riscrive (succede quando il browser ruota le chiavi) la riga esistente
 * viene aggiornata invece di crearne una seconda.
 */
export async function saveSubscription(
  sub: PushSubscriptionInput
): Promise<Result> {
  const profile = await requireProfile()
  const supabase = await createClient()

  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    return { error: 'Iscrizione incompleta: riprova.' }
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: profile.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )

  if (error) return { error: error.message }
  return { ok: true }
}

export async function removeSubscription(endpoint: string): Promise<Result> {
  await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)

  if (error) return { error: error.message }
  return { ok: true }
}

/** Quante iscrizioni ha questo account: serve a dire "attive su N dispositivi". */
export async function countMySubscriptions(): Promise<number> {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { count } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id)

  return count ?? 0
}
