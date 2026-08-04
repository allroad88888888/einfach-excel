import type { WorkerCommandHandler } from './worker-command'
import { postResponse } from './worker-post'
import { assertMethod, assertSheet, normalizeSparseRange } from './worker-wire-guards'
import type { CellFormatJSON, FormatRangeSnapshot } from './worker-protocol'

/** 区间格式与视口尺寸：设格式、快照/恢复格式、读视口行高列宽。 */

export const handleFormatCommand: WorkerCommandHandler = (id, msg, wb) => {
  switch (msg.cmd) {
    case 'setFormatRange': {
      const range = normalizeSparseRange(msg.range)
      assertSheet(wb, range.sheet)
      const setFormatRange = assertMethod(wb, 'set_format_range')
      postResponse(
        id,
        setFormatRange.call(
          wb,
          range.sheet,
          range.startRow,
          range.startCol,
          range.endRow,
          range.endCol,
          msg.fmt as CellFormatJSON | null | undefined,
        ),
      )
      return true
    }
    case 'snapshotFormatRange': {
      const range = normalizeSparseRange(msg.range)
      assertSheet(wb, range.sheet)
      const snapshotFormatRange = assertMethod(wb, 'snapshot_format_range')
      postResponse(
        id,
        snapshotFormatRange.call(
          wb,
          range.sheet,
          range.startRow,
          range.startCol,
          range.endRow,
          range.endCol,
        ),
      )
      return true
    }
    case 'restoreFormatSnapshot': {
      const restoreFormatSnapshot = assertMethod(wb, 'restore_format_snapshot')
      postResponse(id, restoreFormatSnapshot.call(wb, msg.snapshot as FormatRangeSnapshot))
      return true
    }
    case 'snapshotViewportSizes': {
      const range = normalizeSparseRange(msg.range)
      assertSheet(wb, range.sheet)
      const snapshotViewportSizes = assertMethod(wb, 'snapshot_viewport_sizes')
      postResponse(
        id,
        snapshotViewportSizes.call(
          wb,
          range.sheet,
          range.startRow,
          range.startCol,
          range.endRow,
          range.endCol,
        ),
      )
      return true
    }
    default:
      return false
  }
}
