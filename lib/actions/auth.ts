'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { usernameToEmail } from '@/lib/username'

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  /*
   * Un solo campo per due tipi di accesso. Lo staff entra con l'email,
   * i giocatori col soprannome: se non c'e' la chiocciola, l'indirizzo
   * si ricostruisce dal soprannome (vedi lib/username.ts).
   */
  const identifier = String(formData.get('identifier') ?? '').trim()
  const email = identifier.includes('@') ? identifier : usernameToEmail(identifier)

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: String(formData.get('password') ?? ''),
  })

  if (error) return { error: 'Soprannome, email o password non corretti.' }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()

  const password = String(formData.get('password') ?? '')
  if (password.length < 8) {
    return { error: 'La password deve avere almeno 8 caratteri.' }
  }

  const { error } = await supabase.auth.signUp({
    email: String(formData.get('email') ?? '').trim(),
    password,
    options: {
      data: { full_name: String(formData.get('full_name') ?? '').trim() },
    },
  })

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/pending')
}

/**
 * Cambio password dell'utente collegato. Non serve la vecchia: la
 * sessione e' gia' la prova d'identita'. Si chiede due volte perche'
 * una password sbagliata al primo colpo chiude fuori chi l'ha scelta.
 */
export async function changeMyPassword(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Sessione scaduta: rientra e riprova.' }

  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (password.length < 8) {
    return { error: 'La password deve avere almeno 8 caratteri.' }
  }
  if (password !== confirm) {
    return { error: 'Le due password non coincidono.' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  return { ok: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
