import { atom } from '@einfach/core'
import { projectionSnapshotAtom } from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type { InvalidValidationCell } from '../rust-workbook/data-validation-commands'

export interface ValidationCirclesView {
  readonly sheetId: string | null
  readonly active: boolean
  readonly busy: boolean
  readonly cells: readonly InvalidValidationCell[]
  readonly truncated: boolean
  readonly revision: number | null
  readonly error: string | null
}

interface SheetCirclesEntry {
  readonly token: number
  readonly busy: boolean
  readonly cells: readonly InvalidValidationCell[]
  readonly truncated: boolean
  readonly revision: number | null
  readonly error: string | null
}

interface CirclesBacking {
  readonly connection: RustWorkbookConnection | null
  readonly nextToken: number
  readonly bySheet: Readonly<Record<string, SheetCirclesEntry>>
}

const EMPTY_CELLS: readonly InvalidValidationCell[] = Object.freeze([])

const EMPTY_VIEW: ValidationCirclesView = Object.freeze({
  sheetId: null,
  active: false,
  busy: false,
  cells: EMPTY_CELLS,
  truncated: false,
  revision: null,
  error: null,
})

const circlesBackingAtom = atom<CirclesBacking>({
  connection: null,
  nextToken: 1,
  bySheet: {},
})
circlesBackingAtom.debugLabel = 'spreadsheet.dataValidation.circles.state'

export const validationCirclesAtom = atom((get): ValidationCirclesView => {
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  if (!connection || !sheet) return EMPTY_VIEW
  const backing = get(circlesBackingAtom)
  if (backing.connection !== connection) {
    return { ...EMPTY_VIEW, sheetId: sheet.id }
  }
  const entry = backing.bySheet[sheet.id]
  if (!entry) return { ...EMPTY_VIEW, sheetId: sheet.id }
  return {
    sheetId: sheet.id,
    active: true,
    busy: entry.busy,
    cells: entry.cells,
    truncated: entry.truncated,
    revision: entry.revision,
    error: entry.error,
  }
})
validationCirclesAtom.debugLabel = 'spreadsheet.dataValidation.circles'

export type ValidationCirclesAction = 'circle' | 'clear' | 'refresh'

export const runValidationCirclesAtom = atom(
  null,
  (get, set, action: ValidationCirclesAction): boolean | Promise<boolean> => {
    const connection = get(rustWorkbookConnectionAtom)
    const sheet = get(activeWorkbookSheetAtom)
    if (!connection || !sheet) return false
    const current = get(circlesBackingAtom)
    const baseBySheet = current.connection === connection ? current.bySheet : {}
    const sheetId = sheet.id

    if (action === 'clear') {
      if (!(sheetId in baseBySheet)) return true
      const nextBySheet = { ...baseBySheet }
      delete nextBySheet[sheetId]
      set(circlesBackingAtom, {
        connection,
        nextToken: current.nextToken + 1,
        bySheet: nextBySheet,
      })
      return true
    }

    const existing = baseBySheet[sheetId]
    if (action === 'refresh') {
      if (!existing || existing.busy) return false
      const projection = get(projectionSnapshotAtom)
      const projectedRevision =
        projection.status === 'ready' && projection.result?.sheetId === sheetId
          ? projection.result.revision
          : null
      if (projectedRevision !== null && existing.revision === projectedRevision) {
        return false
      }
    }

    const token = current.nextToken
    const pendingEntry: SheetCirclesEntry = {
      token,
      busy: true,
      cells: existing?.cells ?? EMPTY_CELLS,
      truncated: existing?.truncated ?? false,
      revision: existing?.revision ?? null,
      error: null,
    }
    set(circlesBackingAtom, {
      connection,
      nextToken: token + 1,
      bySheet: { ...baseBySheet, [sheetId]: pendingEntry },
    })

    return (async () => {
      try {
        const result = await connection.request('validation.listInvalid', { sheetId })
        if (get(rustWorkbookConnectionAtom) !== connection) return false
        const latest = get(circlesBackingAtom)
        if (latest.connection !== connection || latest.bySheet[sheetId]?.token !== token) {
          return false
        }
        set(circlesBackingAtom, {
          ...latest,
          bySheet: {
            ...latest.bySheet,
            [sheetId]: {
              token,
              busy: false,
              cells: result.cells,
              truncated: result.truncated,
              revision: result.revision,
              error: null,
            },
          },
        })
        return true
      } catch (error) {
        if (get(rustWorkbookConnectionAtom) !== connection) return false
        const latest = get(circlesBackingAtom)
        if (latest.connection !== connection || latest.bySheet[sheetId]?.token !== token) {
          return false
        }
        set(circlesBackingAtom, {
          ...latest,
          bySheet: {
            ...latest.bySheet,
            [sheetId]: {
              token,
              busy: false,
              cells: EMPTY_CELLS,
              truncated: false,
              revision: null,
              error: error instanceof Error ? error.message : String(error),
            },
          },
        })
        return false
      }
    })()
  },
)
runValidationCirclesAtom.debugLabel = 'spreadsheet.dataValidation.circles.run'
