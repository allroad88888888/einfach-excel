import { atom } from '@einfach/core'
import type { RunFormatCellsSaveInput } from './types'
import { createFormatCellsSaveController } from './format-save-controller'
import { nextSafeIdentity } from './format-save-ledger'
import type {
  NumberFormatDialogState,
  OpenNumberFormatDialogInput,
  PatchNumberFormatDialogInput,
} from './number-format-dialog-state'
import {
  chooseSelectedId,
  cloneCellFormat,
  cloneRange,
  currentDigits,
  formatForState,
} from './number-format-selection'

const numberFormatDialogSourceAtom = atom<NumberFormatDialogState>({ status: 'closed' })
const numberFormatDialogSessionSequenceAtom = atom(0)

export const numberFormatDialogAtom = atom((get) => get(numberFormatDialogSourceAtom))
numberFormatDialogAtom.debugLabel = 'spreadsheet.numberFormatDialog.state'

export const openNumberFormatDialogAtom = atom(
  null,
  (get, set, input: OpenNumberFormatDialogInput) => {
    const baseFormat = cloneCellFormat(input.initialFormat)
    const sessionId = nextSafeIdentity(get(numberFormatDialogSessionSequenceAtom))
    if (sessionId === null) return
    set(numberFormatDialogSessionSequenceAtom, sessionId)
    set(numberFormatDialogSourceAtom, {
      status: 'open',
      kind: input.kind,
      sheetId: input.sheetId,
      range: cloneRange(input.range),
      sessionId,
      phase: 'editing',
      requestId: null,
      pending: false,
      error: null,
      baseFormat,
      selectedId: chooseSelectedId(input.kind, baseFormat.numberFormat),
      digits: currentDigits(baseFormat.numberFormat),
    })
  },
)
openNumberFormatDialogAtom.debugLabel = 'spreadsheet.numberFormatDialog.open'

export const patchNumberFormatDialogAtom = atom(
  null,
  (get, set, patch: PatchNumberFormatDialogInput) => {
    const state = get(numberFormatDialogSourceAtom)
    if (state.status !== 'open' || state.pending || state.phase === 'outcome-unknown-blocked')
      return
    const digits =
      patch.digits === undefined
        ? state.digits
        : Math.max(0, Math.min(20, Math.round(patch.digits)))
    set(numberFormatDialogSourceAtom, {
      ...state,
      phase: 'editing',
      error: null,
      selectedId: patch.selectedId ?? state.selectedId,
      digits,
    })
  },
)
patchNumberFormatDialogAtom.debugLabel = 'spreadsheet.numberFormatDialog.patch'

export const numberFormatDialogSavePayloadAtom = atom((get) => {
  const state = get(numberFormatDialogSourceAtom)
  if (state.status !== 'open') return null
  return {
    sheetId: state.sheetId,
    range: state.range,
    format: formatForState(state),
  }
})
numberFormatDialogSavePayloadAtom.debugLabel = 'spreadsheet.numberFormatDialog.savePayload'

export const closeNumberFormatDialogAtom = atom(null, (_get, set) => {
  set(numberFormatDialogSourceAtom, { status: 'closed' })
})
closeNumberFormatDialogAtom.debugLabel = 'spreadsheet.numberFormatDialog.close'

const numberFormatSaveController = createFormatCellsSaveController(
  'number-format',
  numberFormatDialogSourceAtom,
  formatForState,
)

export const numberFormatDialogSaveLedgerAtom = numberFormatSaveController.ledgerAtom
numberFormatDialogSaveLedgerAtom.debugLabel = 'spreadsheet.numberFormatDialog.saveLedger'
export const numberFormatDialogSaveBlockedAtom = numberFormatSaveController.blockedAtom
numberFormatDialogSaveBlockedAtom.debugLabel = 'spreadsheet.numberFormatDialog.saveBlocked'
export const runNumberFormatDialogSaveAtom = numberFormatSaveController.runAtom
runNumberFormatDialogSaveAtom.debugLabel = 'spreadsheet.numberFormatDialog.runSave'

export const saveNumberFormatDialogAtom = atom(null, (_get, set, input?: RunFormatCellsSaveInput) =>
  set(runNumberFormatDialogSaveAtom, input),
)
saveNumberFormatDialogAtom.debugLabel = 'spreadsheet.numberFormatDialog.save'
