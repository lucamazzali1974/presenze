'use client'

import { useEffect, useState, useTransition } from 'react'
import { removeSubscription, saveSubscription } from '@/lib/actions/push'
import { Spinner } from '@/components/spinner'

/** La chiave VAPID viaggia in base64url: il browser la vuole come byte. */
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS non implementa display-mode: standalone, ha una sua proprieta'.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

type State =
  | 'loading'
  | 'unsupported'
  | 'needs-install'
  | 'denied'
  | 'off'
  | 'on'

export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<State>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!vapidKey) return setState('unsupported')

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // Su iPhone le push esistono solo dentro l'app installata: se il
      // browser non espone PushManager e siamo su iOS, il problema e'
      // quello, non il telefono.
      return setState(isIos() && !isStandalone() ? 'needs-install' : 'unsupported')
    }

    if (Notification.permission === 'denied') return setState('denied')

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'))
  }, [vapidKey])

  async function enable() {
    setError(null)

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const json = sub.toJSON() as {
        endpoint?: string
        keys?: { p256dh?: string; auth?: string }
      }

      startTransition(async () => {
        const res = await saveSubscription({
          endpoint: json.endpoint ?? '',
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
          userAgent: navigator.userAgent,
        })
        if (res?.error) return setError(res.error)
        setState('on')
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function disable() {
    setError(null)

    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) return setState('off')

      const endpoint = sub.endpoint
      await sub.unsubscribe()

      startTransition(async () => {
        const res = await removeSubscription(endpoint)
        if (res?.error) return setError(res.error)
        setState('off')
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="panel mt-4 p-4">
      <p className="mini">Promemoria del mattino</p>

      <p className="mt-2 text-sm" style={{ color: 'var(--color-muted)' }}>
        Nei giorni in cui hai allenamento o partita ricevi una notifica in
        mattinata, così se non ci sei lo segnali in tempo. Niente altro: nessun
        avviso per ogni modifica.
      </p>

      {state === 'loading' && (
        <p className="mt-3 text-sm" style={{ color: 'var(--color-faint)' }}>
          <Spinner label="Controllo…" />
        </p>
      )}

      {state === 'needs-install' && (
        <p className="mt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
          Su iPhone le notifiche arrivano solo con l&rsquo;app installata:
          tocca <strong>Condividi</strong> in Safari, poi{' '}
          <strong>Aggiungi a Home</strong>, e riapri Presenze da lì.
        </p>
      )}

      {state === 'unsupported' && (
        <p className="mt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
          Questo browser non supporta le notifiche push.
        </p>
      )}

      {state === 'denied' && (
        <p className="mt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
          Hai bloccato le notifiche per questo sito. Si riattivano dalle
          impostazioni del browser, non da qui.
        </p>
      )}

      {state === 'off' && (
        <button
          type="button"
          className="btn btn-primary mt-4"
          disabled={isPending}
          onClick={enable}
        >
          {isPending ? <Spinner label="Attivo…" /> : 'Attiva le notifiche'}
        </button>
      )}

      {state === 'on' && (
        <div className="row-actions">
          <span className="tag pass">Attive su questo dispositivo</span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={isPending}
            onClick={disable}
          >
            Disattiva
          </button>
        </div>
      )}

      {error && <p className="alert mt-4">{error}</p>}
    </div>
  )
}
