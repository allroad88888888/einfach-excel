import { atom, type Atom, type Getter, type Setter } from '@einfach/core'
import { cloneFormat } from '../contracts'
import type { DisplayCell, ProjectionRevision, SpreadsheetCellFormat } from '../contracts'
import { activeCellAtom, primarySelectionRegionAtom } from '../selection'
import type { CellCoord } from '../shared'
import { cellAtProjection } from './cell-at'
import { projectionSnapshotBackingAtom } from './state'

/**
 * 活动格最后一次被投影覆盖时读到的事实。只滚动不改修订版：活动格滚出可见区后，公式栏、
 * 格式状态与单格命令沿用它，不随滚动清空。表、格或修订版任一不同即失效，不显示过期内容。
 */
interface RetainedActiveCell {
  readonly sheetId: string
  readonly cell: CellCoord
  readonly revision: ProjectionRevision
  readonly fact: DisplayCell | null
}

const retainedActiveCellBackingAtom = atom<RetainedActiveCell | null>(null)
retainedActiveCellBackingAtom.debugLabel = 'spreadsheet.projection.retainedActiveCell.state'

// 写路径也调用：直接读底层状态与一层派生，避开 einfach 多层派生的浅新鲜检查。
function readActiveCellFact(get: Getter): DisplayCell | null | undefined {
  const sheetId = get(primarySelectionRegionAtom).sheetId
  const cell = get(activeCellAtom)
  const result = get(projectionSnapshotBackingAtom).result
  if (result?.kind !== 'visible-window' || result.sheetId !== sheetId) return undefined
  const projected = cellAtProjection(result, cell)
  if (projected !== undefined) return projected
  const retained = get(retainedActiveCellBackingAtom)
  return retained !== null && result.revision !== undefined &&
    retained.revision === result.revision && retained.sheetId === sheetId &&
    retained.cell.row === cell.row && retained.cell.col === cell.col
    ? retained.fact
    : undefined
}

/** 活动格事实：undefined = 尚未读到；null = 已读到的空格。 */
export const activeCellFactAtom: Atom<DisplayCell | null | undefined> = atom(readActiveCellFact)
activeCellFactAtom.debugLabel = 'spreadsheet.projection.activeCellFact'

/** 投影快照换掉结果之前调用：当前结果还能给出活动格事实时记下，供滚出可见区后沿用。 */
export function retainActiveCellFact(get: Getter, set: Setter): void {
  const result = get(projectionSnapshotBackingAtom).result
  if (result?.kind !== 'visible-window' || result.revision === undefined) return
  const fact = readActiveCellFact(get)
  if (fact === undefined) return
  const { row, col } = get(activeCellAtom)
  set(retainedActiveCellBackingAtom, Object.freeze({
    sheetId: result.sheetId, cell: Object.freeze({ row, col }), revision: result.revision, fact,
  }))
}

/** 连接或视图整体重置时丢弃；新工作簿的修订版可能与旧值相同。 */
export function forgetActiveCellFact(set: Setter): void {
  set(retainedActiveCellBackingAtom, null)
}

/**
 * The active cell's cell-level format. Returns `{}` when the active cell's facts are unknown or it
 * carries no format overrides.
 *
 * Every "open Format Cells for the active selection" entry point (toolbar number-format dropdown,
 * menu bar, grid Ctrl+1) must seed the dialog's `initialFormat` with this value. Without a seed the
 * dialog's category detector falls back to `'general'`, and saving with no edits silently
 * overwrites the selection's real format with `{ kind: 'general' }`.
 */
export const activeCellFormatAtom: Atom<SpreadsheetCellFormat> = atom((get) => {
  const cell = get(activeCellFactAtom)
  return cell?.format ? cloneFormat(cell.format) : {}
})
activeCellFormatAtom.debugLabel = 'spreadsheet.projection.activeCellFormat'
