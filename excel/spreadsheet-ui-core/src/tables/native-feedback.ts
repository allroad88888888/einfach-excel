import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'

/** 独立于命令的 UI 反馈，编辑/历史可以读取同一在途状态而不循环引用 Table 命令。 */
export const nativeTableFeedbackBackingAtom = atom({
  connection: null as RustWorkbookConnection | null,
  busy: false, error: null as string | null })
export const nativeTableFeedbackAtom = atom((get) => {
  const state = get(nativeTableFeedbackBackingAtom)
  return state.connection === get(rustWorkbookConnectionAtom)
    ? { busy: state.busy, error: state.error } : { busy: false, error: null }
})
