import { atom } from '@einfach/core'
import type { RustFillRangeRequest } from '../rust-workbook/commands'
import type { CellRange } from '../shared'

export type SeriesKind = NonNullable<RustFillRangeRequest['series']>['kind']
export interface SeriesPanel {
  readonly target: { sheetId: string; range: CellRange } | null
  readonly kind: SeriesKind
  readonly direction: 'down' | 'right'
  readonly sourceCount: string
  readonly listText: string
  readonly listName: string
  readonly selectedList: number | null
  readonly lists: readonly { readonly name: string; readonly text: string }[]
  readonly error: string
  readonly notice: string
}

// 预设只是当前工作簿会话的填充选项；不写入文件或原生 Undo 历史。
export const INITIAL_FILL_SERIES_STATE: SeriesPanel = {
  target: null, kind: 'number', direction: 'down', sourceCount: '2', listText: '',
  listName: '', selectedList: null, lists: [], error: '', notice: '',
}
export const fillSeriesStateAtom = atom(INITIAL_FILL_SERIES_STATE)
