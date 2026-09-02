import { atom, type Atom } from '@einfach/core'
import type { SpreadsheetBackend } from '../backend'
import { spreadsheetBackendBindingAtom } from './backend-state'

export type SpreadsheetRuntimeState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready' }
  | { readonly status: 'error'; readonly message: string }

export interface ResolveSpreadsheetRuntimeInput {
  readonly backend: SpreadsheetBackend
}

const LOADING_RUNTIME_STATE: SpreadsheetRuntimeState = Object.freeze({ status: 'loading' })
const spreadsheetRuntimeBackingAtom = atom<SpreadsheetRuntimeState>(LOADING_RUNTIME_STATE)

spreadsheetRuntimeBackingAtom.debugLabel = 'spreadsheet.runtime.lifecycle.state'

export const spreadsheetRuntimeAtom: Atom<SpreadsheetRuntimeState> = atom((get) =>
  get(spreadsheetRuntimeBackingAtom),
)

spreadsheetRuntimeAtom.debugLabel = 'spreadsheet.runtime.lifecycle'

function runtimeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && error.message.length > 0) return error.message
    return String(error)
  } catch {
    return 'Unknown Rust workbook error.'
  }
}

/** Starts a workbook runtime attempt and clears any stale backend binding. */
export const beginSpreadsheetRuntimeAtom = atom(null, (_get, set): void => {
  set(spreadsheetBackendBindingAtom, null)
  set(spreadsheetRuntimeBackingAtom, LOADING_RUNTIME_STATE)
})

beginSpreadsheetRuntimeAtom.debugLabel = 'spreadsheet.runtime.begin'

/** Publishes the ready backend and lifecycle state in one command. */
export const resolveSpreadsheetRuntimeAtom = atom(
  null,
  (_get, set, input: ResolveSpreadsheetRuntimeInput): void => {
    set(spreadsheetBackendBindingAtom, { backend: input.backend })
    set(spreadsheetRuntimeBackingAtom, Object.freeze({ status: 'ready' }))
  },
)

resolveSpreadsheetRuntimeAtom.debugLabel = 'spreadsheet.runtime.resolve'

/** Publishes a startup failure and releases any stale backend binding. */
export const rejectSpreadsheetRuntimeAtom = atom(null, (_get, set, error: unknown): void => {
  set(spreadsheetBackendBindingAtom, null)
  set(
    spreadsheetRuntimeBackingAtom,
    Object.freeze({ status: 'error', message: runtimeErrorMessage(error) }),
  )
})

rejectSpreadsheetRuntimeAtom.debugLabel = 'spreadsheet.runtime.reject'
