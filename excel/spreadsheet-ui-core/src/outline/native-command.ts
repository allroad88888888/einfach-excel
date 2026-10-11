import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import {
  selectionSnapshotAtom,
  selectionRegionsAtom,
  selectionAuthorityWitnessAtom,
} from '../selection'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import { validSheetVisibility } from '../viewport/hidden-state'
import { revealVisibleSelection } from '../viewport/reveal-visible-selection'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionVisibilityFeedbackAtom } from '../toolbar/selection-visibility-command'
import {
  EMPTY_NATIVE_OUTLINE,
  nativeOutlineProjectionBackingAtom,
  type NativeOutlineAction,
} from './native-state'

export const nativeOutlineAtom = atom((get) => {
  const sheet = get(activeWorkbookSheetAtom)
  return (
    (sheet ? get(nativeOutlineProjectionBackingAtom)[sheet.id]?.outline : undefined) ??
    EMPTY_NATIVE_OUTLINE
  )
})
export const nativeOutlineFeedbackAtom = atom({ busy: false, error: '' })

/** 一次手势直达 Rust，返回同一次投影；不调用旧 TS outline 的修改或历史。 */
export const runNativeOutlineAtom = atom(
  null,
  async (
    get,
    set,
    input: {
      readonly axis: 'row' | 'column'
      readonly action: NativeOutlineAction | { readonly kind: 'group' | 'ungroup' }
    },
  ): Promise<boolean> => {
    if (
      get(nativeOutlineFeedbackAtom).busy ||
      get(editingSessionAtom).source ||
      get(rustHistoryPanelAtom).busy ||
      get(sheetTabsAtom).mutation ||
      get(selectionStructureFeedbackAtom).busy ||
      get(selectionVisibilityFeedbackAtom).busy
    )
      return false
    const sheet = get(activeWorkbookSheetAtom)
    const connection = get(rustWorkbookConnectionAtom)
    if (!sheet || !connection) return false
    const fail = (error: string) => {
      set(nativeOutlineFeedbackAtom, { busy: false, error })
      return false
    }
    if (getSheetProtection(get(sheetProtectionAtom), sheet.id).mode === 'protected')
      return fail('Unprotect the worksheet before changing outline groups.')
    const selection = get(selectionSnapshotAtom)
    const authority = get(selectionAuthorityWitnessAtom)
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (
      // 分组栏改变视口尺寸会触发保留旧帧的重读；它不改变原生大纲版本。
      // 已显示的同表版本仍可发命令，真正过期的版本由 Worker 拒绝。
      (witness.status !== 'ready' && witness.status !== 'loading') ||
      visible?.kind !== 'visible-window' ||
      visible.sheetId !== sheet.id ||
      witness.result?.sheetId !== sheet.id ||
      witness.result.revision === undefined ||
      selection.selection.sheetId !== sheet.id
    )
      return fail('Wait for the worksheet to finish loading.')
    let action = input.action as NativeOutlineAction
    if (
      (input.action.kind === 'group' || input.action.kind === 'ungroup') &&
      !('start' in input.action)
    ) {
      if (get(selectionRegionsAtom).length !== 1) return fail('Choose one continuous range.')
      const { range } = selection
      action = {
        kind: input.action.kind,
        start: input.axis === 'row' ? range.rowStart : range.colStart,
        end: input.axis === 'row' ? range.rowEnd : range.colEnd,
      }
    }
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId: sheet.id,
      requestId,
      window: visible.window,
      viewport: visible.viewport,
      reason: 'toolbar',
    })
    const busy = { busy: true, error: '' }
    set(nativeOutlineFeedbackAtom, busy)
    try {
      const pending = connection.request('outline.change', {
        sheetId: sheet.id,
        axis: input.axis,
        action,
        revision: witness.result.revision,
        projection,
      })
      await Promise.resolve()
      set(nativeOutlineFeedbackAtom, busy)
      const result = await pending
      if (
        get(rustWorkbookConnectionAtom) !== connection ||
        get(activeWorkbookSheetAtom)?.id !== sheet.id
      )
        return false
      if (
        !validateProjectionResult(result.projection, { request: projection }).ok ||
        !validSheetVisibility(result.projection.visibility)
      )
        throw new Error('Rust returned a mismatched outline result.')
      const applied = set(applyVisibleProjectionAtom, {
        witness,
        request: projection,
        result: result.projection,
      })
      if (applied.status === 'applied' && get(selectionAuthorityWitnessAtom) === authority)
        revealVisibleSelection(get, set, sheet, selection.activeCell)
      set(nativeOutlineFeedbackAtom, { busy: false, error: '' })
      return true
    } catch (error) {
      if (
        get(rustWorkbookConnectionAtom) !== connection ||
        get(activeWorkbookSheetAtom)?.id !== sheet.id
      )
        return false
      return fail(error instanceof Error ? error.message : String(error))
    } finally {
      if (get(nativeOutlineFeedbackAtom) === busy)
        set(nativeOutlineFeedbackAtom, { busy: false, error: '' })
    }
  },
)
