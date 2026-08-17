import { createStore, type Store } from '@einfach/core'
import {
  lastKeyboardIntentAtom,
  selectionSnapshotAtom,
  setSelectionAtom,
  setSelectionBoundsAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { act, createEvent, fireEvent, render } from '@testing-library/react'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetKeyboardNavigation } from '../src/use-spreadsheet-keyboard-navigation'

const backend = {} as SpreadsheetBackend

interface KeyboardSurfaceProps {
  readonly id: string
  readonly onScrollToCell?: (intent: {
    readonly target: { readonly row: number; readonly col: number }
  }) => void
}

function KeyboardSurface({ id, onScrollToCell }: KeyboardSurfaceProps) {
  const handlers = useSpreadsheetKeyboardNavigation({
    pageRowDelta: 3,
    pageColDelta: 2,
    onScrollToCell,
  })
  return <div data-testid={id} {...handlers} />
}

function seedStore(store: Store, active = { row: 0, col: 0 }): void {
  store.setter(setSelectionBoundsAtom, { rowCount: 8, colCount: 7 })
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId: 'sheet-1',
    anchor: active,
    focus: active,
  })
}

function renderSurface(
  store: Store,
  active = { row: 0, col: 0 },
  onScrollToCell?: KeyboardSurfaceProps['onScrollToCell'],
) {
  seedStore(store, active)
  return render(
    <SpreadsheetUiProvider backend={backend} store={store}>
      <KeyboardSurface id="sheet-1" onScrollToCell={onScrollToCell} />
    </SpreadsheetUiProvider>,
  )
}

function dispatchKey(
  target: HTMLElement,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = createEvent.keyDown(target, { bubbles: true, cancelable: true, key, ...init })
  fireEvent(target, event)
  return event as KeyboardEvent
}

describe('useSpreadsheetKeyboardNavigation', () => {
  it('keeps keyboard movement isolated in independent provider stores', () => {
    const firstStore = createStore()
    const secondStore = createStore()
    seedStore(firstStore, { row: 2, col: 2 })
    seedStore(secondStore, { row: 5, col: 4 })
    const view = render(
      <>
        <SpreadsheetUiProvider backend={backend} store={firstStore}>
          <KeyboardSurface id="first" />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={backend} store={secondStore}>
          <KeyboardSurface id="second" />
        </SpreadsheetUiProvider>
      </>,
    )

    const event = dispatchKey(view.getByTestId('first'), 'ArrowRight')

    expect(event.defaultPrevented).toBe(true)
    expect(firstStore.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 2, col: 3 })
    expect(secondStore.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 5, col: 4 })
  })

  it('clamps arrows at bounds and extends the core range with Shift+Arrow', () => {
    const store = createStore()
    const view = renderSurface(store)
    const target = view.getByTestId('sheet-1')

    dispatchKey(target, 'ArrowUp')
    dispatchKey(target, 'ArrowLeft')
    dispatchKey(target, 'ArrowDown', { shiftKey: true })

    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 0,
      rowEnd: 1,
      colStart: 0,
      colEnd: 0,
    })
  })

  it('honors Ctrl and Meta arrow boundaries through the core dispatcher', () => {
    const store = createStore()
    const view = renderSurface(store, { row: 2, col: 3 })
    const target = view.getByTestId('sheet-1')

    dispatchKey(target, 'ArrowDown', { ctrlKey: true })
    dispatchKey(target, 'ArrowLeft', { metaKey: true })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 7, col: 0 })
  })

  it('uses visible row and column increments for paging and forwards scroll intents', () => {
    const store = createStore()
    const onScrollToCell = jest.fn()
    const view = renderSurface(store, { row: 2, col: 3 }, onScrollToCell)
    const target = view.getByTestId('sheet-1')

    dispatchKey(target, 'PageDown')
    dispatchKey(target, 'PageDown', { altKey: true })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 5, col: 5 })
    expect(onScrollToCell).toHaveBeenLastCalledWith({
      type: 'viewport.scrollToCell',
      target: { row: 5, col: 5 },
    })
  })

  it('leaves IME, F2, text, and copy input unprevented without moving the selection', () => {
    const store = createStore()
    const view = renderSurface(store, { row: 3, col: 3 })
    const target = view.getByTestId('sheet-1')

    const composing = dispatchKey(target, 'ArrowDown', { isComposing: true })
    expect(composing.defaultPrevented).toBe(false)
    expect(store.getter(lastKeyboardIntentAtom)).toEqual({ type: 'none', reason: 'composing' })

    for (const [key, init] of [
      ['F2', {}],
      ['x', {}],
      ['c', { ctrlKey: true }],
    ] as const) {
      const event = dispatchKey(target, key, init)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 3, col: 3 })
    expect(store.getter(lastKeyboardIntentAtom)).toEqual({ type: 'clipboard.copy' })
  })

  it('does not override a key event already consumed by another surface', () => {
    const store = createStore()
    const view = renderSurface(store, { row: 3, col: 3 })
    const target = view.getByTestId('sheet-1')

    act(() => {
      target.addEventListener('keydown', (event) => event.preventDefault(), { once: true })
      dispatchKey(target, 'ArrowDown')
    })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 3, col: 3 })
  })
})
