import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { applyProjectionSizes } from '../projection/projection-sizes'
import { validateProjectionResult } from '../projection/contracts'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { selectionSnapshotAtom } from '../selection'
import type { CellRange } from '../shared'
import { viewportMetricsAtom } from '../viewport/metrics'
import { selectionStructureFeedbackAtom } from './selection-structure-state'
import { selectionMergeFeedbackAtom } from './selection-merge-state'
import {
  getViewportColumnWidth,
  getViewportRowHeight,
  viewportSizeOverridesAtom,
} from '../viewport/size-overrides'

interface SizePanelState {
  readonly target: { readonly sheetId: string; readonly range: CellRange } | null
  readonly height: string
  readonly width: string
  readonly busy: boolean
  readonly error: string | null
}
const CLOSED: SizePanelState = { target: null, height: '', width: '', busy: false, error: null }
export const selectionSizePanelAtom = atom<SizePanelState>(CLOSED)
selectionSizePanelAtom.debugLabel = 'spreadsheet.viewport.selectionSizePanel'

type SizeAction =
  | 'open'
  | 'close'
  | 'row'
  | 'column'
  | 'reset'
  | { readonly field: 'height' | 'width'; readonly value: string }

/** 尺寸面板草稿属于 UI Core；真实尺寸只在 Rust 确认后更新坐标缓存。 */
export const runSelectionSizeAtom = atom(
  null,
  async (get, set, action: SizeAction): Promise<boolean> => {
    const state = get(selectionSizePanelAtom)
    if (
      state.busy || get(selectionStructureFeedbackAtom).busy || get(selectionMergeFeedbackAtom).busy
    ) return false
    if (action === 'close') {
      set(selectionSizePanelAtom, CLOSED)
      return true
    }
    if (typeof action !== 'string') {
      if (!state.target) return false
      set(selectionSizePanelAtom, { ...state, [action.field]: action.value, error: null })
      return true
    }
    const connection = get(rustWorkbookConnectionAtom)
    const selection = get(selectionSnapshotAtom)
    const sheetId = selection.selection.sheetId
    if (!connection || !sheetId || get(editingSessionAtom).source !== null) return false
    if (action === 'open') {
      const sizes = get(viewportSizeOverridesAtom)
      const metrics = get(viewportMetricsAtom)
      set(selectionSizePanelAtom, {
        target: { sheetId, range: { ...selection.range } },
        busy: false,
        error: null,
        height: String(
          getViewportRowHeight(sizes, sheetId, selection.range.rowStart, metrics.rowHeight),
        ),
        width: String(
          getViewportColumnWidth(sizes, sheetId, selection.range.colStart, metrics.colWidth),
        ),
      })
      return true
    }
    if (!state.target || state.target.sheetId !== sheetId) return false
    const fail = (error: string) => {
      set(selectionSizePanelAtom, { ...state, error })
      return false
    }
    if (getSheetProtection(get(sheetProtectionAtom), sheetId).mode === 'protected')
      return fail('Unprotect the worksheet before changing row or column sizes.')
    const pixels = action === 'reset' ? 0 : Number(action === 'row' ? state.height : state.width)
    const [min, max] = action === 'row' ? [16, 512] : [40, 1024]
    if (action !== 'reset' && (!Number.isSafeInteger(pixels) || pixels < min! || pixels > max!))
      return fail(`Enter a whole number from ${min} to ${max} pixels.`)
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (visible?.kind !== 'visible-window' || visible.sheetId !== sheetId)
      return fail('Wait for the worksheet to finish loading.')
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId,
      requestId,
      window: visible.window,
      viewport: visible.viewport,
      reason: 'toolbar',
    })
    set(selectionSizePanelAtom, { ...state, busy: true, error: null })
    try {
      const result = await connection.request('range.resize', {
        sheetId,
        range: state.target.range,
        axis: action,
        pixels,
        projection,
      })
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      if (!validateProjectionResult(result.projection, { request: projection }).ok)
        throw new Error('Rust returned a mismatched size result.')
      // 先合并完整目标的尺寸，屏幕外部分也会影响后续滚动定位。
      applyProjectionSizes(get, set, {
        ...result.projection,
        window: state.target.range,
        ...result.sizes,
      })
      set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
      set(selectionSizePanelAtom, CLOSED)
      return true
    } catch (error) {
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      return fail(error instanceof Error ? error.message : String(error))
    } finally {
      if (get(selectionSizePanelAtom).busy) set(selectionSizePanelAtom, CLOSED)
    }
  },
)
runSelectionSizeAtom.debugLabel = 'spreadsheet.viewport.runSelectionSize'
