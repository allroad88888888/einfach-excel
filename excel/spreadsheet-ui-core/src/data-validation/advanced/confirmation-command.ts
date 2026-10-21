import { atom } from '@einfach/core'
import { commitCellEditingAtom } from '../../editing/commit-cell-editing'
import { projectionSnapshotAtom } from '../../projection'
import { rustWorkbookConnectionAtom } from '../../runtime/workbook-connection'
import { resumeValidatedPasteAtom } from '../../clipboard/system-clipboard-command'
import { resumeValidatedFillAtom } from '../../auto-fill/directional-command'
import { editingCommitLifecycleAtom } from '../../editing/commit-state'
import { nativeValidationConfirmationAtom, validationConfirmationBackingAtom } from './confirmation-state'
import { validationErrorStyle } from './confirmation-state'

/** 明确 Continue 才发原操作，Stop 无继续入口；取消只关闭提示，不丢失编辑草稿。 */
export const runNativeValidationConfirmationAtom = atom(null, async (get, set,
  action: 'continue' | 'cancel',
): Promise<boolean> => {
  const state = get(nativeValidationConfirmationAtom)
  if (!state || state.busy) return false
  if (action === 'cancel') { set(validationConfirmationBackingAtom, null); return true }
  if (state.style === 'stop') return false
  const current = get(projectionSnapshotAtom)
  if (current.result?.revision !== state.witness.result?.revision ||
    state.connection !== get(rustWorkbookConnectionAtom)) {
    set(validationConfirmationBackingAtom, { ...state, error: 'The workbook changed. Submit the operation again.' })
    return false
  }
  const pending = { ...state, busy: true, error: '' }
  set(validationConfirmationBackingAtom, pending)
  try {
    let success: boolean
    if (state.operation.command === 'cell.setInput') {
      success = await set(commitCellEditingAtom, {
        validationConfirmation: 'continue', validationRevision: state.witness.result?.revision,
      }) === 'completed'
    } else {
      const confirmation = { validationConfirmation: 'continue' as const,
        validationRevision: state.witness.result?.revision }
      // 原语义命令持有成功收尾，确认层只固定原操作参数并表达用户同意。
      success =
        state.operation.command === 'clipboard.paste'
          ? await set(resumeValidatedPasteAtom, {
              connection: state.connection,
              witness: current,
              payload: {
                ...state.operation.payload,
                request: { ...state.operation.payload.request, ...confirmation },
              },
            })
          : await set(resumeValidatedFillAtom, {
              connection: state.connection,
              witness: current,
              payload: {
                ...state.operation.payload,
                request: { ...state.operation.payload.request, ...confirmation },
              },
            })
    }
    if (get(validationConfirmationBackingAtom) === pending)
      set(validationConfirmationBackingAtom, success ? null : { ...pending, busy: false,
        ...(state.operation.command === 'cell.setInput' && validationErrorStyle(get(editingCommitLifecycleAtom).error) === 'stop'
          ? { style: 'stop' as const } : {}),
        error: 'The input was not accepted. Review the draft and submit again.' })
    return success
  } catch (error) {
    const style = validationErrorStyle(error)
    const detail = error && typeof error === 'object' && 'detail' in error
      ? error.detail as { title?: unknown; message?: unknown } : null
    if (get(validationConfirmationBackingAtom) === pending)
      set(validationConfirmationBackingAtom, { ...pending, busy: false,
        ...(style ? { style,
          title: typeof detail?.title === 'string' ? detail.title : '',
          message: typeof detail?.message === 'string' ? detail.message : '' } : {}),
        error: error instanceof Error ? error.message : String(error) })
    return false
  }
})
