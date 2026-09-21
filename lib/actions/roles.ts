'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { guard, requireProfile } from '@/lib/auth'
import { LEVELS, SECTIONS, type Level, type Section } from '@/lib/permissions'
import type { Role, RoleBase } from '@/lib/types'

type Result = { ok?: true; error?: string }

function refresh() {
  revalidatePath('/admin/roles')
  revalidatePath('/admin/users')
  revalidatePath('/', 'layout')
}

/** Da "Team manager" a "team-manager": la chiave non si vede, ma resta stabile. */
function toKey(raw: string) {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function readBase(formData: FormData): RoleBase {
  const raw = String(formData.get('base') ?? 'staff')
  return raw === 'admin' || raw === 'athlete' ? raw : 'staff'
}

/**
 * Un ruolo di tipo admin puo' crearlo o assegnarlo solo un admin vero:
 * altrimenti "Ruoli: modifica" sarebbe la scala di servizio per
 * autopromuoversi. Il database ha la stessa guardia (guard_role_change).
 */
async function adminOnlyBase(base: RoleBase): Promise<string | null> {
  if (base !== 'admin') return null
  const me = await requireProfile()
  return me.role === 'admin'
    ? null
    : 'Solo un amministratore può creare ruoli di amministrazione.'
}

export async function createRole(formData: FormData): Promise<Result> {
  const denied = await guard('ruoli')
  if (denied) return denied

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Il nome del ruolo è obbligatorio.' }

  const base = readBase(formData)
  const baseError = await adminOnlyBase(base)
  if (baseError) return { error: baseError }

  const key = toKey(name)
  if (key.length < 2) return { error: 'Scegli un nome un po’ più lungo.' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('roles')
    .insert({ key, name, base, sort: 100 })
    .select('id')

  if (error) {
    if (error.code === '23505') return { error: 'Esiste già un ruolo con questo nome.' }
    return { error: error.message }
  }
  if (!data || data.length === 0) {
    return { error: 'Ruolo non creato: permessi insufficienti.' }
  }

  // Un ruolo nuovo nasce senza niente: si apre sezione per sezione.
  const roleId = (data[0] as { id: string }).id
  const { error: permError } = await supabase.from('role_permissions').insert(
    SECTIONS.map((section) => ({ role_id: roleId, section, level: 'none' }))
  )

  if (permError) return { error: permError.message }

  refresh()
  return { ok: true }
}

export async function updateRole(id: string, formData: FormData): Promise<Result> {
  const denied = await guard('ruoli')
  if (denied) return denied

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Il nome del ruolo è obbligatorio.' }

  const supabase = await createClient()

  const { data: current } = await supabase
    .from('roles')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!current) return { error: 'Ruolo non trovato.' }
  const role = current as Role

  const base = readBase(formData)
  const baseError = await adminOnlyBase(base)
  if (baseError) return { error: baseError }

  // Anche il tipo base di partenza conta: nessuno declassa un ruolo admin.
  const fromAdmin = await adminOnlyBase(role.base)
  if (fromAdmin) return { error: fromAdmin }

  const patch: Partial<Role> = { name }

  // Tipo e chiave dei ruoli di sistema restano com'e': ci si appoggia
  // la RLS, e rinominarli e' gia' abbastanza.
  if (!role.is_system) patch.base = base

  const { error } = await supabase.from('roles').update(patch).eq('id', id)
  if (error) {
    if (error.code === '23505') return { error: 'Esiste già un ruolo con questo nome.' }
    return { error: error.message }
  }

  refresh()
  return { ok: true }
}

/** Il ruolo che prende chi si registra da solo. Uno solo alla volta. */
export async function setDefaultRole(id: string): Promise<Result> {
  const denied = await guard('ruoli')
  if (denied) return denied

  const supabase = await createClient()

  const { data: role } = await supabase
    .from('roles')
    .select('base')
    .eq('id', id)
    .maybeSingle()

  if ((role as { base: RoleBase } | null)?.base === 'admin') {
    return { error: 'Un ruolo di amministrazione non può essere il predefinito.' }
  }

  const { error } = await supabase.from('roles').update({ is_default: true }).eq('id', id)
  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}

export async function deleteRole(id: string): Promise<Result> {
  const denied = await guard('ruoli')
  if (denied) return denied

  const supabase = await createClient()

  const { data: role } = await supabase
    .from('roles')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!role) return { error: 'Ruolo non trovato.' }
  if ((role as Role).is_system) {
    return { error: 'I ruoli di sistema non si eliminano: puoi rinominarli.' }
  }

  const fromAdmin = await adminOnlyBase((role as Role).base)
  if (fromAdmin) return { error: fromAdmin }

  // Meglio dirlo prima che lasciare uscire una violazione di chiave esterna.
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', id)

  if ((count ?? 0) > 0) {
    return {
      error: `Questo ruolo è assegnato a ${count} ${
        count === 1 ? 'utente' : 'utenti'
      }: spostali su un altro ruolo, poi eliminalo.`,
    }
  }

  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}

/**
 * Salva un'intera riga della matrice. Upsert e non update: un ruolo
 * creato prima che una sezione esistesse non ha quella casella.
 */
export async function setRolePermissions(
  roleId: string,
  entries: { section: Section; level: Level }[]
): Promise<Result> {
  const denied = await guard('ruoli')
  if (denied) return denied

  const clean = entries.filter(
    (e) => SECTIONS.includes(e.section) && LEVELS.includes(e.level)
  )

  if (clean.length === 0) return { error: 'Niente da salvare.' }

  const supabase = await createClient()

  const { error } = await supabase.from('role_permissions').upsert(
    clean.map((e) => ({ role_id: roleId, section: e.section, level: e.level })),
    { onConflict: 'role_id,section' }
  )

  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}
