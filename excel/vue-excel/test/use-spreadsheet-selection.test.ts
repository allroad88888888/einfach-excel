import { createStore, type Store } from '@einfach/core'
import {
  setSelectionAtom,
  setSelectionBoundsAtom,
  type SelectionSnapshot,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { createApp, defineComponent, h, nextTick, type ShallowRef } from 'vue'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetSelection } from '../src/use-spreadsheet-selection'

interface MountedSelection {
  readonly app: ReturnType<typeof createApp>
  readonly selection: Readonly<ShallowRef<SelectionSnapshot>>
}

const backend = {} as SpreadsheetBackend

function mountSelection(store: Store): MountedSelection {
  let selection: Readonly<ShallowRef<SelectionSnapshot>> | undefined
  const Capture = defineComponent({
    name: 'SelectionCapture',
    setup: function SelectionCaptureSetup() {
      selection = useSpreadsheetSelection()
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

  if (selection === undefined) throw new Error('Selection hook was not mounted.')
  return { app, selection }
}

function selectCell(store: Store, sheetId: string, row: number, col: number): void {
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId,
    anchor: { row, col },
    focus: { row, col },
  })
}

describe('useSpreadsheetSelection', () => {
  it('follows the provider store selection snapshot after Vue updates', async () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 8 })
    const mounted = mountSelection(store)

    selectCell(store, 'sheet-1', 4, 6)
    await nextTick()

    expect(mounted.selection.value).toEqual({
      selection: {
        kind: 'cell',
        sheetId: 'sheet-1',
        anchor: { row: 4, col: 6 },
        focus: { row: 4, col: 6 },
      },
      activeCell: { sheetId: 'sheet-1', row: 4, col: 6 },
      range: { rowStart: 4, rowEnd: 4, colStart: 6, colEnd: 6 },
    })
    mounted.app.unmount()
  })

  it('uses the nearest provider store when providers are nested', async () => {
    const outerStore = createStore()
    const innerStore = createStore()
    let outerSelection: Readonly<ShallowRef<SelectionSnapshot>> | undefined
    let innerSelection: Readonly<ShallowRef<SelectionSnapshot>> | undefined
    const InnerCapture = defineComponent({
      name: 'InnerSelectionCapture',
      setup: function InnerSelectionCaptureSetup() {
        innerSelection = useSpreadsheetSelection()
        return () => null
      },
    })
    const OuterCapture = defineComponent({
      name: 'OuterSelectionCapture',
      setup: function OuterSelectionCaptureSetup() {
        outerSelection = useSpreadsheetSelection()
        return () =>
          h(
            SpreadsheetUiProvider,
            { backend, store: innerStore },
            { default: () => h(InnerCapture) },
          )
      },
    })
    const Root = defineComponent({
      setup() {
        return () =>
          h(
            SpreadsheetUiProvider,
            { backend, store: outerStore },
            { default: () => h(OuterCapture) },
          )
      },
    })
    const app = createApp(Root)
    app.mount(document.createElement('div'))

    selectCell(outerStore, 'outer', 1, 2)
    selectCell(innerStore, 'inner', 7, 8)
    await nextTick()

    expect(outerSelection?.value.activeCell).toEqual({ sheetId: 'outer', row: 1, col: 2 })
    expect(innerSelection?.value.activeCell).toEqual({ sheetId: 'inner', row: 7, col: 8 })
    app.unmount()
  })

  it('unsubscribes from the provider store when its component unmounts', () => {
    const backingStore = createStore()
    let unsubscribeCalls = 0
    const store = Object.create(backingStore) as Store
    Object.defineProperty(store, 'sub', {
      value(atom: Parameters<Store['sub']>[0], listener: Parameters<Store['sub']>[1]) {
        const unsubscribe = backingStore.sub(atom, listener)
        return () => {
          unsubscribeCalls += 1
          unsubscribe()
        }
      },
    })
    const mounted = mountSelection(store)

    mounted.app.unmount()

    expect(unsubscribeCalls).toBe(1)
  })
})
