'use client'

/*
 * I mattoni dei grafici: barre in HTML e CSS, niente librerie.
 *
 * Tre regole che valgono per tutti:
 *   * il numero c'e' sempre scritto, non solo colorato — cosi' il
 *     grafico si legge anche stampato, al buio, o daltonici;
 *   * le due tinte di serie sono --serie-1 e --serie-2, scelte per
 *     restare distinguibili in entrambi i temi e con le forme piu'
 *     comuni di daltonismo;
 *   * gli assi e la griglia stanno indietro, i dati davanti.
 */

export type Tone = 'good' | 'warn' | 'bad'

export function toneFor(pct: number | null): Tone | undefined {
  if (pct === null) return undefined
  if (pct >= 75) return 'good'
  if (pct >= 50) return 'warn'
  return 'bad'
}

/** Una riga: nome, una o due barre sovrapposte, valore. */
export function BarRow({
  label,
  value,
  bars,
}: {
  label: React.ReactNode
  value: React.ReactNode
  bars: { pct: number; serie?: 1 | 2; tone?: Tone; title: string }[]
}) {
  return (
    <div className="bar-row">
      <span className="bar-name">{label}</span>

      <span className="bar-stack">
        {bars.map((b, i) => (
          <span key={i} className="bar-track" title={b.title}>
            <span
              className="bar-fill"
              data-serie={b.serie ?? 1}
              data-tone={b.tone}
              style={{ width: `${Math.max(0, Math.min(100, b.pct))}%` }}
            />
          </span>
        ))}
      </span>

      <span className="bar-value">{value}</span>
    </div>
  )
}

export function Legend({ items }: { items: [1 | 2, string][] }) {
  return (
    <div className="legend">
      {items.map(([serie, label]) => (
        <span key={label}>
          <i data-serie={serie} />
          {label}
        </span>
      ))}
    </div>
  )
}

/**
 * Colonne verticali. Le etichette sotto si diradano da sole quando le
 * colonne sono tante: meglio una etichetta ogni cinque che una fila di
 * testo illeggibile.
 */
export function Columns({
  data,
  rule,
  ruleLabel,
}: {
  data: { key: string; pct: number; label: string; title: string }[]
  /** Linea di riferimento, in percentuale: di solito la media. */
  rule?: number | null
  ruleLabel?: string
}) {
  if (data.length === 0) {
    return <p className="empty">Non c’è ancora abbastanza storico.</p>
  }

  // Una etichetta ogni N, scelta perche' ne restino una decina in tutto.
  const step = Math.ceil(data.length / 10)

  return (
    <div className="chart">
      <div className="chart-wrap">
        <div className="cols">
          {data.map((d) => (
            <span key={d.key} className="col" title={d.title}>
              <i style={{ height: `${Math.max(0, Math.min(100, d.pct))}%` }} />
            </span>
          ))}
        </div>

        {rule !== null && rule !== undefined && (
          <span
            className="chart-rule"
            style={{ bottom: `${(rule / 100) * 132}px` }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="col-labels">
        {data.map((d, i) => (
          <span key={d.key}>{i % step === 0 ? d.label : ''}</span>
        ))}
      </div>

      {rule !== null && rule !== undefined && (
        <p className="mini mt-2">
          {ruleLabel ?? 'Media'}: {Math.round(rule)}%
        </p>
      )}
    </div>
  )
}
