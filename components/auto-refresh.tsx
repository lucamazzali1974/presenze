'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const EVERY = 5 * 60 * 1000

/**
 * Ricarica i dati del server ogni 5 minuti, senza ricaricare la pagina:
 * router.refresh() rifà solo il rendering lato server e lascia intatto
 * lo stato dei componenti client (l'appello a meta' compilazione, i
 * filtri, il testo nelle caselle).
 *
 * Con la scheda in secondo piano non fa niente — un telefono in tasca
 * non ha motivo di interrogare il database — e riprende appena torna
 * visibile, aggiornando subito se e' passato il tempo. Cosi' chi
 * riapre l'app a bordo campo vede i dati veri al primo sguardo.
 */
export function AutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    let last = Date.now()

    function refresh() {
      last = Date.now()
      router.refresh()
    }

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh()
    }, EVERY)

    function onVisible() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - last >= EVERY) refresh()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refresh)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
    }
  }, [router])

  return null
}
