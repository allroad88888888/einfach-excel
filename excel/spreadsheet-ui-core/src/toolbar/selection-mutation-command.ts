import { atom } from '@einfach/core'
import type { SpreadsheetCellFormat } from '../backend'
import type { RangeBorderPatch } from '../backend/format-contracts'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { editingSessionAtom } from '../editing/session-atoms'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { applyProjectionSizes } from '../projection/projection-sizes'
import type { RustClearRangeMode, RustClearRangeRequest, RustWorkbookConnection } from '../rust-workbook/commands'
import { selectionRegionsAtom, selectionRangesAtom, selectionSnapshotAtom } from '../selection'
import { selectionStructureFeedbackAtom } from './selection-structure-state'
import { selectionMergeFeedbackAtom } from './selection-merge-state'

export type SelectionMutationOutcome = 'completed' | 'blocked' | 'superseded' | 'rejected'
type SelectionMutation =
  | {
      readonly kind: 'format'
      readonly format: SpreadsheetCellFormat
      readonly clearFormatFields?: readonly (keyof SpreadsheetCellFormat)[]
      readonly borderPatch?: RangeBorderPatch
    }
  | { readonly kind: 'clear'; readonly mode: RustClearRangeMode }

const feedbackAtom = atom({ connection: null as RustWorkbookConnection | null,
  busy: false, error: null as string | null })
/** 忙碌和失败需要实际显示；连接改变时不能把旧工作簿的错误带入新文档。 */
export const selectionMutationFeedbackAtom = atom((get) => {
  const feedback = get(feedbackAtom)
  return feedback.connection === get(rustWorkbookConnectionAtom)
    ? feedback : { busy: false, error: null }
})

/** 区域写入共用一次保护检查、一次 Rust RPC 和一次返回投影发布。 */
export const runSelectionMutationAtom = atom(
  null,
  async (get, set, input: SelectionMutation): Promise<SelectionMutationOutcome> => {
    const regions = get(selectionRegionsAtom)
    // 多区属性 patch 与清除已接原子事务；几何边框仍要求连续范围。
    if (input.kind === 'format' && input.borderPatch && regions.length !== 1) return 'blocked'
    if (get(selectionMutationFeedbackAtom).busy) return 'blocked'
    if (get(selectionStructureFeedbackAtom).busy || get(selectionMergeFeedbackAtom).busy) return 'blocked'
    const selection = get(selectionSnapshotAtom)
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    const connection = get(rustWorkbookConnectionAtom)
    if (
      !connection ||
      !selection.selection.sheetId ||
      visible?.kind !== 'visible-window' ||
      visible.sheetId !== selection.selection.sheetId
    )
      return 'blocked'
    if (input.kind === 'clear' && get(editingSessionAtom).source !== null) return 'blocked'
    // 格式面板已有自己的错误与重试入口；底栏只承担没有面板的清除错误，避免重复播报。
    const fail = (error: string) => set(feedbackAtom, {
      connection, busy: false, error: input.kind === 'clear' ? error : null,
    })
    if (regions.some((region) => region.sheetId !== selection.selection.sheetId)) {
      fail('Select cells on one worksheet before changing them.')
      return 'blocked'
    }
    const ranges = get(selectionRangesAtom)
    const targets: NonNullable<RustClearRangeRequest['targets']>[number][] = []
    for (const [index, region] of regions.entries()) {
      const resolution = set(resolveContentMutationAtom, {
        kind: input.kind === 'format' ? 'set-format-range' : 'clear-range',
        sheetId: selection.selection.sheetId, range: ranges[index],
      })
      if (resolution.status === 'blocked') {
        fail(resolution.diagnostic.message)
        return 'blocked'
      }
      const range = resolution.ranges?.[0]
      if (!range) return 'blocked'
      targets.push({ ...range, scope: region.kind === 'row' ? 'row'
        : region.kind === 'column' ? 'column' : 'cell' })
    }
    const range = selection.range
    const requestId = set(issueProjectionRequestIdAtom)
    if (!range || requestId === null) return 'blocked'

    const base = {
      sheetId: selection.selection.sheetId,
      requestId,
      range: { ...range },
      scope:
        selection.selection.kind === 'row'
          ? ('row' as const)
          : selection.selection.kind === 'column'
            ? ('column' as const)
            : ('cell' as const),
    }
    const projection = createVisibleProjectionRequest({
      sheetId: visible.sheetId,
      window: visible.window,
      viewport: visible.viewport,
      requestId,
      reason: 'toolbar',
    })
    const pending = { connection, busy: true, error: null }
    set(feedbackAtom, pending)
    try {
      const response =
        input.kind === 'format'
          ? await connection.request('format.setRange', {
              request: {
                ...base,
                kind: 'set-format-range',
                format: input.format,
                clearFormatFields: input.clearFormatFields,
                ...(input.borderPatch ? { borderPatch: input.borderPatch, scope: 'cell' as const } : {}),
                writeMode: 'patch',
                targets,
              },
              projection,
            })
          : await connection.request('range.clear', {
              request: { ...base, mode: input.mode, targets },
              projection,
            })
      await Promise.resolve()
      if (get(feedbackAtom) === pending) set(feedbackAtom, pending)
      const result = await response
      if (get(rustWorkbookConnectionAtom) !== connection) return 'superseded'
      const ack = result.acknowledgement
      if (ack.sheetId !== base.sheetId || ack.requestId !== requestId ||
        ack.revision !== result.projection.revision)
        throw new Error('The mutation response did not match this request. Try again.')
      const applied = set(applyVisibleProjectionAtom, {
        witness, request: projection, result: result.projection,
      })
      // 大字号可改变屏幕外行高；复用稀疏尺寸缓存，不增加一次 Worker 往返。
      if (applied.status === 'applied' && result.sizes)
        applyProjectionSizes(get, set, {
          ...result.projection, window: ack.affectedRange ?? base.range, ...result.sizes,
        })
      return applied.status === 'applied' ? 'completed' : 'superseded'
    } catch (error) {
      if (get(rustWorkbookConnectionAtom) !== connection) return 'superseded'
      fail(error instanceof Error ? error.message : String(error))
      return 'rejected'
    } finally {
      if (get(feedbackAtom) === pending) set(feedbackAtom, { ...pending, busy: false })
    }
  },
)
runSelectionMutationAtom.debugLabel = 'spreadsheet.toolbar.runSelectionMutation'

/** 清除命令只指定模式，目标范围始终来自当前选区。 */
export const clearSelectionAtom = atom(null, (_get, set, mode: RustClearRangeMode) =>
  set(runSelectionMutationAtom, { kind: 'clear', mode }),
)
clearSelectionAtom.debugLabel = 'spreadsheet.toolbar.clearSelection'
