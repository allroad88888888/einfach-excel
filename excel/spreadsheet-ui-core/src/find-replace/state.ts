import { atom } from '@einfach/core'
import type { RustFindMatch, RustFindQuery } from '../rust-workbook/find-commands'
import type { CellRange } from '../shared'

export interface FindReplaceForm extends RustFindQuery {
  readonly replacement: string
  readonly scope: 'sheet' | 'workbook' | 'current-selection'
}

export interface FindReplacePanel {
  readonly open: boolean
  readonly tab: 'find' | 'replace'
  readonly form: FindReplaceForm
  /** 打开时捕获作用域，结果导航不能把原选区或原工作表改成下一次搜索范围。 */
  readonly origin: {
    readonly sheetId: string
    readonly range: CellRange
    readonly regions: number
  } | null
  readonly busy: 'find' | 'replace' | null
  readonly result: {
    readonly index: number
    readonly total: number
    readonly revision: number
    readonly current: RustFindMatch | null
    /** 有界结果页；total 仍为完整查询总数，不在 UI 镜像整份工作簿。 */
    readonly page?: { readonly offset: number; readonly matches: readonly RustFindMatch[] }
  } | null
  readonly error: string | null
  readonly notice: string | null
}

export const findReplaceStateAtom = atom<FindReplacePanel>({
  open: false,
  tab: 'find',
  origin: null,
  busy: null,
  result: null,
  error: null,
  notice: null,
  form: {
    needle: '',
    replacement: '',
    caseSensitive: false,
    wholeCell: false,
    wildcards: false,
    lookIn: 'formulas',
    scope: 'sheet',
  },
})

/** 视图只读面板投影；写入全部经过同一个语义 command。 */
export const findReplacePanelAtom = atom((get) => get(findReplaceStateAtom))
findReplacePanelAtom.debugLabel = 'spreadsheet.findReplace.panel'
