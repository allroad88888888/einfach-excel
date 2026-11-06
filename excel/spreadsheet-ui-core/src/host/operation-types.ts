import type { RichTextRun } from '../contracts'
import type { CellRange } from '../shared'
import type { ViewportRowHeight, ViewportColumnWidth } from '../contracts'
import type { SetFormatRangeRequest } from '../contracts/format-contracts'
import type { SortRangeOptions } from '../rust-workbook/sort-commands'
import type { RustFilterAction } from '../rust-workbook/filter-commands'
import type { ConditionalFormatChange } from '../rust-workbook/conditional-format-commands'
import type { NativeDataValidationRule } from '../data-validation/native-rule'
import type { StructuralEdit } from '../rust-workbook/structure-geometry'
import type { RustShiftCellsDirection } from '../rust-workbook/shift-cells-commands'
import type { RustFindQuery, RustFindMatch } from '../rust-workbook/find-commands'
import type { RustWorkbookSheet } from '../rust-workbook/commands'
import type { HostCommandFailure, HostCommandError } from './types'

export interface WorkbookTarget {
  readonly sheetId: string
  readonly range: CellRange
}
type WithoutRevision<T> = T extends unknown ? Omit<T, 'revision'> & { revision?: number } : never

/** Every persistent operation names its target; it never borrows the current selection. */
export type WorkbookOperation =
  | ({ readonly type: 'format' } & WorkbookTarget &
      Pick<SetFormatRangeRequest, 'format' | 'scope' | 'clearFormatFields' | 'borderPatch'> & {
        readonly replace?: boolean
      })
  | {
      readonly type: 'rich-text'
      readonly sheetId: string
      readonly row: number
      readonly col: number
      readonly runs: readonly RichTextRun[]
    }
  | ({ readonly type: 'clear'; readonly mode: 'contents' | 'formats' | 'all' } & WorkbookTarget)
  | ({ readonly type: 'shift'; readonly direction: RustShiftCellsDirection } & WorkbookTarget)
  | ({
      readonly type: 'resize'
      readonly axis: 'row' | 'column' | 'reset'
      readonly pixels: number
    } & WorkbookTarget)
  | ({
      readonly type: 'visibility'
      readonly action: 'hide-rows' | 'hide-columns' | 'unhide'
    } & WorkbookTarget)
  | { readonly type: 'structure'; readonly sheetId: string; readonly edit: StructuralEdit }
  | {
      readonly type: 'freeze'
      readonly sheetId: string
      readonly rows: number
      readonly cols: number
    }
  | ({
      readonly type: 'merge'
      readonly action: 'merge' | 'center' | 'unmerge'
      readonly discard?: boolean
    } & WorkbookTarget)
  | ({ readonly type: 'sort' } & WorkbookTarget & SortRangeOptions)
  | ({ readonly type: 'filter'; readonly sheetId: string } & RustFilterAction)
  | ({
      readonly type: 'conditional-format'
      readonly sheetId: string
    } & WithoutRevision<ConditionalFormatChange>)
  | ({
      readonly type: 'validation'
      readonly rule: NativeDataValidationRule | null
    } & WorkbookTarget)
  | {
      readonly type: 'sheet-add'
      readonly name: string
      readonly rowCount?: number
      readonly colCount?: number
    }
  | { readonly type: 'sheet-rename'; readonly sheetId: string; readonly name: string }
  | { readonly type: 'sheet-delete' | 'sheet-copy'; readonly sheetId: string }
  | { readonly type: 'sheet-move'; readonly sheetId: string; readonly targetIndex: number }
  | { readonly type: 'sheet-hidden'; readonly sheetId: string; readonly hidden: boolean }
  | { readonly type: 'sheet-color'; readonly sheetId: string; readonly color: string | null }
  | { readonly type: 'history'; readonly direction: 'undo' | 'redo'; readonly sheetId: string }
  | {
      readonly type: 'replace'
      readonly targets: readonly WorkbookTarget[]
      readonly query: RustFindQuery
      readonly replacement: string
      readonly expectedRevision: number
      readonly current?: RustFindMatch
    }

export interface NativeWorkbookOperationResult {
  readonly changed: boolean
  readonly revision: number
  readonly sheets: readonly RustWorkbookSheet[]
  /** Newly created/copied sheet, or the sheet affected by history. */
  readonly sheetId?: string
  readonly displayError?: HostCommandError
  readonly geometries?: readonly NonNullable<NativeWorkbookOperationResult['geometry']>[]
  readonly geometry?: {
    readonly sheetId: string
    readonly range: CellRange
    readonly rowHeights: readonly ViewportRowHeight[]
    readonly colWidths: readonly ViewportColumnWidth[]
  }
}
export type WorkbookOperationResult =
  | HostCommandFailure
  | ({
      readonly status: 'ok'
      readonly displayError?: HostCommandError
    } & NativeWorkbookOperationResult)

export const operationCommands = {
  'rich-text': 'richText.change',
  format: 'format.setRange',
  clear: 'range.clear',
  shift: 'range.shiftCells',
  resize: 'range.resize',
  visibility: 'range.visibility',
  structure: 'sheet.editStructure',
  freeze: 'sheet.freeze',
  merge: 'range.merge',
  sort: 'range.sort',
  filter: 'sheet.filter',
  'conditional-format': 'conditionalFormat.change',
  validation: 'validation.change',
  'sheet-add': 'workbook.editSheet',
  'sheet-rename': 'workbook.editSheet',
  'sheet-delete': 'workbook.changeSheets',
  'sheet-move': 'workbook.changeSheets',
  'sheet-copy': 'workbook.duplicateSheet',
  'sheet-hidden': 'workbook.setSheetHidden',
  'sheet-color': 'workbook.setSheetTabColor',
  history: 'history.apply',
  replace: 'workbook.replace',
} as const
