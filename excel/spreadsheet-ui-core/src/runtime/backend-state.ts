import { atom, type Store } from '@einfach/core'
import type { SpreadsheetBackend } from '../backend'

export interface SpreadsheetBackendBinding {
  readonly backend: SpreadsheetBackend
}

export const spreadsheetBackendBindingAtom = atom<SpreadsheetBackendBinding | null>(null)

spreadsheetBackendBindingAtom.debugLabel = 'spreadsheet.runtime.backendBinding.state'

/** Binds one backend to one UI-core store during core construction. */
export function bindSpreadsheetBackend(store: Store, backend: SpreadsheetBackend): void {
  store.setter(spreadsheetBackendBindingAtom, { backend })
}
