'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { QUEUE_EVENT, flush, pendingCount } from '@/lib/offline-queue'

export function OfflineBanner() {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const sync = useCallback(async () => {
    if (pendingCount() === 0) return
    setSyncing(true)
    await flush(supabase)
    setSyncing(false)
    setPending(pendingCount())
  }, [supabase])

  useEffect(() => {
    setOnline(navigator.onLine)
    setPending(pendingCount())

    const refresh = () => setPending(pendingCount())

    function goOnline() {
      setOnline(true)
      sync()
    }
    function goOffline() {
      setOnline(false)
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener(QUEUE_EVENT, refresh)

    // Un tentativo all'avvio e uno ogni mezzo minuto: l'evento 'online'
    // scatta quando c'e' una rete, non quando funziona davvero.
    sync()
    const timer = setInterval(() => {
      if (navigator.onLine) sync()
    }, 30000)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener(QUEUE_EVENT, refresh)
      clearInterval(timer)
    }
  }, [sync])

  // Sul login si svuota la cache delle pagine: su un telefono condiviso
  // non deve restare visibile l'appello di chi c'era prima.
  useEffect(() => {
    if (pathname !== '/login') return
    caches?.delete('presenze-pages').catch(() => {})
  }, [pathname])

  if (online && pending === 0) return null

  return (
    <div className={online ? 'netbar netbar-sync' : 'netbar'} role="status">
      <span className="netbar-dot" aria-hidden="true" />

      <span style={{ flex: 1, minWidth: 0 }}>
        {!online ? (
          <>
            Sei offline. Le modifiche restano sul telefono
            {pending > 0 && ` (${pending} in attesa)`} e partono al ritorno del
            segnale.
          </>
        ) : syncing ? (
          <>Sincronizzo {pending} {pending === 1 ? 'modifica' : 'modifiche'}…</>
        ) : (
          <>
            {pending} {pending === 1 ? 'modifica non salvata' : 'modifiche non salvate'}.
          </>
        )}
      </span>

      {online && !syncing && pending > 0 && (
        <button type="button" className="btn btn-sm" onClick={sync}>
          Riprova
        </button>
      )}
    </div>
  )
}
