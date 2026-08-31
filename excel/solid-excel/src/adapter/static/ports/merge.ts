// 一句话：合并单元格端口。

import { cloneRange, normalizeRange, rangesIntersect } from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { beginUndoableMutation, recordMergeRangesBefore } from '../history-record'
import { getMergeRanges } from '../merge-overlay'
import { mergeMutationResult } from '../mutation-result'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'

export function createMergePorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'mergeRange' | 'unmergeRange'> {
  return {
    async mergeRange(request) {
      beginUndoableMutation(state)
      recordMergeRangesBefore(state, request.sheetId)
      const range = normalizeRange(request.range)
      const ranges = getMergeRanges(state, request.sheetId)
      const nextRanges = ranges.filter((candidate) => !rangesIntersect(candidate, range))
      if (range.rowEnd > range.rowStart || range.colEnd > range.colStart) {
        nextRanges.push(cloneRange(range))
      }
      state.mergeRangesBySheetId.set(request.sheetId, nextRanges)
      state.revision = bumpRevision(state.revision)

      return mergeMutationResult(request, state.revision)
    },
    async unmergeRange(request) {
      beginUndoableMutation(state)
      recordMergeRangesBefore(state, request.sheetId)
      const range = normalizeRange(request.range)
      const ranges = getMergeRanges(state, request.sheetId)
      state.mergeRangesBySheetId.set(
        request.sheetId,
        ranges.filter((candidate) => !rangesIntersect(candidate, range)),
      )
      state.revision = bumpRevision(state.revision)

      return mergeMutationResult(request, state.revision)
    },
  }
}
