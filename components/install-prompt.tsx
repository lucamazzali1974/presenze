'use client'

import { useEffect, useState } from 'react'
import { QUEUE_EVENT, pendingCount } from '@/lib/offline-queue'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'presenze-install-dismissed'
const SNOOZE_DAYS = 14

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS usa una proprieta' proprietaria, fuori standard
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos() {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS si dichiara Mac: lo si riconosce dal touch
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function snoozed() {
  try {
    const until = Number(localStorage.getItem(DISMISSED_KEY) ?? 0)
    return Date.now() < until
  } catch {
    return false
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)
  // La barra di rete occupa lo stesso posto e ha la precedenza:
  // salvare le presenze viene prima dell'invito a installare.
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    const check = () => setBlocked(!navigator.onLine || pendingCount() > 0)
    check()

    window.addEventListener('online', check)
    window.addEventListener('offline', check)
    window.addEventListener(QUEUE_EVENT, check)

    return () => {
      window.removeEventListener('online', check)
      window.removeEventListener('offline', check)
      window.removeEventListener(QUEUE_EVENT, check)
    }
  }, [])

  useEffect(() => {
    // Registra il service worker: senza, Chrome non offre l'installazione.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Niente installazione, ma l'app funziona lo stesso.
      })
    }

    if (isStandalone() || snoozed()) return

    if (isIos()) {
      // Safari non espone alcun evento: si possono solo dare istruzioni.
      setIos(true)
      const t = setTimeout(() => setShow(true), 2500)
      return () => clearTimeout(t)
    }

    function onPrompt(e: Event) {
      e.preventDefault()
      setDeferred(e as InstallEvent)
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', () => setShow(false))

    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function dismiss() {
    setShow(false)
    try {
      localStorage.setItem(
        DISMISSED_KEY,
        String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)
      )
    } catch {
      // Navigazione privata: si ripresenta alla prossima sessione.
    }
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    setShow(false)
  }

  if (!show || blocked) return null

  return (
    <div className="install" role="dialog" aria-label="Installa l’app">
      <div className="install-body">
        <img src="/icon-192.png" alt="" width={44} height={44} className="install-icon" />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="install-title">Tieni Presenze a portata di pollice</p>
          <p className="install-text">
            {ios ? (
              <>
                Tocca <strong>Condividi</strong> in basso, poi{' '}
                <strong>Aggiungi a Home</strong>.
              </>
            ) : (
              'Installala sul telefono: si apre come un’app, senza passare dal browser.'
            )}
          </p>
        </div>
      </div>

      <div className="install-actions">
        {!ios && (
          <button type="button" className="btn btn-sm btn-primary" onClick={install}>
            Installa
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={dismiss}>
          {ios ? 'Ho capito' : 'Non ora'}
        </button>
      </div>
    </div>
  )
}
