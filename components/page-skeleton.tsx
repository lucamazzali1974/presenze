/**
 * Lo scheletro che Next mostra durante la navigazione, al posto dello
 * schermo bianco. Non e' un trucco estetico: vedere la struttura
 * comparire subito fa percepire la pagina come piu' veloce anche
 * quando i dati ci mettono lo stesso tempo.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {/* La barra in alto resta al suo posto: senza, il contenuto
          salterebbe su e giu' a ogni cambio pagina. */}
      <header className="topbar">
        <div className="wrap topbar-inner">
          <span className="brand">
            <span className="brand-mark">
              PRE<em>/</em>SENZE
            </span>
          </span>
        </div>
      </header>

      <main className="wrap pb-16" aria-busy="true">
        <div className="page-head">
        <div className="skeleton" style={{ width: '90px', height: '12px' }} />
        <div
          className="skeleton mt-3"
          style={{ width: 'min(320px, 70%)', height: '38px' }}
        />
        <div
          className="skeleton mt-3"
          style={{ width: 'min(420px, 90%)', height: '14px' }}
        />
      </div>

        <div className="panel rows">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="row">
            <div
              className="skeleton"
              style={{ width: 'min(220px, 60%)', height: '16px' }}
            />
            <div
              className="skeleton mt-3"
              style={{ width: 'min(300px, 80%)', height: '12px' }}
            />
          </div>
        ))}
      </div>

        <span className="sr-only">Caricamento…</span>
      </main>
    </>
  )
}
