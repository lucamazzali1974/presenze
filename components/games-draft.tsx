'use client'

import { useState } from 'react'

/**
 * Le righe degli incontri da creare: avversario e orario, una per
 * incontro. Campi con nome (game_opponent / game_time) cosi' il form che
 * li contiene li legge con getAll, nello stesso ordine.
 */
export function GamesDraft({
  initial = 2,
  defaultOpponent,
}: {
  initial?: number
  defaultOpponent?: string | null
}) {
  const [rows, setRows] = useState(() =>
    Array.from({ length: initial }, (_, i) => i)
  )
  const [next, setNext] = useState(initial)

  return (
    <div>
      <ul className="games-draft">
        {rows.map((key, i) => (
          <li key={key}>
            <span className="mini">Incontro {i + 1}</span>
            <input
              name="game_opponent"
              placeholder={defaultOpponent ?? 'Avversario'}
              aria-label={`Avversario dell’incontro ${i + 1}`}
            />
            <input
              name="game_time"
              type="time"
              aria-label={`Orario dell’incontro ${i + 1}`}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={rows.length <= 1}
              onClick={() => setRows((r) => r.filter((k) => k !== key))}
              aria-label={`Togli l’incontro ${i + 1}`}
            >
              −
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-sm mt-2"
        onClick={() => {
          setRows((r) => [...r, next])
          setNext((n) => n + 1)
        }}
      >
        + Aggiungi incontro
      </button>
    </div>
  )
}

/** Dal form alle righe: stesso ordine dei campi, righe vuote comprese. */
export function readGames(formData: FormData) {
  const opponents = formData.getAll('game_opponent').map(String)
  const times = formData.getAll('game_time').map(String)
  return opponents.map((opponent, i) => ({
    opponent: opponent.trim() || null,
    time: times[i]?.trim() || null,
  }))
}
