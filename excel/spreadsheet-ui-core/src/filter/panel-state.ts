import { atom } from '@einfach/core'
import type { ProjectionRevision } from '../backend'
import type { ColumnFilterRule } from '../filter-sort/types'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type { RustFilterValuesPage } from '../rust-workbook/filter-commands'
import type { CellRange } from '../shared'

export interface FilterCondition {
  col: number
  kind: ColumnFilterRule['kind']
  value: string
  values: readonly string[]
  min: string
  max: string
  caseSensitive: boolean
}
export const filterCondition = (col: number): FilterCondition => ({
  col, kind: 'equals', value: '', values: [''], min: '', max: '', caseSensitive: false,
})

export interface FilterValuesBrowser {
  readonly index: number
  readonly search: string
  readonly busy: boolean
  readonly error: string
  readonly page?: RustFilterValuesPage
}

/** 条件是唯一可提交草稿；browser 只留当前候选页，不另外复制勾选值。 */
export const initialFilterPanel = {
  sheetId: null as string | null,
  connection: null as RustWorkbookConnection | null,
  table: undefined as string | undefined,
  revision: undefined as ProjectionRevision | undefined,
  range: undefined as CellRange | undefined,
  column: undefined as number | undefined,
  conditions: [] as readonly FilterCondition[],
  browser: undefined as FilterValuesBrowser | undefined,
  error: '',
}
export const filterPanelStateAtom = atom(initialFilterPanel)
