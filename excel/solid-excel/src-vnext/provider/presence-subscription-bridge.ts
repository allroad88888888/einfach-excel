import type { Store } from '@einfach/core'
import { applyPresenceUpdateAtom, type SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'

/**
 * Subscribe to the optional backend transport without allowing a detached
 * workbook session to write its remote-presence projection.
 */
export function attachPresenceSubscriptionBridge(
  store: Store,
  backend: SpreadsheetBackend,
  isCurrentSession: () => boolean,
): () => void {
  try {
    const subscribe = backend.subscribePresence
    if (typeof subscribe !== 'function') return () => {}

    const unsubscribe = subscribe.call(backend, (update) => {
      if (!isCurrentSession()) return
      store.setter(applyPresenceUpdateAtom, update)
    })

    if (typeof unsubscribe !== 'function') return () => {}
    return () => {
      try {
        unsubscribe()
      } catch {
        // A broken optional transport cleanup cannot prevent Provider teardown.
      }
    }
  } catch {
    // Presence is an optional collaboration enhancement. A failed transport
    // subscription must leave workbook initialization usable.
    return () => {}
  }
}
