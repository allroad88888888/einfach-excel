import { atom } from '@einfach/core'
import { editingDraftAtom, editingSessionAtom } from '../editing/session-atoms'
import { activeEditingCommitTicketAtom } from '../editing/commit-state'
import { keyboardModeAtom } from '../keyboard'
import { parseFormulaReferences } from './parser'
import { formulaReferenceCaretBackingAtom, formulaReferenceSessionBackingAtom } from './state'

/** 只改引用的 $ 标记：相对 → 全绝对 → 锁行 → 锁列 → 相对。 */
function cycleReference(text: string): string {
  const prefixEnd = text.lastIndexOf('!') + 1
  return (
    text.slice(0, prefixEnd) +
    text
      .slice(prefixEnd)
      .replace(
        /(\$?)([A-Z]+)(\$?)(\d+)/gi,
        (_all, columnLock: string, column: string, rowLock: string, row: string) => {
          if (!columnLock && !rowLock) return `$${column}$${row}`
          if (columnLock && rowLock) return `${column}$${row}`
          if (rowLock) return `$${column}${row}`
          return `${column}${row}`
        },
      )
  )
}

/** F4 只作用于光标所在/选中的引用；数字、字符串、函数名保持原样。 */
export const toggleFormulaReferenceAtom = atom(
  null,
  (get, set, selection: { start: number; end: number }): number | null => {
    const editing = get(editingSessionAtom)
    if (
      !editing.source ||
      !editing.draft.startsWith('=') ||
      get(activeEditingCommitTicketAtom) !== null
    )
      return null
    const tokens = parseFormulaReferences(editing.draft, editing.source.sheetId).filter((token) =>
      selection.start === selection.end
        ? token.start <= selection.start && selection.start <= token.end
        : token.start < selection.end && token.end > selection.start,
    )
    if (tokens.length === 0) return null
    let draft = editing.draft
    let end = 0
    let delta = 0
    for (const token of tokens) {
      const text = cycleReference(token.text)
      const start = token.start + delta
      end = start + text.length
      draft = draft.slice(0, start) + text + draft.slice(token.end + delta)
      delta += text.length - token.text.length
    }
    set(editingDraftAtom, { draft })
    set(formulaReferenceCaretBackingAtom, end)
    const reference = get(formulaReferenceSessionBackingAtom)
    if (
      reference?.tokenRange &&
      tokens.length === 1 &&
      reference.tokenRange.start === tokens[0].start
    )
      set(formulaReferenceSessionBackingAtom, {
        ...reference,
        tokenRange: { start: tokens[0].start, end },
      })
    else {
      set(formulaReferenceSessionBackingAtom, null)
      set(keyboardModeAtom, 'editing')
    }
    return end
  },
)
