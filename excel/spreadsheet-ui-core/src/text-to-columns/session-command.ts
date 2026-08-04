import { atom } from '@einfach/core'
import type { Getter, Setter } from '@einfach/core'
import type { CellCoord } from '../shared'
import type {
  TextToColumnsControllerPort,
  TextToColumnsIntent,
  TextToColumnsSessionSnapshot,
  TextToColumnsSourceRow,
  TextToColumnsWizardState,
} from './types'
import { TEXT_TO_COLUMNS_CAPABILITY_ERROR } from './constants'
import { nextTextToColumnsSessionId, snapshotRange } from './identity'
import {
  activeTextToColumnsMutationAtom,
  blocksTextToColumnsClose,
  EMPTY_TEXT_TO_COLUMNS_SOURCE,
  lifecycleFor,
  textToColumnsAnchorStateAtom,
  textToColumnsCanCloseAtom,
  textToColumnsCanEditAtom,
  textToColumnsCapabilityStateAtom,
  textToColumnsColumnCountAtom,
  textToColumnsErrorAtom,
  textToColumnsErrorStateAtom,
  textToColumnsLifecycleAtom,
  textToColumnsLifecycleStateAtom,
  textToColumnsOpenAtom,
  textToColumnsOpenStateAtom,
  textToColumnsSessionAtom,
  textToColumnsSessionIdAtom,
  textToColumnsSessionIdStateAtom,
  textToColumnsSessionStateAtom,
  textToColumnsSheetIdStateAtom,
  textToColumnsSourceStateAtom,
  textToColumnsWizardAtom,
  textToColumnsWizardStateAtom,
} from './state'
import {
  DEFAULT_DELIMITED_CONFIG,
  DEFAULT_FIXED_CONFIG,
  INITIAL_WIZARD_STATE,
  makeStepThreeState,
  makeStepTwoState,
  nextBlockReason,
  snapshotWizardState,
} from './wizard-domain'

function snapshotRows(rows: readonly TextToColumnsSourceRow[]): readonly TextToColumnsSourceRow[] {
  return Object.freeze(rows.map((row) => Object.freeze({ sourceRow: row.sourceRow, text: row.text })))
}

function sourceRangeFor(anchor: CellCoord, rows: readonly TextToColumnsSourceRow[]) {
  let rowEnd = anchor.row
  for (const row of rows) rowEnd = Math.max(rowEnd, row.sourceRow)
  return snapshotRange({ rowStart: anchor.row, rowEnd, colStart: anchor.col, colEnd: anchor.col })
}

export interface OpenTextToColumnsPayload {
  readonly sheetId: string
  readonly anchor: CellCoord
  readonly rows: readonly TextToColumnsSourceRow[]
}

export const openTextToColumnsAtom = atom(null, (get, set, payload: OpenTextToColumnsPayload): number | null => {
  if (get(activeTextToColumnsMutationAtom) !== null) return null
  if (get(textToColumnsOpenAtom) && blocksTextToColumnsClose(get(textToColumnsLifecycleAtom).status)) return null
  const sessionId = nextTextToColumnsSessionId(get(textToColumnsSessionIdAtom))
  if (sessionId === null) {
    set(textToColumnsErrorStateAtom, 'Text to Columns session identity space is exhausted.')
    set(textToColumnsLifecycleStateAtom, lifecycleFor('blocked', get(textToColumnsSessionIdAtom), null))
    return null
  }
  const anchor = Object.freeze({ row: payload.anchor.row, col: payload.anchor.col })
  const rows = snapshotRows(payload.rows)
  const session: TextToColumnsSessionSnapshot = Object.freeze({
    sessionId, sheetId: payload.sheetId, anchor, sourceRange: sourceRangeFor(anchor, rows), rows,
  })
  set(textToColumnsSessionIdStateAtom, sessionId)
  set(activeTextToColumnsMutationAtom, null)
  set(textToColumnsSessionStateAtom, session)
  set(textToColumnsSheetIdStateAtom, session.sheetId)
  set(textToColumnsAnchorStateAtom, session.anchor)
  set(textToColumnsSourceStateAtom, session.rows)
  set(textToColumnsWizardStateAtom, INITIAL_WIZARD_STATE)
  set(textToColumnsErrorStateAtom, '')
  set(textToColumnsLifecycleStateAtom, lifecycleFor('editing', sessionId, session.sheetId))
  set(textToColumnsOpenStateAtom, true)
  return sessionId
})
openTextToColumnsAtom.debugLabel = 'spreadsheet.textToColumns.open.command'

