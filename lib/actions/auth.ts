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

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
