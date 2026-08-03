/**
 * 公式栏的**按键路由** —— 一个键按下来该归谁处理。
 *
 * 从 `SpreadsheetFormulaBar.tsx` 拆出来的原因是它自成一件事：优先级是固定的
 * （只读 → 自动补全 → 提交/取消），而组件那边关心的是「显示什么、同步什么」。
 * 两件事混在一个文件里时，改补全优先级要在三百行渲染代码中间找那段 if。
 */
import type { Store } from '@einfach/core'
import {
  dismissFormulaSuggestionsAtom,
  formulaFunctionSuggestionCursorAtom,
  formulaFunctionSuggestionsAtom,
} from '@einfach/spreadsheet-ui-core'
import { acceptFormulaSuggestion, readActiveFormulaSuggestion } from '../provider/edit-dispatch'

/** `keyCode` 分支留着给不填 `key`/`code` 的老 IME 与合成事件。 */
export function isCommitKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.code === 'Enter' || event.keyCode === 13
}

export function isEscapeKey(event: KeyboardEvent): boolean {
  return (
    event.key === 'Escape' ||
    event.key === 'Esc' ||
    event.code === 'Escape' ||
    event.code === 'Esc' ||
    event.keyCode === 27
  )
}

export interface FormulaBarKeyHandlerDeps {
  store: Store
  /**
   * 这条输入框此刻是不是**只读**（活动单元格是数组的投影格）。只读时一个键都不
   * 处理：没有会话可提交、没有草稿可取消，走下去只会碰到只在 drafting 时才成立
   * 的分支。
   */
  isReadonly: () => boolean
  commit: () => Promise<void>
  cancel: () => void
  /** 接受补全后把光标放进函数括号里。input 引用在组件那边。 */
  setCaret: (caret: number) => void
}

export function createFormulaBarKeyHandler(
  deps: FormulaBarKeyHandlerDeps,
): (event: KeyboardEvent) => Promise<void> {
  const { store } = deps

  return async function handleKeyDown(event: KeyboardEvent): Promise<void> {
    if (deps.isReadonly()) return

    // Autocomplete first: when the dropdown has rows, ArrowUp/Down move
    // the cursor and Tab/Enter accept the highlighted suggestion (open
    // the function paren without committing the cell). Esc dismisses.
    const suggestionsOpen = store.getter(formulaFunctionSuggestionsAtom).length > 0
    if (suggestionsOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const list = store.getter(formulaFunctionSuggestionsAtom)
        const current = store.getter(formulaFunctionSuggestionCursorAtom)
        const next =
          event.key === 'ArrowDown'
            ? (current + 1) % list.length
            : (current - 1 + list.length) % list.length
        store.setter(formulaFunctionSuggestionCursorAtom, next)
        return
      }
      if (event.key === 'Tab' || isCommitKey(event)) {
        const suggestion = readActiveFormulaSuggestion(store)
        if (suggestion) {
          event.preventDefault()
          const { caret } = acceptFormulaSuggestion(store, suggestion)
          queueMicrotask(() => deps.setCaret(caret))
          return
        }
      }
    }

    if (isCommitKey(event)) {
      event.preventDefault()
      await deps.commit()
      return
    }

    if (isEscapeKey(event)) {
      // Autocomplete-first: if the popup is open, Esc dismisses it but
      // keeps the editing session active so the user can keep typing.
      // Only the second Esc (or Esc with no popup) cancels editing.
      if (suggestionsOpen) {
        event.preventDefault()
        store.setter(dismissFormulaSuggestionsAtom)
        store.setter(formulaFunctionSuggestionCursorAtom, 0)
        return
      }
      event.preventDefault()
      deps.cancel()
    }
  }
}
