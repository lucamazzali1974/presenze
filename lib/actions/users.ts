'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireAdmin } from '@/lib/auth'

type Role = 'user' | 'admin' | 'athlete'

/** Un valore fuori elenco verrebbe comunque respinto dal check in database. */
function readRole(formData: FormData): Role {
  const raw = String(formData.get('role') ?? 'user')
  return raw === 'admin' || raw === 'athlete' ? raw : 'user'
}

type Result = { ok?: true; error?: string }

/** Crea un utente gia' attivo, senza passare dalla registrazione. */
export async function createUser(formData: FormData): Promise<Result> {
  await requireAdmin()

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const full_name = String(formData.get('full_name') ?? '').trim()
  const role = readRole(formData)

  if (!email) return { error: 'L’email è obbligatoria.' }
  if (password.length < 8) {
    return { error: 'La password deve avere almeno 8 caratteri.' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  })

  if (error) {
    return {
      error: error.message.includes('already')
        ? 'Esiste già un utente con questa email.'
        : error.message,
    }
  }

  // Il trigger ha creato il profilo con status 'pending': lo attivo subito,
  // visto che lo sta creando un admin.
  const { error: profileError } = await admin
    .from('profiles')
    .update({ full_name: full_name || null, role, status: 'active' })
    .eq('id', data.user.id)

  if (profileError) return { error: profileError.message }

  revalidatePath('/admin/users')
  return { ok: true }
}

/** Aggiorna nome, ruolo e stato. */
export async function updateUser(
  id: string,
  formData: FormData
): Promise<Result> {
  const me = await requireAdmin()

  const full_name = String(formData.get('full_name') ?? '').trim()
  const role = readRole(formData)
  const status = String(formData.get('status') ?? 'pending') as
    | 'pending'
    | 'active'
    | 'blocked'

  if (id === me.id && (role !== 'admin' || status !== 'active')) {
    return { error: 'Non puoi togliere a te stesso il ruolo admin o l’accesso.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: full_name || null, role, status })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return { ok: true }
}

/** Scorciatoie usate dai bottoni rapidi nella lista. */
export async function setUserStatus(
  id: string,
  status: 'pending' | 'active' | 'blocked'
): Promise<Result> {
  const me = await requireAdmin()

  if (id === me.id && status !== 'active') {
    return { error: 'Non puoi bloccare il tuo stesso account.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ status }).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return { ok: true }
}

export async function setUserRole(
  id: string,
  role: Role
): Promise<Result> {
  const me = await requireAdmin()

  if (id === me.id && role !== 'admin') {
    return { error: 'Non puoi togliere il ruolo admin a te stesso.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return { ok: true }
}

/** Imposta una nuova password senza passare dall'email. */
export async function setUserPassword(
  id: string,
  password: string
): Promise<Result> {
  await requireAdmin()

  if (password.length < 8) {
    return { error: 'La password deve avere almeno 8 caratteri.' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { error } = await admin.auth.admin.updateUserById(id, { password })
  if (error) return { error: error.message }

  return { ok: true }
}

/** Elimina l'utente: sparisce anche il profilo, per cascata. */
export async function deleteUser(id: string): Promise<Result> {
  const me = await requireAdmin()

  if (id === me.id) return { error: 'Non puoi eliminare il tuo stesso account.' }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return { ok: true }
}
