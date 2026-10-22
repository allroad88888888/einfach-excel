import { atom, type Atom } from '@einfach/core'
import type { RustWorkbookConnection } from '../rust-workbook'
import { bindHostConnection } from '../host/binding'

const rustWorkbookConnectionBackingAtom = atom<RustWorkbookConnection | null>(null)
rustWorkbookConnectionBackingAtom.debugLabel = 'spreadsheet.runtime.rustConnectionBacking'

/** 当前 store 的 Rust Worker 连接；工作簿数据仍只存在于 Rust。 */
export const rustWorkbookConnectionAtom: Atom<RustWorkbookConnection | null> = atom((get) =>
  get(rustWorkbookConnectionBackingAtom),
)
rustWorkbookConnectionAtom.debugLabel = 'spreadsheet.runtime.rustConnection'

/** 仅由启动和销毁流程替换连接资源。 */
export const setRustWorkbookConnectionAtom = atom(
  null,
  (get, set, connection: RustWorkbookConnection | null): void => {
    if (get(rustWorkbookConnectionBackingAtom) === connection) return
    set(rustWorkbookConnectionBackingAtom, connection)
    bindHostConnection(get, set, connection,
      () => get(rustWorkbookConnectionBackingAtom) === connection)
  },
)
setRustWorkbookConnectionAtom.debugLabel = 'spreadsheet.runtime.setRustConnection'
