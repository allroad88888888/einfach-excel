import { atom } from '@einfach/core'
import type { ProjectionRevision } from '../contracts'
import type { InvalidValidationCell } from '../rust-workbook/data-validation-commands'
import type { RustWorkbookConnection } from '../rust-workbook/commands'

export interface SheetCirclesEntry {
  readonly token: number
  readonly busy: boolean
  readonly cells: readonly InvalidValidationCell[]
  readonly truncated: boolean
  readonly revision: ProjectionRevision | null
  readonly failedRevision: ProjectionRevision | null
  readonly error: string | null
}

export interface CirclesBacking {
  readonly connection: RustWorkbookConnection | null
  readonly nextToken: number
  readonly bySheet: Readonly<Record<string, SheetCirclesEntry>>
}

export const circlesBackingAtom = atom<CirclesBacking>({
  connection: null,
  nextToken: 1,
  bySheet: {},
})
circlesBackingAtom.debugLabel = 'spreadsheet.dataValidation.circles.state'

export const resetValidationCirclesStateAtom = atom(null, (get, set): void => {
  const prev = get(circlesBackingAtom)
  set(circlesBackingAtom, {
    connection: null,
    nextToken: prev.nextToken + 1,
    bySheet: {},
  })
})
resetValidationCirclesStateAtom.debugLabel = 'spreadsheet.dataValidation.circles.reset'
