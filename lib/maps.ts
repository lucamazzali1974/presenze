/**
 * Link a Google Maps senza API key e senza SDK.
 *
 * Il modo "vero" (Places Autocomplete, mappa incorporata) richiede una
 * chiave con fatturazione attiva sul progetto Google Cloud. Per aprire
 * un indirizzo basta l'URL universale: su telefono apre l'app di Maps,
 * su desktop il sito, e funziona anche con Apple Mappe come predefinita.
 */
export function mapsUrl(...parts: (string | null | undefined)[]) {
  const query = parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ')

  if (!query) return null

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
