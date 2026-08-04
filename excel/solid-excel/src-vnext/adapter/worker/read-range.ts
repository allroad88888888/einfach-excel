// 一句话：读一块区域并叠上全部宿主 overlay。

import type { CellRange, DisplayCell, ProjectionRevision } from '@einfach/spreadsheet-ui-core'
import { runtimeSupports } from './capabilities'
import { applyConditionalFormatOverlay } from './conditional-format-overlay'
import { emptyFormatRangeSnapshot, mergeFormatsIntoCells } from './format-overlay'
import { applyMergeOverlay } from './merge-overlay'
import { applyNumberFormatsToCells } from './number-format'
import { resolveSheet } from './sheet-ops'
import { snapshotToDisplayCell } from './snapshot-to-cell'
import { applyValidationOverlay } from './validation-overlay'
import { toSparseRange } from './wire-range'
import type { WorkerBackendState } from './state'

export async function readRange(
  state: WorkerBackendState,
  sheetId: string,
  range: CellRange,
  requestRevision?: ProjectionRevision,
): Promise<{ cells: DisplayCell[]; revision?: ProjectionRevision }> {
  const sheet = await resolveSheet(state, sheetId)
  const sparseRange = toSparseRange(sheet.idx, range)
  const [snapshots, formatSnapshot] = await Promise.all([
    state.client.readSparseRange(sparseRange),
    // Runtimes that declare `formatSnapshots: false` model no formats
    // at all, so the truthful overlay is empty — never ask them to
    // fake a snapshot success shape.
    runtimeSupports(state, 'formatSnapshots')
      ? state.client.snapshotFormatRange(sparseRange)
      : Promise.resolve(emptyFormatRangeSnapshot(sparseRange)),
  ])
  const cells = snapshots
    .map(snapshotToDisplayCell)
    .filter((cell): cell is DisplayCell => cell !== null)
    .sort((left, right) => (left.row === right.row ? left.col - right.col : left.row - right.row))

  const formattedCells = mergeFormatsIntoCells(cells, range, formatSnapshot)
  const numberFormattedCells = applyNumberFormatsToCells(formattedCells)
  const validatedCells = applyValidationOverlay(
    numberFormattedCells,
    range,
    state.validationRulesBySheetId.get(sheetId) ?? [],
  )

  const conditionalCells = applyConditionalFormatOverlay(
    validatedCells,
    state.conditionalFormatRulesBySheetId.get(sheetId) ?? [],
    range,
  )
  // #04 merge overlay joins last. Source coordinates == display coordinates on
  // every path now, so merges are no longer withheld under an active filter:
  // the reason for that suppression was the permuted row space, and there
  // isn't one any more.
  const mergedCells = applyMergeOverlay(
    conditionalCells,
    range,
    state.mergeRangesBySheetId.get(sheetId) ?? [],
  )

  // Withholding happens LAST, after every overlay has resolved against the
  // full rectangle, so a filter cannot change what the surviving rows look
  // like — only which of them are reported. Rows are dropped rather than
  // emitted-and-ignored so that "inside the range yet contributing no cell"
  // means "filtered away", the property visible-cell consumers depend on and
  // the property that keeps this projection identical to the static backend's.
  // The mirror it reads is the engine's own filter set (populated from
  // `applyFilter`, displaced with the engine on structural edits).
  const filterHidden = state.filterHiddenRowsBySheetId.get(sheetId)
  const visibleCells = filterHidden?.size
    ? mergedCells.filter((cell) => !filterHidden.has(cell.row))
    : mergedCells

  return {
    cells: visibleCells.sort((left, right) =>
      left.row === right.row ? left.col - right.col : left.row - right.row,
    ),
    revision: requestRevision ?? state.revision,
  }
}
