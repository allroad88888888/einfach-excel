import { createStore, type Store } from '@einfach/core'
import {
  pointerIntentAtom,
  pointerSessionAtom,
  selectionSnapshotAtom,
  setSelectionBoundsAtom,
  type CellCoord,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { createApp, defineComponent, h } from 'vue'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import {
  useSpreadsheetPointerSelection,
  type SpreadsheetPointerSelection,
} from '../src/use-spreadsheet-pointer-selection'

interface MountedPointerSelection {
  readonly app: ReturnType<typeof createApp>
  readonly pointerSelection: SpreadsheetPointerSelection
}

const backend = {} as SpreadsheetBackend

function pointerEvent(
  type: string,
  { button = 0, isPrimary = true, pointerId = 1 }: Partial<PointerEventInit> = {},
): PointerEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button })
  Object.defineProperties(event, {
    isPrimary: { value: isPrimary },
    pointerId: { value: pointerId },
  })
  return event as PointerEvent
}

function mountPointerSelection(store: Store): MountedPointerSelection {
  let pointerSelection: SpreadsheetPointerSelection | undefined
  const Capture = defineComponent({
    name: 'PointerSelectionCapture',
    setup: function PointerSelectionCaptureSetup() {
      pointerSelection = useSpreadsheetPointerSelection()
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

  if (pointerSelection === undefined) throw new Error('Pointer-selection hook was not mounted.')
  return { app, pointerSelection }
}

function prepareStore(): Store {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 20 })
  return store
}

function start(pointerSelection: SpreadsheetPointerSelection, pointerId = 1): void {
  pointerSelection.onPointerDown(pointerEvent('pointerdown', { pointerId }), {
    sheetId: 'sheet-1',
    coord: { row: 1, col: 2 },
  })
}

describe('useSpreadsheetPointerSelection', () => {
  it('keeps pointer selection in each nearest provider store and ignores non-primary starts', () => {
    const firstStore = prepareStore()
    const secondStore = prepareStore()
    const first = mountPointerSelection(firstStore)
    const second = mountPointerSelection(secondStore)

    first.pointerSelection.onPointerDown(pointerEvent('pointerdown', { button: 2 }), {
      sheetId: 'ignored',
      coord: { row: 9, col: 9 },
    })
    start(first.pointerSelection, 3)
    start(second.pointerSelection, 4)

    expect(firstStore.getter(pointerSessionAtom)).toMatchObject({
      status: 'active',
      interaction: { sheetId: 'sheet-1', anchor: { row: 1, col: 2 } },
    })
    expect(secondStore.getter(pointerSessionAtom)).toMatchObject({
      status: 'active',
      interaction: { sheetId: 'sheet-1', anchor: { row: 1, col: 2 } },
    })
    expect(firstStore.getter(selectionSnapshotAtom).activeCell).toEqual({
      sheetId: 'sheet-1',
      row: 1,
      col: 2,
    })

    first.app.unmount()
    second.app.unmount()
  })

  it('filters foreign pointers before updating or committing the active drag', () => {
    const store = prepareStore()
    const mounted = mountPointerSelection(store)
    const foreignFocus: CellCoord = { row: 8, col: 8 }
    const focus: CellCoord = { row: 4, col: 5 }

    start(mounted.pointerSelection, 7)
    mounted.pointerSelection.onPointerMove(
      pointerEvent('pointermove', { pointerId: 8 }),
      foreignFocus,
    )
    mounted.pointerSelection.onPointerUp(pointerEvent('pointerup', { pointerId: 8 }))

    expect(store.getter(pointerSessionAtom)).toMatchObject({
      status: 'active',
      interaction: { focus: { row: 1, col: 2 } },
    })
    expect(store.getter(pointerIntentAtom)).toBeNull()

    mounted.pointerSelection.onPointerMove(pointerEvent('pointermove', { pointerId: 7 }), focus)
    mounted.pointerSelection.onPointerUp(pointerEvent('pointerup', { pointerId: 7 }))

    expect(store.getter(selectionSnapshotAtom).selection).toMatchObject({
      kind: 'range',
      anchor: { row: 1, col: 2 },
      focus,
    })
    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'idle', interaction: null })
    expect(store.getter(pointerIntentAtom)).toMatchObject({
      type: 'pointer.drag-selection.commit',
      anchor: { row: 1, col: 2 },
      focus,
    })
    mounted.app.unmount()
  })

  it('cancels matching pointer streams and active streams on unmount', () => {
    const store = prepareStore()
    const mounted = mountPointerSelection(store)

    start(mounted.pointerSelection, 5)
    mounted.pointerSelection.onPointerCancel(pointerEvent('pointercancel', { pointerId: 6 }))
    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'active' })

    mounted.pointerSelection.onPointerCancel(pointerEvent('pointercancel', { pointerId: 5 }))
    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'idle', interaction: null })
    expect(store.getter(pointerIntentAtom)).toBeNull()

    start(mounted.pointerSelection, 9)
    mounted.app.unmount()
    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'idle', interaction: null })
    expect(store.getter(pointerIntentAtom)).toBeNull()
  })
})
