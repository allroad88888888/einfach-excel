import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { editingSessionAtom } from '../editing/session-atoms'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type { DisplayCell } from '../backend'

// 每张表的会话视图偏好；不改 Rust 数据、原始投影或剪贴板输出。
const stateAtom = atom<{
  connection: RustWorkbookConnection | null
  sheets: Readonly<Record<string, boolean>>
}>({ connection: null, sheets: {} })
export const showFormulasAtom = atom((get) => {
  const state = get(stateAtom)
  const sheet = get(activeWorkbookSheetAtom)
  return !!sheet && state.connection === get(rustWorkbookConnectionAtom) && !!state.sheets[sheet.id]
})
export const formulaViewAvailableAtom = atom((get) =>
  !!get(activeWorkbookSheetAtom) && !!get(rustWorkbookConnectionAtom) &&
  !get(editingSessionAtom).source)
export const toggleFormulaViewAtom = atom(null, (get, set): void => {
  if (!get(formulaViewAvailableAtom)) return
  const sheet = get(activeWorkbookSheetAtom)!
  const connection = get(rustWorkbookConnectionAtom)
  const state = get(stateAtom)
  set(stateAtom, { connection, sheets: {
    ...(state.connection === connection ? state.sheets : {}), [sheet.id]: !get(showFormulasAtom),
  } })
})

/** 两种网格共用一个取文规则；强制文本即使以 = 开头也不是公式。 */
export function formulaViewText(cell: DisplayCell | undefined, show: boolean): string {
  return (show ? cell?.formula : undefined) ?? cell?.displayValue ?? ''
}
