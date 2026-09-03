import { atom, type Atom } from '@einfach/core'
import type { RustWorkbookConnection } from '../rust-workbook'
import { setRustWorkbookConnectionAtom } from './workbook-connection'

export type SpreadsheetRuntimeState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready' }
  | { readonly status: 'error'; readonly message: string }

export interface ResolveSpreadsheetRuntimeInput {
  readonly connection: RustWorkbookConnection
}

const LOADING_RUNTIME_STATE: SpreadsheetRuntimeState = Object.freeze({ status: 'loading' })
const spreadsheetRuntimeBackingAtom = atom<SpreadsheetRuntimeState>(LOADING_RUNTIME_STATE)

spreadsheetRuntimeBackingAtom.debugLabel = 'spreadsheet.runtime.lifecycle.state'

export const spreadsheetRuntimeAtom: Atom<SpreadsheetRuntimeState> = atom((get) =>
  get(spreadsheetRuntimeBackingAtom),
)

spreadsheetRuntimeAtom.debugLabel = 'spreadsheet.runtime.lifecycle'

function runtimeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && error.message.length > 0) return error.message
    return String(error)
  } catch {
    return 'Unknown Rust workbook error.'
  }
}

/** 开始一次工作簿启动，并清掉旧的 Worker 连接。 */
export const beginSpreadsheetRuntimeAtom = atom(null, (_get, set): void => {
  set(setRustWorkbookConnectionAtom, null)
  set(spreadsheetRuntimeBackingAtom, LOADING_RUNTIME_STATE)
})

beginSpreadsheetRuntimeAtom.debugLabel = 'spreadsheet.runtime.begin'

/** 在同一个命令里发布可用连接和 ready 状态。 */
export const resolveSpreadsheetRuntimeAtom = atom(
  null,
  (_get, set, input: ResolveSpreadsheetRuntimeInput): void => {
    set(setRustWorkbookConnectionAtom, input.connection)
    set(spreadsheetRuntimeBackingAtom, Object.freeze({ status: 'ready' }))
  },
)

resolveSpreadsheetRuntimeAtom.debugLabel = 'spreadsheet.runtime.resolve'

/** 发布启动失败，并释放 store 对旧连接的引用。 */
export const rejectSpreadsheetRuntimeAtom = atom(null, (_get, set, error: unknown): void => {
  set(setRustWorkbookConnectionAtom, null)
  set(
    spreadsheetRuntimeBackingAtom,
    Object.freeze({ status: 'error', message: runtimeErrorMessage(error) }),
  )
})

rejectSpreadsheetRuntimeAtom.debugLabel = 'spreadsheet.runtime.reject'