export function closeTextToColumnsSession(get: Getter, set: Setter): void {
  const nextSessionId = nextTextToColumnsSessionId(get(textToColumnsSessionIdAtom))
  if (nextSessionId !== null) set(textToColumnsSessionIdStateAtom, nextSessionId)
  const sessionId = nextSessionId ?? get(textToColumnsSessionIdAtom)
  set(activeTextToColumnsMutationAtom, null)
  set(textToColumnsOpenStateAtom, false)
  set(textToColumnsWizardStateAtom, INITIAL_WIZARD_STATE)
  set(textToColumnsSourceStateAtom, EMPTY_TEXT_TO_COLUMNS_SOURCE)
  set(textToColumnsAnchorStateAtom, null)
  set(textToColumnsSheetIdStateAtom, null)
  set(textToColumnsSessionStateAtom, null)
  set(textToColumnsErrorStateAtom, '')
  set(textToColumnsLifecycleStateAtom, lifecycleFor('closed', sessionId, null))
}

function restoreEditingState(get: Getter, set: Setter): void {
  const session = get(textToColumnsSessionAtom)
  if (session === null || get(activeTextToColumnsMutationAtom) !== null) return
  set(textToColumnsErrorStateAtom, '')
  set(textToColumnsLifecycleStateAtom, lifecycleFor('editing', session.sessionId, session.sheetId))
}

export const closeTextToColumnsAtom = atom(null, (get, set) => {
  if (get(textToColumnsCanCloseAtom)) closeTextToColumnsSession(get, set)
})
closeTextToColumnsAtom.debugLabel = 'spreadsheet.textToColumns.close'

export const captureTextToColumnsCapabilityAtom = atom(null, (get, set, source: TextToColumnsControllerPort) => {
  let available = false
  try { available = typeof source?.importCellChunks === 'function' } catch { available = false }
  set(textToColumnsCapabilityStateAtom, available)
  if (available && get(textToColumnsErrorAtom) === TEXT_TO_COLUMNS_CAPABILITY_ERROR && get(activeTextToColumnsMutationAtom) === null) {
    restoreEditingState(get, set)
  }
})
captureTextToColumnsCapabilityAtom.debugLabel = 'spreadsheet.textToColumns.captureCapability'

export const dispatchTextToColumnsIntentAtom = atom(null, (get, set, intent: TextToColumnsIntent): boolean => {
  if (!get(textToColumnsCanEditAtom)) return false
  const wizard = get(textToColumnsWizardAtom)
  let next: TextToColumnsWizardState | null = null
  switch (intent.kind) {
    case 'back':
      if (wizard.step === 'step-2-delimited' || wizard.step === 'step-2-fixed') next = { step: 'step-1', mode: wizard.mode }
      else if (wizard.step === 'step-3') next = makeStepTwoState(wizard.mode, wizard.delimited, wizard.fixed)
      break
    case 'next':
      if (nextBlockReason(wizard) !== null) break
      if (wizard.step === 'step-1') next = makeStepTwoState(wizard.mode)
      else if (wizard.step === 'step-2-delimited') next = makeStepThreeState('delimited', get(textToColumnsColumnCountAtom), wizard.delimited, DEFAULT_FIXED_CONFIG)
      else if (wizard.step === 'step-2-fixed') next = makeStepThreeState('fixed', get(textToColumnsColumnCountAtom), DEFAULT_DELIMITED_CONFIG, wizard.fixed)
      break
    case 'set-mode':
      if (wizard.step === 'step-1') next = { step: 'step-1', mode: intent.mode }
      break
    case 'toggle-delimiter':
      if (wizard.step === 'step-2-delimited') {
        const delimiters = new Set(wizard.delimited.delimiters)
        if (delimiters.has(intent.delimiter)) delimiters.delete(intent.delimiter)
        else delimiters.add(intent.delimiter)
        next = { ...wizard, delimited: { ...wizard.delimited, delimiters } }
      }
      break
    case 'set-other-char':
      if (wizard.step === 'step-2-delimited') next = { ...wizard, delimited: { ...wizard.delimited, otherChar: intent.value.charAt(0) } }
      break
    case 'set-treat-consecutive':
      if (wizard.step === 'step-2-delimited') next = { ...wizard, delimited: { ...wizard.delimited, treatConsecutiveAsOne: intent.value } }
      break
    case 'set-text-qualifier':
      if (wizard.step === 'step-2-delimited') next = { ...wizard, delimited: { ...wizard.delimited, textQualifier: intent.value } }
      break
    case 'set-fixed-breakpoints':
      if (wizard.step === 'step-2-fixed') {
        const breakpoints = Array.from(new Set(intent.value.split(/[\s,]+/).map((value) => Number.parseInt(value, 10)).filter((value) => Number.isSafeInteger(value) && value > 0))).sort((left, right) => left - right)
        next = { ...wizard, fixed: { breakpoints } }
      }
      break
    case 'set-column-format':
      if (wizard.step === 'step-3' && Number.isSafeInteger(intent.columnIndex) && intent.columnIndex >= 0 && intent.columnIndex < wizard.formats.length) {
        const formats = wizard.formats.slice()
        formats[intent.columnIndex] = intent.format
        next = { ...wizard, formats }
      }
      break
  }
  if (next === null) return false
  set(textToColumnsWizardStateAtom, snapshotWizardState(next))
  restoreEditingState(get, set)
  return true
})
dispatchTextToColumnsIntentAtom.debugLabel = 'spreadsheet.textToColumns.dispatchIntent'
