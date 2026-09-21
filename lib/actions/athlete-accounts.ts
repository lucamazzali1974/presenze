'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { guard, requireProfile } from '@/lib/auth'
import { toUsername, usernameError, usernameToEmail } from '@/lib/username'
import type { Athlete } from '@/lib/types'

type Result = { ok?: true; username?: string; error?: string }

function refresh() {
  revalidatePath('/atleti')
  revalidatePath('/admin/users')
  revalidatePath('/')
}

/**
 * Crea in un colpo solo l'accesso di un giocatore: utente in auth,
 * profilo con ruolo 'athlete' gia' attivo, e collegamento alla scheda.
 * Se uno dei passaggi dopo la creazione fallisce l'utente appena creato
 * viene eliminato: meglio niente che un account orfano che entra e non
 * ha una scheda da segnare.
 */
export async function createAthleteAccount(
  athleteId: string,
  formData: FormData
): Promise<Result> {
  const denied = await guard('utenti')
  if (denied) return denied

  const username = toUsername(String(formData.get('username') ?? ''))
  const password = String(formData.get('password') ?? '')

  const nameError = usernameError(username)
  if (nameError) return { error: nameError }
  if (password.length < 8) {
    return { error: 'La password deve avere almeno 8 caratteri.' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { data: athleteRow, error: athleteError } = await admin
    .from('athletes')
    .select('*')
    .eq('id', athleteId)
    .maybeSingle()

  if (athleteError) return { error: athleteError.message }
  if (!athleteRow) return { error: 'Giocatore non trovato.' }

  const athlete = athleteRow as Athlete
  if (athlete.profile_id) {
    return { error: 'Questo giocatore ha già un accesso.' }
  }

  const fullName = `${athlete.first_name} ${athlete.last_name}`

  const { data, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (error) {
    return {
      error: error.message.includes('already')
        ? 'Questo nome utente è già in uso: scegline un altro.'
        : error.message,
    }
  }

  const userId = data.user.id

  // Il trigger ha creato il profilo come 'user' in attesa: lo porto al
  // ruolo giusto, gia' attivo, visto che lo sta creando un admin.
  const { error: profileError } = await admin
    .from('profiles')
    .update({ full_name: fullName, role: 'athlete', status: 'active' })
    .eq('id', userId)

  if (profileError) {
    await admin.auth.admin.deleteUser(userId)
    return { error: profileError.message }
  }

  const { error: linkError } = await admin
    .from('athletes')
    .update({ profile_id: userId })
    .eq('id', athleteId)

  if (linkError) {
    await admin.auth.admin.deleteUser(userId)
    return { error: linkError.message }
  }

  refresh()
  return { ok: true, username }
}

/** Nuova password, comunicata a voce: l'app non manda email. */
export async function resetAthletePassword(
  profileId: string,
  formData: FormData
): Promise<Result> {
  const denied = await guard('utenti')
  if (denied) return denied

  const password = String(formData.get('password') ?? '')
  if (password.length < 8) {
    return { error: 'La password deve avere almeno 8 caratteri.' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { error } = await admin.auth.admin.updateUserById(profileId, { password })
  if (error) return { error: error.message }

  return { ok: true }
}

/**
 * Toglie l'accesso. Il giocatore resta in rosa con tutte le sue
 * presenze: athletes.profile_id e' "on delete set null", quindi si
 * scollega da solo. Da qui in poi lo segna l'allenatore, come prima.
 */
export async function removeAthleteAccount(profileId: string): Promise<Result> {
  const denied = await guard('utenti')
  if (denied) return denied
  const me = await requireProfile()

  if (profileId === me.id) {
    return { error: 'Non puoi eliminare il tuo stesso account.' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { error } = await admin.auth.admin.deleteUser(profileId)
  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}
