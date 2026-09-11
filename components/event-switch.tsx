'use client'

import { useState } from 'react'
import { AttendanceBoard } from '@/components/attendance-board'
import { EVENT_LABEL, dayStamp, formatEventTime } from '@/lib/format'
import type { Athlete, Event } from '@/lib/types'

type Board = {
  event: Event
  absent: { athlete_id: string; injury: boolean }[]
} | null

export function EventSwitch({
  training,
  match,
  athletes,
  userId,
}: {
  training: Board
  match: Board
  athletes: Athlete[]
  userId: string
}) {
  // Il prossimo in ordine di tempo e' quello che si apre per primo.
  const soonest =
    training && match
      ? new Date(training.event.starts_at) <= new Date(match.event.starts_at)
        ? 'training'
        : 'match'
      : training
        ? 'training'
        : match
          ? 'match'
          : null

  const [tab, setTab] = useState<'training' | 'match'>(soonest ?? 'training')
  const current = tab === 'training' ? training : match

  return (
    <div>
      <p className="mini mb-2">Scegli l’evento da compilare</p>

      <div className="grid-2">
        <EventCard
          board={training}
          type="training"
          selected={tab === 'training'}
          isNext={soonest === 'training'}
          athletes={athletes.length}
          onSelect={() => setTab('training')}
        />
        <EventCard
          board={match}
          type="match"
          selected={tab === 'match'}
          isNext={soonest === 'match'}
          athletes={athletes.length}
          onSelect={() => setTab('match')}
        />
      </div>

      {current ? (
        <AttendanceBoard
          key={current.event.id}
          event={current.event}
          athletes={athletes}
          initialAbsent={current.absent}
          userId={userId}
        />
      ) : (
        <div className="panel mt-5">
          <p className="empty">
            Nessun{tab === 'training' ? ' allenamento' : 'a partita'} in programma.
          </p>
        </div>
      )}
    </div>
  )
}

function EventCard({
  board,
  type,
  selected,
  isNext,
  athletes,
  onSelect,
}: {
  board: Board
  type: 'training' | 'match'
  selected: boolean
  isNext: boolean
  athletes: number
  onSelect: () => void
}) {
  if (!board) {
    return (
      <div className="evt" data-empty="true">
        <span className="mini">{EVENT_LABEL[type]}</span>
        <p className="mt-2 text-sm" style={{ color: 'var(--faint)' }}>
          Niente in programma
        </p>
      </div>
    )
  }

  const { event, absent } = board

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="evt"
      data-selected={selected}
    >
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="mini" style={{ color: selected ? 'var(--text)' : undefined }}>
          {EVENT_LABEL[type]}
        </span>

        <span className="flex flex-wrap gap-2">
          {isNext && <span className="tag fail">Prossimo</span>}
          {/* Lo stato di selezione e' scritto, non solo suggerito dal colore. */}
          {selected && <span className="tag pass">Stai compilando</span>}
        </span>
      </span>

      <p
        className="mt-2 text-lg"
        style={{ color: 'var(--text)', fontWeight: 500 }}
      >
        {dayStamp(event.starts_at)} · {formatEventTime(event.starts_at)}
      </p>

      <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
        {event.location || event.title || '—'}
      </p>

      <p className="mt-2 text-sm" style={{ color: 'var(--faint)' }}>
        {athletes - absent.length} presenti su {athletes}
      </p>
    </button>
  )
}
