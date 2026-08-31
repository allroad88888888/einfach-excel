// 一句话：合并单元格端口。

import type {
  MergeRangeRequest,
  ToolbarBackendMutationResult,
  UnmergeRangeRequest,
} from '@einfach/spreadsheet-ui-core'
import { applyMergeOverlayMutation } from '../merge-mutation'
import { resolveSheet } from '../sheet-ops'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createMergePorts(
  state: WorkerBackendState,
): Pick<WorkerWorkbookSpreadsheetBackend, 'mergeRange' | 'unmergeRange'> {
  return {
    /**
     * Parity #04 — merge/unmerge (adapter host-overlay, see
     * `mergeRangesBySheetId`). Session-only, never an engine RPC; the
     * exact ACK (kind/requestId/revision/affectedRange) satisfies the
     * UI-core toolbar's strict validator, and each call records a
     * before/after overlay image on the host-orchestrated transaction
     * log so Ctrl+Z round-trips.
     */
    async mergeRange(request: MergeRangeRequest): Promise<ToolbarBackendMutationResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      return applyMergeOverlayMutation(state, request, sheet)
    },

    async unmergeRange(request: UnmergeRangeRequest): Promise<ToolbarBackendMutationResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      return applyMergeOverlayMutation(state, request, sheet)
    },
  }
}
