'use client'

import { useState } from 'react'
import { AttendanceBoard } from '@/components/attendance-board'
import { EVENT_LABEL, dayStamp, formatEventTime } from '@/lib/format'
import type { Athlete, Event } from '@/lib/types'

type Board = {
  event: Event
  absent: { athlete_id: string; injury: boolean }[]
  /** I convocati: la rosa della squadra dell'evento, o tutti se non ne ha. */
  roster: Athlete[]
  teamName: string | null
} | null

export function EventSwitch({
  training,
  match,
  userId,
  lockedAthleteId = null,
  canClose = true,
}: {
  training: Board
  match: Board
  userId: string
  lockedAthleteId?: string | null
  canClose?: boolean
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
          onSelect={() => setTab('training')}
        />
        <EventCard
          board={match}
          type="match"
          selected={tab === 'match'}
          isNext={soonest === 'match'}
          onSelect={() => setTab('match')}
        />
      </div>

      {current ? (
        <AttendanceBoard
          key={current.event.id}
          event={current.event}
          athletes={current.roster}
          initialAbsent={current.absent}
          userId={userId}
          lockedAthleteId={lockedAthleteId}
          canClose={canClose}
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
  onSelect,
}: {
  board: Board
  type: 'training' | 'match'
  selected: boolean
  isNext: boolean
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

  const { event, absent, roster, teamName } = board

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
          {teamName && <span className="tag">{teamName}</span>}
          {isNext && <span className="tag fail">Prossimo</span>}
          {/* Lo stato di selezione e' scritto, non solo suggerito dal colore. */}
          {selected && <span className="tag pass">Stai compilando</span>}
        </span>
      </span>

      {event.opponent && (
        <p
          className="mt-2 text-lg"
          style={{ color: 'var(--text)', fontWeight: 500 }}
        >
          vs {event.opponent}
        </p>
      )}

      <p
        className={event.opponent ? 'mt-0.5 text-sm' : 'mt-2 text-lg'}
        style={{
          color: event.opponent ? 'var(--muted)' : 'var(--text)',
          fontWeight: event.opponent ? 400 : 500,
        }}
      >
        {dayStamp(event.starts_at)} · {formatEventTime(event.starts_at)}
        {event.meet_at && ` · ritrovo ${formatEventTime(event.meet_at)}`}
      </p>

      <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
        {event.location || event.title || '—'}
      </p>

      <p className="mt-2 text-sm" style={{ color: 'var(--faint)' }}>
        {roster.length - absent.length} presenti su {roster.length}
      </p>
    </button>
  )
}
