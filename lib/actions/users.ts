'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { guard, requireProfile } from '@/lib/auth'
import type { Role } from '@/lib/types'

type Result = { ok?: true; error?: string }

function refresh() {
  revalidatePath('/admin/users')
  revalidatePath('/atleti')
}

/**
 * Il ruolo arriva come id: si controlla che esista e che chi lo assegna
 * possa assegnarlo. Il tipo base 'admin' resta agli admin veri, altrimenti
 * chi ha "Utenti: modifica" si farebbe amministratore in due clic.
 */
async function readRoleId(
  formData: FormData
): Promise<{ id: string | null; error?: string }> {
  const raw = String(formData.get('role_id') ?? '').trim()
  if (!raw) return { id: null }

  const supabase = await createClient()
  const { data } = await supabase
    .from('roles')
    .select('*')
    .eq('id', raw)
    .maybeSingle()

  const role = data as Role | null
  if (!role) return { id: null, error: 'Ruolo non trovato.' }

  if (role.base === 'admin') {
    const me = await requireProfile()
    if (me.role !== 'admin') {
      return {
        id: null,
        error: 'Solo un amministratore può assegnare un ruolo di amministrazione.',
      }
    }
  }

  return { id: role.id }
}

/** Crea un utente gia' attivo, senza passare dalla registrazione. */
export async function createUser(formData: FormData): Promise<Result> {
  const denied = await guard('utenti')
  if (denied) return denied

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const full_name = String(formData.get('full_name') ?? '').trim()

  const role = await readRoleId(formData)
  if (role.error) return { error: role.error }

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

  // Il trigger ha creato il profilo col ruolo predefinito e status
  // 'pending': lo porto a quello scelto, gia' attivo.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: full_name || null,
      status: 'active',
      ...(role.id ? { role_id: role.id } : {}),
    })
    .eq('id', data.user.id)

  if (profileError) return { error: profileError.message }

  refresh()
  return { ok: true }
}

/** Aggiorna nome, ruolo e stato. */
export async function updateUser(id: string, formData: FormData): Promise<Result> {
  const denied = await guard('utenti')
  if (denied) return denied

  const me = await requireProfile()

  const full_name = String(formData.get('full_name') ?? '').trim()
  const status = String(formData.get('status') ?? 'pending') as
    | 'pending'
    | 'active'
    | 'blocked'

  const role = await readRoleId(formData)
  if (role.error) return { error: role.error }

  if (id === me.id) {
    if (status !== 'active') {
      return { error: 'Non puoi togliere l’accesso a te stesso.' }
    }
    if (role.id && role.id !== me.role_id) {
      return { error: 'Non puoi cambiare ruolo al tuo stesso account.' }
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: full_name || null,
      status,
      ...(role.id ? { role_id: role.id } : {}),
    })
    .eq('id', id)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Nessuna modifica salvata: permessi insufficienti.' }
  }

  refresh()
  return { ok: true }
}

/** Scorciatoie usate dai bottoni rapidi nella lista. */
export async function setUserStatus(
  id: string,
  status: 'pending' | 'active' | 'blocked'
): Promise<Result> {
  const denied = await guard('utenti')
  if (denied) return denied

  const me = await requireProfile()
  if (id === me.id && status !== 'active') {
    return { error: 'Non puoi bloccare il tuo stesso account.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', id)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Nessuna modifica salvata: permessi insufficienti.' }
  }

  refresh()
  return { ok: true }
}

export async function setUserRole(id: string, roleId: string): Promise<Result> {
  const denied = await guard('utenti')
  if (denied) return denied

  const me = await requireProfile()
  if (id === me.id) return { error: 'Non puoi cambiare ruolo al tuo stesso account.' }

  const formData = new FormData()
  formData.set('role_id', roleId)
  const role = await readRoleId(formData)
  if (role.error) return { error: role.error }
  if (!role.id) return { error: 'Ruolo non trovato.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ role_id: role.id })
    .eq('id', id)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Ruolo non assegnato: permessi insufficienti.' }
  }

  refresh()
  return { ok: true }
}

/** Imposta una nuova password senza passare dall'email. */
export async function setUserPassword(id: string, password: string): Promise<Result> {
  const denied = await guard('utenti')
  if (denied) return denied

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
  const denied = await guard('utenti')
  if (denied) return denied

  const me = await requireProfile()
  if (id === me.id) return { error: 'Non puoi eliminare il tuo stesso account.' }

  // Con la secret key la RLS non protegge piu' niente: un non-admin non
  // deve poter cancellare un amministratore.
  const supabase = await createClient()
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', id)
    .maybeSingle()

  if ((target as { role: string } | null)?.role === 'admin' && me.role !== 'admin') {
    return { error: 'Solo un amministratore può eliminare un account di amministrazione.' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}
