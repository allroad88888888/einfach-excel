import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import {
  blurNameBoxAtom,
  commitNameBoxAtom,
  focusNameBoxAtom,
  nameBoxStateAtom,
  nativeNameChangeBusyAtom,
  revertNameBoxAtom,
  scrollToCellAtom,
  updateNameBoxInputAtom,
  type CellCoord,
  type NameBoxCommitTarget,
} from '@einfach-excel/spreadsheet-ui-core'
import { useId, useRef, type FocusEvent, type FormEvent, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import {
  getWorkbookGridViewportHeight, getWorkbookGridViewportWidth,
} from '../../grid/viewport/use-workbook-grid-viewport-measurement'

function navigationCoord(target: NameBoxCommitTarget): CellCoord | null {
  if (target.kind === 'cell') return target.coord
  if (target.kind === 'range') {
    return { row: target.range.rowStart, col: target.range.colStart }
  }
  if (target.kind !== 'named-range') return null
  return (
    target.coord ??
    (target.range ? { row: target.range.rowStart, col: target.range.colStart } : null)
  )
}

/** Adapts the shared name-box atoms to one address input. */
export function NameBox() {
  const { i18n, t } = useLingui()
  const state = useAtomValue(nameBoxStateAtom)
  const busy = useAtomValue(nativeNameChangeBusyAtom)
  const errorId = useId()
  const focusNameBox = useSetAtom(focusNameBoxAtom)
  const updateNameBoxInput = useSetAtom(updateNameBoxInputAtom)
  const commitNameBox = useSetAtom(commitNameBoxAtom)
  const revertNameBox = useSetAtom(revertNameBoxAtom)
  const blurNameBox = useSetAtom(blurNameBoxAtom)
  const scrollToCell = useSetAtom(scrollToCellAtom)
  const inputRef = useRef<HTMLInputElement>(null)
  const domSessionIdRef = useRef<number>()
  const handledBlurSessionIdRef = useRef<number>()
  const value = state.focused || state.error ? state.input : state.display

  const navigate = (target: NameBoxCommitTarget) => {
    const coord = navigationCoord(target)
    if (coord === null) return
    const scroll = inputRef.current?.closest('.workbook')?.querySelector('.sheet-scroll')
    const viewportHeight = getWorkbookGridViewportHeight(scroll?.clientHeight ?? 0)
    const viewportWidth = getWorkbookGridViewportWidth(scroll?.clientWidth ?? 0)
    scrollToCell({
      // 放得下时让范围末端的填充柄也可见；已经可见则不多滚。
      coord, rowAlign: 'nearest', colAlign: 'nearest',
      range: target.kind === 'range' || target.kind === 'named-range' ? target.range : undefined,
      viewport: viewportHeight > 0 && viewportWidth > 0
        ? { viewportHeight, viewportWidth } : undefined,
    })
  }
  const commit = (input: string, sessionId: number) => {
    // 切表加载期间旧投影仍可显示；目标表由 command 的当前选区决定。
    const target = commitNameBox({ input, sessionId })
    if (!(target instanceof Promise)) navigate(target)
    return target
  }
  const focusGrid = () => {
    inputRef.current
      ?.closest('.workbook')
      ?.querySelector<HTMLElement>('[data-workbook-grid="true"]')
      ?.focus({ preventScroll: true })
  }
  const finishFromKeyboard = (input: HTMLInputElement, sessionId: number) => {
    handledBlurSessionIdRef.current = sessionId
    input.blur()
    focusGrid()
  }
  const onFocus = (event: FocusEvent<HTMLInputElement>) => {
    // 先把最新选区地址落到受控 input，再全选；否则随后渲染会把光标推到末尾。
    flushSync(() => { domSessionIdRef.current = focusNameBox() })
    handledBlurSessionIdRef.current = undefined
    event.currentTarget.select()
  }
  const onInput = (event: FormEvent<HTMLInputElement>) => {
    const sessionId = domSessionIdRef.current
    if (sessionId === undefined) return
    updateNameBoxInput({ input: event.currentTarget.value, sessionId })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const sessionId = domSessionIdRef.current
    if (sessionId === undefined) return
    event.stopPropagation()
    if (event.key === 'Enter') {
      if (busy || event.nativeEvent.isComposing || event.keyCode === 229) return
      event.preventDefault()
      const input = event.currentTarget
      const result = commit(input.value, sessionId)
      const finish = (target: NameBoxCommitTarget) => {
        if (target.kind !== 'invalid' && domSessionIdRef.current === sessionId &&
          document.activeElement === input) finishFromKeyboard(input, sessionId)
      }
      if (result instanceof Promise) void result.then(finish)
      else if (result.kind !== 'invalid') finishFromKeyboard(input, sessionId)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      revertNameBox({ sessionId })
      finishFromKeyboard(event.currentTarget, sessionId)
    }
  }
  const onBlur = (event: FocusEvent<HTMLInputElement>) => {
    const sessionId = domSessionIdRef.current
    if (sessionId === undefined) return
    if (handledBlurSessionIdRef.current === sessionId) {
      handledBlurSessionIdRef.current = undefined
    } else if (
      event.currentTarget.value.trim().length === 0 ||
      event.currentTarget.value === state.lastCommitted
    ) {
      revertNameBox({ sessionId })
    } else if (!busy && state.mode !== 'committing' && !state.error) {
      // 异步创建完成后不抢回用户已经移开的焦点。
      void commit(event.currentTarget.value, sessionId)
    }
    blurNameBox({ sessionId })
    domSessionIdRef.current = undefined
  }

  return (
    <span className="name-box-control">
      <input
        ref={inputRef}
        aria-invalid={state.error || undefined}
        aria-label={t`Name box`}
        aria-describedby={state.error ? errorId : undefined}
        aria-busy={busy || undefined}
        readOnly={busy}
        autoComplete="off"
        className={state.error ? 'name-box name-box-error' : 'name-box'}
        data-mode={state.mode}
        onBlur={onBlur}
        onFocus={onFocus}
        onInput={onInput}
        onKeyDown={onKeyDown}
        spellCheck={false}
        value={value}
      />
      {state.errorMessage && <span id={errorId} role="alert" className="name-box-feedback">
        {translateFeedback(i18n, state.errorMessage)}
      </span>}
    </span>
  )
}
