import { atom } from '@einfach/core'
import {
  activeCellAtom, activeWorkbookSheetAtom, changeSheetDrawingAtom, drawingErrorAtom,
  editingSessionAtom, selectionRangesAtom, sheetDrawingsAtom, type SheetDrawing,
} from '@einfach-excel/spreadsheet-ui-core'
import { sparklineSlots } from './layout'
import { parseRange } from './range-text'
import { DEFAULT_SPARKLINE_SPEC, parseSparklineSpec, SPARKLINE_KIND, type SparklineSpec,
  type SparklineType } from './spec'

const errorAtom = atom<string | null>(null)
errorAtom.debugLabel = 'plugin.sparkline.error.state'
export const sparklineErrorAtom = atom((get) => get(errorAtom))
sparklineErrorAtom.debugLabel = 'plugin.sparkline.error'
export const dismissSparklineErrorAtom = atom(null, (_get, set) => set(errorAtom, null))
dismissSparklineErrorAtom.debugLabel = 'plugin.sparkline.error.dismiss'

/** 活动单元格所在的迷你图组（同 Excel：选中迷你图所在格即出现「迷你图」设置）。 */
export const selectedSparklineAtom = atom((get): SheetDrawing | null => {
  const cell = get(activeCellAtom)
  return get(sheetDrawingsAtom).find((drawing) => {
    const location = drawing.kind === SPARKLINE_KIND ? drawing.refs[0] : null
    return !!location && cell.row >= location.startRow && cell.row <= location.endRow &&
      cell.col >= location.startCol && cell.col <= location.endCol
  }) ?? null
})
selectedSparklineAtom.debugLabel = 'plugin.sparkline.selected'

function nextId(drawings: readonly SheetDrawing[]) {
  const used = new Set(drawings.map((drawing) => drawing.id))
  let index = drawings.length + 1
  while (used.has(`sparkline-${index}`)) index += 1
  return `sparkline-${index}`
}

/** 创建对话框的初始值：数据取当前选区，位置留给用户填。 */
export const sparklineDraftAtom = atom((get) => {
  const range = get(selectionRangesAtom)[0]
  return range ? { startRow: range.rowStart, endRow: range.rowEnd, startCol: range.colStart,
    endCol: range.colEnd } : null
})
sparklineDraftAtom.debugLabel = 'plugin.sparkline.draft'

/** 新建一组迷你图：一个格内对象（refs = [位置, 数据]），一次 Rust 命令、一条撤销记录。 */
export const insertSparklineAtom = atom(null, async (get, set,
  input: { readonly type: SparklineType; readonly data: string; readonly location: string }) => {
  if (get(editingSessionAtom).source || !get(activeWorkbookSheetAtom)) return false
  const fail = (error: string) => { set(errorAtom, error); return false }
  const data = parseRange(input.data)
  const location = parseRange(input.location)
  if (!data) return fail('Enter a valid data range.')
  if (!location) return fail('Enter a valid location range.')
  const layout = sparklineSlots(location, data)
  if ('error' in layout) return fail(layout.error)
  const drawings = get(sheetDrawingsAtom)
  const overlaps = drawings.some((drawing) => {
    const other = drawing.kind === SPARKLINE_KIND ? drawing.refs[0] : null
    return !!other && other.startRow <= location.endRow && location.startRow <= other.endRow &&
      other.startCol <= location.endCol && location.startCol <= other.endCol
  })
  if (overlaps) return fail('The location already has sparklines.')
  const drawing: SheetDrawing = {
    id: nextId(drawings), kind: SPARKLINE_KIND,
    anchor: { row: location.startRow, col: location.startCol, offsetX: 0, offsetY: 0,
      width: 16, height: 16 },
    refs: [location, data], payload: { ...DEFAULT_SPARKLINE_SPEC, type: input.type },
  }
  const changed = await set(changeSheetDrawingAtom, { type: 'set', drawing })
  if (!changed) return fail(get(drawingErrorAtom) ?? 'The sparklines could not be created.')
  set(errorAtom, null)
  return true
})
insertSparklineAtom.debugLabel = 'plugin.sparkline.insert'

/** 改当前组的设置（类型、颜色、标记）；一次修改一条撤销记录。 */
export const updateSparklineAtom = atom(null, async (get, set,
  patch: Partial<SparklineSpec>) => {
  const drawing = get(selectedSparklineAtom)
  if (!drawing) return false
  const payload = { ...parseSparklineSpec(drawing.payload), ...patch }
  return set(changeSheetDrawingAtom, { type: 'set', drawing: { ...drawing, payload } })
})
updateSparklineAtom.debugLabel = 'plugin.sparkline.update'

export const removeSparklineAtom = atom(null, async (get, set) => {
  const drawing = get(selectedSparklineAtom)
  return drawing ? set(changeSheetDrawingAtom, { type: 'remove', id: drawing.id }) : false
})
removeSparklineAtom.debugLabel = 'plugin.sparkline.remove'
