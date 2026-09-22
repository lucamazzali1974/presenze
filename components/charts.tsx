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

export function toneFor(pct: number | null | undefined): Tone | undefined {
  if (pct === null || pct === undefined) return undefined
  if (pct >= 75) return 'good'
  if (pct >= 50) return 'warn'
  return 'bad'
}

export type BarLine = {
  pct: number
  /** Il numero da scrivere a fine riga: e' il dato, non un di piu'. */
  value: string
  serie?: 1 | 2
  tone?: Tone
  title: string
}

/**
 * Un soggetto e le sue barre: il nome compare una volta sola, in cima al
 * gruppo, e ogni riga porta la propria barra e il proprio numero.
 */
export function BarRow({
  label,
  lines,
}: {
  label: React.ReactNode
  lines: BarLine[]
}) {
  return (
    <div className="bar-group">
      {lines.map((l, i) => (
        <div className="bar-line" key={i}>
          <span className="bar-name">{i === 0 ? label : ''}</span>

          <span className="bar-track" title={l.title}>
            {/* A zero niente riempimento: il minimo di 3px darebbe un
                trattino colorato a chi non ha nessun dato. */}
            {l.pct > 0 && (
              <span
                className="bar-fill"
                data-serie={l.serie ?? 1}
                data-tone={l.tone}
                style={{ width: `${Math.min(100, l.pct)}%` }}
              />
            )}
          </span>

          <span className="bar-value">{l.value}</span>
        </div>
      ))}
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
 * colonne sono tante, e il valore sopra la colonna compare solo finche'
 * ci sta: meglio una etichetta ogni cinque che una fila illeggibile.
 */
export function Columns({
  data,
  rule,
  ruleLabel,
  empty = 'Non c’è ancora abbastanza storico.',
}: {
  data: { key: string; pct: number; label: string; title: string; value?: string }[]
  /** Linea di riferimento, in percentuale: di solito la media. */
  rule?: number | null
  ruleLabel?: string
  empty?: string
}) {
  if (data.length === 0) {
    return (
      <div className="chart">
        <p className="empty">{empty}</p>
      </div>
    )
  }

  const step = Math.ceil(data.length / 10)
  const showValues = data.length <= 12

  return (
    <div className="chart">
      <div className="chart-wrap">
        <div className="cols">
          {data.map((d) => (
            <span key={d.key} className="col" title={d.title}>
              {showValues && <em>{d.value ?? `${Math.round(d.pct)}%`}</em>}
              {d.pct > 0 ? (
                <i style={{ height: `${Math.min(100, d.pct)}%` }} />
              ) : (
                <i style={{ height: '2px', background: 'var(--track)' }} />
              )}
            </span>
          ))}
        </div>

        {/* L'area delle barre e' alta 132px: 150 meno i 18 di respiro
            in cima per i valori. La riga si posiziona su quella. */}
        {rule !== null && rule !== undefined && (
          <span
            className="chart-rule"
            style={{ bottom: `${(Math.max(0, Math.min(100, rule)) / 100) * 132}px` }}
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
        <p className="mini mt-3">
          <span className="rule-key" aria-hidden="true" />
          {ruleLabel ?? 'Media'}: {Math.round(rule)}%
        </p>
      )}
    </div>
  )
}

/** I numeri che rispondono prima di ogni grafico. */
export function Tiles({
  items,
}: {
  items: { value: string; label: string }[]
}) {
  return (
    <div className="tiles">
      {items.map((t) => (
        <div key={t.label} className="tile">
          <b>{t.value}</b>
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Il selettore di vista: segmentato, per distinguerlo dai filtri. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (next: T) => void
  options: readonly (readonly [T, string])[]
  label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
