/*
 * Service worker. Fa tre cose:
 *  1. rende l'app installabile (Chrome lo pretende)
 *  2. tiene l'ultima pagina vista, cosi' a bordo campo l'appello si apre
 *     anche senza segnale
 *  3. mostra una pagina decente quando non c'e' ne' rete ne' cache
 *
 * Le pagine sono network-first: con il segnale si vedono sempre i dati
 * veri, la cache entra in gioco solo quando la rete non risponde. Le
 * modifiche fatte in quello stato restano in coda sul telefono
 * (lib/offline-queue.ts) e partono da sole al ritorno del segnale.
 *
 * Cambiando questo file alza VERSION, altrimenti i browser tengono il vecchio.
 */

const VERSION = 'presenze-v3'
const PAGES = 'presenze-pages'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icon-192.png']))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== VERSION && k !== PAGES)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigazione: prima la rete, poi l'ultima copia vista, poi la pagina offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Solo le pagine dell'app: login e redirect non vanno conservati.
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(PAGES).then((cache) => cache.put(request, copy))
          }
          return res
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit || caches.match(OFFLINE_URL))
        )
    )
    return
  }

  /*
   * Asset con hash nel nome: sicuri da servire dalla cache.
   * In sviluppo pero' l'hash non c'e' (i chunk si chiamano sempre uguali),
   * quindi su localhost la cache servirebbe codice vecchio: si passa
   * sempre dalla rete.
   */
  const isLocal =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname.endsWith('.local')

  if (!isLocal && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(VERSION).then((cache) => cache.put(request, copy))
            return res
          })
      )
    )
  }
})
