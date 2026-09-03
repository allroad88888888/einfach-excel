import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  blurNameBoxAtom,
  commitNameBoxAtom,
  focusNameBoxAtom,
  nameBoxStateAtom,
  projectionSnapshotAtom,
  revertNameBoxAtom,
  scrollToCellAtom,
  updateNameBoxInputAtom,
  type CellCoord,
  type NameBoxCommitTarget,
} from '@einfach/spreadsheet-ui-core'
import { useRef, type FocusEvent, type FormEvent, type KeyboardEvent } from 'react'

function navigationCoord(target: NameBoxCommitTarget): CellCoord | null {
  if (target.kind === 'cell') return target.coord
  if (target.kind === 'range') {
    return { row: target.range.rowStart, col: target.range.colStart }
  }
  if (target.kind !== 'named-range') return null
  return target.coord ?? (target.range
    ? { row: target.range.rowStart, col: target.range.colStart }
    : null)
}

/** Adapts the shared name-box atoms to one address input. */
export function NameBox() {
  const state = useAtomValue(nameBoxStateAtom)
  const projection = useAtomValue(projectionSnapshotAtom).result
  const focusNameBox = useSetAtom(focusNameBoxAtom)
  const updateNameBoxInput = useSetAtom(updateNameBoxInputAtom)
  const commitNameBox = useSetAtom(commitNameBoxAtom)
  const revertNameBox = useSetAtom(revertNameBoxAtom)
  const blurNameBox = useSetAtom(blurNameBoxAtom)
  const scrollToCell = useSetAtom(scrollToCellAtom)
  const inputRef = useRef<HTMLInputElement>(null)
  const domSessionIdRef = useRef<number>()
  const handledBlurSessionIdRef = useRef<number>()
  const value = state.focused ? state.input : state.display
  const activeSheetId = projection?.kind === 'visible-window'
    ? projection.sheetId
    : state.primaryRegion.sheetId

  const navigate = (target: NameBoxCommitTarget) => {
    const coord = navigationCoord(target)
    if (coord === null) return
    scrollToCell({ coord, rowAlign: 'start', colAlign: 'nearest' })
  }
  const commit = (input: string, sessionId: number) => {
    const target = commitNameBox({ input, sessionId, sheetId: activeSheetId })
    navigate(target)
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
    domSessionIdRef.current = focusNameBox()
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
      event.preventDefault()
      commit(event.currentTarget.value, sessionId)
      finishFromKeyboard(event.currentTarget, sessionId)
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
    } else {
      commit(event.currentTarget.value, sessionId)
    }
    blurNameBox({ sessionId })
    domSessionIdRef.current = undefined
  }

  return (
    <input
      ref={inputRef}
      aria-invalid={state.error || undefined}
      aria-label="Name box"
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
  )
}
