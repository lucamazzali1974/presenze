export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spin-wrap">
      <span className="spin" aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="sr-only">Attendi</span>}
    </span>
  )
}

/**
 * Pillola in alto che compare durante qualsiasi operazione: salvataggi,
 * cancellazioni, cambi di stato. Sta sopra il contenuto e non sposta
 * niente, cosi' non fa saltare la pagina sotto le dita.
 */
export function Busy({ show, label = 'Sto salvando…' }: { show: boolean; label?: string }) {
  if (!show) return null

  return (
    <div className="busy" role="status" aria-live="polite">
      <Spinner label={label} />
    </div>
  )
}
