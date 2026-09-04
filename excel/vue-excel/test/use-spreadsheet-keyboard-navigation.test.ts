import { createStore, type Store } from '@einfach/core'
import {
  lastKeyboardIntentAtom,
  selectionSnapshotAtom,
  setSelectionAtom,
  setSelectionBoundsAtom,
  type ScrollToCellIntent,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import {
  useSpreadsheetKeyboardNavigation,
  type SpreadsheetKeyboardNavigationHandlers,
} from '../src/use-spreadsheet-keyboard-navigation'

const backend = {} as SpreadsheetBackend

interface MountedKeyboardNavigation {
  readonly app: ReturnType<typeof createApp>
  readonly navigation: SpreadsheetKeyboardNavigationHandlers
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

function mountKeyboardNavigation(
  store: Store,
  onScrollToCell?: (intent: ScrollToCellIntent) => void,
): MountedKeyboardNavigation {
  let navigation: SpreadsheetKeyboardNavigationHandlers | undefined
  const Capture = defineComponent({
    name: 'KeyboardNavigationCapture',
    setup: function KeyboardNavigationCaptureSetup() {
      navigation = useSpreadsheetKeyboardNavigation({
        pageRowDelta: 3,
        pageColDelta: 2,
        onScrollToCell,
      })
      return () => null
    },
  })
  const Root = defineComponent({
    setup() {
      return () => h(SpreadsheetUiProvider, { backend, store }, { default: () => h(Capture) })
    },
  })
  const app = createApp(Root)
  app.mount(document.createElement('div'))

  if (navigation === undefined) throw new Error('Keyboard-navigation hook was not mounted.')
  return { app, navigation }
}

function dispatchKey(
  navigation: SpreadsheetKeyboardNavigationHandlers,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })
  navigation.onKeydown(event)
  return event
}

describe('useSpreadsheetKeyboardNavigation', () => {
  it('keeps keyboard movement isolated in independent provider stores', () => {
    const firstStore = createStore()
    const secondStore = createStore()
    seedStore(firstStore, { row: 2, col: 2 })
    seedStore(secondStore, { row: 5, col: 4 })
    const first = mountKeyboardNavigation(firstStore)
    const second = mountKeyboardNavigation(secondStore)

    const event = dispatchKey(first.navigation, 'ArrowRight')

    expect(event.defaultPrevented).toBe(true)
    expect(firstStore.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 2, col: 3 })
    expect(secondStore.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 5, col: 4 })
    first.app.unmount()
    second.app.unmount()
  })

  it('clamps arrows at bounds and extends the core range with Shift+Arrow', () => {
    const store = createStore()
    seedStore(store)
    const mounted = mountKeyboardNavigation(store)

    dispatchKey(mounted.navigation, 'ArrowUp')
    dispatchKey(mounted.navigation, 'ArrowLeft')
    dispatchKey(mounted.navigation, 'ArrowDown', { shiftKey: true })

    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 0,
      rowEnd: 1,
      colStart: 0,
      colEnd: 0,
    })
    mounted.app.unmount()
  })

  it('honors Ctrl and Meta arrow boundaries through the core dispatcher', () => {
    const store = createStore()
    seedStore(store, { row: 2, col: 3 })
    const mounted = mountKeyboardNavigation(store)

    dispatchKey(mounted.navigation, 'ArrowDown', { ctrlKey: true })
    dispatchKey(mounted.navigation, 'ArrowLeft', { metaKey: true })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 7, col: 0 })
    mounted.app.unmount()
  })

  it('uses visible increments for paging and forwards core scroll intents', () => {
    const store = createStore()
    const onScrollToCell = vi.fn()
    seedStore(store, { row: 2, col: 3 })
    const mounted = mountKeyboardNavigation(store, onScrollToCell)

    dispatchKey(mounted.navigation, 'PageDown')
    dispatchKey(mounted.navigation, 'PageDown', { altKey: true })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 5, col: 5 })
    expect(onScrollToCell).toHaveBeenLastCalledWith({
      type: 'viewport.scrollToCell',
      target: { row: 5, col: 5 },
    })
    mounted.app.unmount()
  })

  it('leaves IME, F2, text, and copy input unprevented without moving the selection', () => {
    const store = createStore()
    seedStore(store, { row: 3, col: 3 })
    const mounted = mountKeyboardNavigation(store)

    const composing = dispatchKey(mounted.navigation, 'ArrowDown', { isComposing: true })
    expect(composing.defaultPrevented).toBe(false)
    expect(store.getter(lastKeyboardIntentAtom)).toEqual({ type: 'none', reason: 'composing' })

    for (const [key, init] of [
      ['F2', {}],
      ['x', {}],
      ['c', { ctrlKey: true }],
    ] as const) {
      const event = dispatchKey(mounted.navigation, key, init)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 3, col: 3 })
    expect(store.getter(lastKeyboardIntentAtom)).toEqual({ type: 'clipboard.copy' })
    mounted.app.unmount()
  })

  it('does not override a key event already consumed by another surface', () => {
    const store = createStore()
    seedStore(store, { row: 3, col: 3 })
    const mounted = mountKeyboardNavigation(store)
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown',
    })
    event.preventDefault()

    mounted.navigation.onKeydown(event)

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 3, col: 3 })
    mounted.app.unmount()
  })
})
