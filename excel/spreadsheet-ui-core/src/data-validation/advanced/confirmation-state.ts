import { atom } from '@einfach/core'
import type { RustWorkbookCommands, RustWorkbookConnection } from '../../rust-workbook/commands'
import type { ProjectionSnapshot } from '../../projection'
import { projectionSnapshotAtom } from '../../projection'
import { editingSessionAtom } from '../../editing/session-atoms'
import type { EditingSessionState } from '../../editing/types'
import { rustWorkbookConnectionAtom } from '../../runtime/workbook-connection'
import type { NativeValidationErrorStyle } from '../native-rule'

type BatchCommand = 'clipboard.paste' | 'range.fill'
type BatchOperation = { [K in BatchCommand]: {
  readonly command: K; readonly payload: RustWorkbookCommands[K]['payload']
} }[BatchCommand]
export type ValidationConfirmationOperation = BatchOperation | { readonly command: 'cell.setInput' }
export interface NativeValidationConfirmation {
  readonly connection: RustWorkbookConnection
  readonly witness: ProjectionSnapshot
  readonly operation: ValidationConfirmationOperation
  readonly session: EditingSessionState
  readonly style: NativeValidationErrorStyle
  readonly title: string
  readonly message: string
  readonly busy: boolean
  readonly error: string
}
export const validationConfirmationBackingAtom = atom<NativeValidationConfirmation | null>(null)

export function validationErrorStyle(error: unknown): NativeValidationErrorStyle | null {
  const message = error instanceof Error ? error.message : String(error)
  const code = /^(?:auto-fill rejected: )?(DATA_VALIDATION_(?:INFORMATION|WARNING|FAILED))$/.exec(message)?.[1]
  return code === 'DATA_VALIDATION_INFORMATION' ? 'information'
    : code === 'DATA_VALIDATION_WARNING' ? 'warning'
      : code === 'DATA_VALIDATION_FAILED' ? 'stop' : null
}

/** 失败原操作只保存不可变参数；Continue 不读取变化后的选区或系统剪贴板。 */
export const offerNativeValidationConfirmationAtom = atom(null, (get, set, input: {
  readonly error: unknown
  readonly operation: ValidationConfirmationOperation
  readonly witness?: ProjectionSnapshot
}): boolean => {
  const connection = get(rustWorkbookConnectionAtom)
  const style = validationErrorStyle(input.error)
  if (!connection || !style || get(validationConfirmationBackingAtom)?.busy) return false
  const operation = input.operation.command === 'cell.setInput' ? input.operation
    : { ...input.operation, payload: structuredClone(input.operation.payload) } as BatchOperation
  const detail = input.error && typeof input.error === 'object' && 'detail' in input.error
    ? input.error.detail as { title?: unknown; message?: unknown } : null
  set(validationConfirmationBackingAtom, { connection, style, operation,
    witness: input.witness ?? get(projectionSnapshotAtom), session: get(editingSessionAtom),
    title: typeof detail?.title === 'string' ? detail.title : '',
    message: typeof detail?.message === 'string' ? detail.message : '', busy: false, error: '' })
  return true
})

export const nativeValidationConfirmationAtom = atom(get => {
  const state = get(validationConfirmationBackingAtom)
  if (!state || state.connection !== get(rustWorkbookConnectionAtom)) return null
  if (state.operation.command === 'cell.setInput' && state.session !== get(editingSessionAtom)) return null
  return state
})
