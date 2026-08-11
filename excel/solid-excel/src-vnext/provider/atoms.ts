import { atom } from '@einfach/core'
import {
  issueProjectionRequestIdAtom,
  pasteSpecialCapabilityAtom,
  projectionRequestIdAtom,
  projectionSnapshotAtom,
  textToColumnsCapabilityAtom,
  type ProjectionSnapshot,
  type SpreadsheetBackend,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'

/**
 * @deprecated Workbook ports are runtime context, never Atom state. Use
 * `useSpreadsheetBackend` for the context-owned forwarding port instead.
 */
export const spreadsheetBackendAtom = atom<null>(null)
spreadsheetBackendAtom.debugLabel = 'spreadsheet.vnext.backend'

/** @deprecated Use UI-core's canonical read-only `pasteSpecialCapabilityAtom`. */
export const pasteSpecialSupportedAtom = pasteSpecialCapabilityAtom

/** @deprecated Use UI-core's canonical text-to-columns capability atom. */
export const textToColumnsSupportedAtom = textToColumnsCapabilityAtom

const customFormulasCapabilityBackingAtom = atom(false)
customFormulasCapabilityBackingAtom.debugLabel =
  'spreadsheet.vnext.customFormulas.capabilityBacking'

/** Read-only primitive capability projection for the current workbook. */
export const customFormulasSupportedAtom = atom((get) => get(customFormulasCapabilityBackingAtom))
customFormulasSupportedAtom.debugLabel = 'spreadsheet.vnext.customFormulas.supported'

export const captureCustomFormulasCapabilityAtom = atom(
  null,
  (_get, set, backend: SpreadsheetBackend): void => {
    let supported = false
    try {
      supported =
        typeof backend.registerCustomFormula === 'function' &&
        typeof backend.unregisterCustomFormula === 'function'
    } catch {
      supported = false
    }
    set(customFormulasCapabilityBackingAtom, supported)
  },
)
captureCustomFormulasCapabilityAtom.debugLabel =
  'spreadsheet.vnext.customFormulas.captureCapability'

export type SpreadsheetWorkbookLifecyclePhase = 'idle' | 'initializing' | 'ready' | 'failed'

export interface SpreadsheetWorkbookLifecycle {
  readonly error: string | null
  readonly phase: SpreadsheetWorkbookLifecyclePhase
  readonly sessionId: number
}

function lifecycleFor(
  sessionId: number,
  phase: SpreadsheetWorkbookLifecyclePhase,
  error: string | null,
): SpreadsheetWorkbookLifecycle {
  return Object.freeze({ sessionId, phase, error })
}

function initializationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return 'Workbook initialization failed.'
}

const idleWorkbookLifecycle = lifecycleFor(0, 'idle', null)

/** User-visible workbook initialization/switch/recovery state. */
export const spreadsheetWorkbookLifecycleAtom =
  atom<SpreadsheetWorkbookLifecycle>(idleWorkbookLifecycle)
spreadsheetWorkbookLifecycleAtom.debugLabel = 'spreadsheet.vnext.workbook.lifecycle'

export const beginSpreadsheetWorkbookLifecycleAtom = atom(
  null,
  (_get, set, sessionId: number): void => {
    set(spreadsheetWorkbookLifecycleAtom, lifecycleFor(sessionId, 'initializing', null))
  },
)
beginSpreadsheetWorkbookLifecycleAtom.debugLabel = 'spreadsheet.vnext.workbook.begin'

export const resolveSpreadsheetWorkbookLifecycleAtom = atom(
  null,
  (get, set, sessionId: number): boolean => {
    if (get(spreadsheetWorkbookLifecycleAtom).sessionId !== sessionId) return false
    set(spreadsheetWorkbookLifecycleAtom, lifecycleFor(sessionId, 'ready', null))
    return true
  },
)
resolveSpreadsheetWorkbookLifecycleAtom.debugLabel = 'spreadsheet.vnext.workbook.resolve'

export const rejectSpreadsheetWorkbookLifecycleAtom = atom(
  null,
  (get, set, input: { readonly error: unknown; readonly sessionId: number }): boolean => {
    if (get(spreadsheetWorkbookLifecycleAtom).sessionId !== input.sessionId) return false
    set(
      spreadsheetWorkbookLifecycleAtom,
      lifecycleFor(input.sessionId, 'failed', initializationErrorMessage(input.error)),
    )
    return true
  },
)
rejectSpreadsheetWorkbookLifecycleAtom.debugLabel = 'spreadsheet.vnext.workbook.reject'

export const clearSpreadsheetWorkbookLifecycleAtom = atom(
  null,
  (get, set, sessionId: number): boolean => {
    if (get(spreadsheetWorkbookLifecycleAtom).sessionId !== sessionId) return false
    set(spreadsheetWorkbookLifecycleAtom, idleWorkbookLifecycle)
    return true
  },
)
clearSpreadsheetWorkbookLifecycleAtom.debugLabel = 'spreadsheet.vnext.workbook.clear'

/** Solid compatibility aliases; projection state is owned by UI-core. */
export const spreadsheetProjectionSnapshotAtom = projectionSnapshotAtom
export const spreadsheetProjectionRequestIdAtom = projectionRequestIdAtom

/** @deprecated Dispatch projection work through UI-core's lifecycle atoms. */
export const advanceSpreadsheetProjectionRequestIdAtom = issueProjectionRequestIdAtom

export function isVisibleProjectionResult(
  result: ProjectionSnapshot['result'],
): result is VisibleProjectionResult {
  return result?.kind === 'visible-window'
}
