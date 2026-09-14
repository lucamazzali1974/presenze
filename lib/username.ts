/*
 * Accesso col soprannome invece che con l'email.
 *
 * Supabase Auth sa autenticare con email o telefono, non con un nome
 * utente: non c'e' modo di aggirarlo. Il giro e' questo: al soprannome
 * si appiccica un dominio finto e l'indirizzo che ne esce fa da nome
 * utente. Nessuna email viene mai spedita a questi indirizzi, e infatti
 * la conferma email dev'essere spenta (Authentication > Sign In >
 * Email > Confirm email).
 *
 * ATTENZIONE: il dominio qui sotto non si cambia a cuor leggero. Il
 * login ricostruisce l'indirizzo dal soprannome ogni volta, quindi
 * cambiarlo dopo aver creato degli accessi li rende tutti inutilizzabili.
 */
export const ATHLETE_EMAIL_DOMAIN = 'atleti.presenze.app'

/**
 * Da "Ciccio Rossi" a "ciccio.rossi": minuscolo, senza accenti, senza
 * spazi. Serve che sia riproducibile alla lettera, perche' e' cosi' che
 * al login si risale all'indirizzo.
 */
export function toUsername(raw: string) {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.')
}

export function usernameToEmail(username: string) {
  return `${toUsername(username)}@${ATHLETE_EMAIL_DOMAIN}`
}

export function isAthleteEmail(email: string | null | undefined) {
  return Boolean(email?.endsWith(`@${ATHLETE_EMAIL_DOMAIN}`))
}

/** Il soprannome da mostrare all'admin: l'indirizzo finto non serve a nessuno. */
export function emailToUsername(email: string | null | undefined) {
  if (!email) return null
  return isAthleteEmail(email) ? email.split('@')[0] : email
}

/** Nome utente proposto: prima il soprannome, poi nome e cognome. */
export function suggestUsername(a: {
  first_name: string
  last_name: string
  nickname: string | null
}) {
  const fromNickname = toUsername(a.nickname ?? '')
  return fromNickname.length >= 2
    ? fromNickname
    : toUsername(`${a.first_name} ${a.last_name}`)
}

export function usernameError(username: string) {
  if (username.length < 2) return 'Il nome utente è troppo corto.'
  if (username.length > 40) return 'Il nome utente è troppo lungo.'
  return null
}
