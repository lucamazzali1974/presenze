import type { Athlete } from '@/lib/types'

/**
 * Negli elenchi il soprannome viene per primo, perche' e' come si chiamano
 * a bordo campo. Nome e cognome restano accanto, in grigio. Chi non ha un
 * soprannome mostra nome e cognome in primo piano.
 */
export function AthleteName({
  athlete,
  block = false,
}: {
  athlete: Pick<Athlete, 'first_name' | 'last_name' | 'nickname'>
  block?: boolean
}) {
  const nickname = athlete.nickname?.trim()
  const full = `${athlete.first_name} ${athlete.last_name}`

  if (!nickname) return <span className="nm">{full}</span>

  return (
    <span className={block ? 'block' : undefined}>
      <span className="nm">{nickname}</span>{' '}
      <span className="nm-sub">{full}</span>
    </span>
  )
}
