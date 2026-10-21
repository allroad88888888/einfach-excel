import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { workspaceActiveSheetAuthorityWitnessAtom } from '../workspace'
import type { RustWorkbookConnection } from '../rust-workbook'

type PainterMode = 'idle' | 'armed' | 'sticky'
interface PainterSession {
  readonly connection: RustWorkbookConnection
  readonly workspace: unknown
}
interface PainterState {
  readonly mode: PainterMode
  readonly busy: boolean
  readonly message: string
  readonly error: boolean
  readonly session: PainterSession | null
  readonly token?: string
}
export const IDLE: PainterState = { mode: 'idle', busy: false, message: '', error: false, session: null }
export const painterStateAtom = atom<PainterState>(IDLE)

/** 这里只保留 UI 模式和 Rust 快照凭证，不缓存任何单元格样式。切表／换连接后永久失效。 */
export const formatPainterAtom = atom((get) => {
  const state = get(painterStateAtom)
  return state.session && (state.session.connection !== get(rustWorkbookConnectionAtom) ||
    state.session.workspace !== get(workspaceActiveSheetAuthorityWitnessAtom)) ? IDLE : state
})
formatPainterAtom.debugLabel = 'spreadsheet.formatPainter'
