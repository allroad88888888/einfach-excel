import { createStore, type Store } from '@einfach/core'
import {
  sheetTabsAtom,
  sheetTabsSheetsAtom,
  type AddSheetRequest,
  type SheetListResult,
  type SpreadsheetBackend,
  type SpreadsheetSheetMetadata,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import {
  useSpreadsheetSheetTabs,
  type SpreadsheetSheetTabs,
} from '../src/use-spreadsheet-sheet-tabs'

const SHEETS: SpreadsheetSheetMetadata[] = [
  { id: 'sheet-1', name: 'Sheet1', index: 0 },
  { id: 'sheet-2', name: 'Sheet2', index: 1 },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createBackend(
  initialSheets: SpreadsheetSheetMetadata[],
  listSheets?: () => Promise<SheetListResult>,
) {
  let currentSheets = initialSheets
  const listed = vi.fn(listSheets ?? (async () => ({ sheets: currentSheets })))
  const addSheet = vi.fn(async (request: AddSheetRequest) => {
    const createdSheet = {
      id: `sheet-${currentSheets.length + 1}`,
      name: request.name ?? `Sheet${currentSheets.length + 1}`,
      index: currentSheets.length,
    }
    currentSheets = [...currentSheets, createdSheet]
    return {
      requestId: request.requestId,
      sheetId: createdSheet.id,
      activeSheetId: createdSheet.id,
      createdSheet,
      sheets: currentSheets,
    }
  })
  const backend: SpreadsheetBackend = {
    listSheets: listed,
    addSheet,
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
  return { backend, addSheet, listed }
}

interface MountedSheetTabs {
  readonly app: ReturnType<typeof createApp>
  readonly tabs: SpreadsheetSheetTabs
}

function mountSheetTabs(store: Store, backend: SpreadsheetBackend): MountedSheetTabs {
  let tabs: SpreadsheetSheetTabs | undefined
  const Capture = defineComponent({
    setup: function SheetTabsCaptureSetup() {
      tabs = useSpreadsheetSheetTabs({ sheets: SHEETS })
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
  if (tabs === undefined) throw new Error('Sheet-tabs hook was not mounted.')
  return { app, tabs }
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

describe('useSpreadsheetSheetTabs', () => {
  it('initializes from its provider and reactively exposes live sheet and workspace updates', async () => {
    const store = createStore()
    const harness = createBackend(SHEETS)
    const mounted = mountSheetTabs(store, harness.backend)

    await flushMicrotasks()
    expect(harness.listed).toHaveBeenCalledTimes(1)
    expect(mounted.tabs.state.value).toMatchObject({ phase: 'ready', error: null })
    expect(mounted.tabs.sheets.value).toEqual(SHEETS)
    expect(mounted.tabs.activate({ sheetId: 'sheet-2' })).toBe(true)
    await nextTick()
    expect(mounted.tabs.workspace.value.activeSheetId).toBe('sheet-2')
    mounted.app.unmount()
  })

  it('forwards sheet-tab commands through the provider-owned core atoms', async () => {
    const store = createStore()
    const harness = createBackend(SHEETS)
    const mounted = mountSheetTabs(store, harness.backend)

    await flushMicrotasks()
    await mounted.tabs.addSheet()
    expect(harness.addSheet).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'add-sheet', name: 'Sheet3' }),
    )
    expect(mounted.tabs.sheets.value.map((sheet) => sheet.id)).toEqual([
      'sheet-1',
      'sheet-2',
      'sheet-3',
    ])
    mounted.app.unmount()
  })

  it('keeps sibling provider sheet-tab sessions isolated', async () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const firstHarness = createBackend(SHEETS)
    const secondSheets = [{ id: 'other-1', name: 'Other1', index: 0 }]
    const secondHarness = createBackend(secondSheets)
    let first: SpreadsheetSheetTabs | undefined
    let second: SpreadsheetSheetTabs | undefined
    const Capture = defineComponent({
      props: { id: { type: String, required: true }, sheets: { type: Array, required: true } },
      setup: function SiblingSheetTabsCaptureSetup(props) {
        const tabs = useSpreadsheetSheetTabs({ sheets: props.sheets as SpreadsheetSheetMetadata[] })
        if (props.id === 'first') first = tabs
        else second = tabs
        return () => null
      },
    })
    const Root = defineComponent({
      setup() {
        return () => [
          h(
            SpreadsheetUiProvider,
            { backend: firstHarness.backend, store: firstStore },
            { default: () => h(Capture, { id: 'first', sheets: SHEETS }) },
          ),
          h(
            SpreadsheetUiProvider,
            { backend: secondHarness.backend, store: secondStore },
            { default: () => h(Capture, { id: 'second', sheets: secondSheets }) },
          ),
        ]
      },
    })
    const app = createApp(Root)
    app.mount(document.createElement('div'))

    await flushMicrotasks()
    first?.activate({ sheetId: 'sheet-2' })
    await nextTick()
    expect(first?.workspace.value.activeSheetId).toBe('sheet-2')
    expect(second?.workspace.value.activeSheetId).toBe('other-1')
    expect(firstStore.getter(sheetTabsSheetsAtom)).toEqual(SHEETS)
    expect(secondStore.getter(sheetTabsSheetsAtom)).toEqual(secondSheets)
    app.unmount()
  })

  it('ignores a delayed list from a replaced provider', async () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const delayedList = deferred<SheetListResult>()
    const firstHarness = createBackend(SHEETS, () => delayedList.promise)
    const secondSheets = [{ id: 'other-1', name: 'Other1', index: 0 }]
    const secondHarness = createBackend(secondSheets)
    const activeStore = ref<Store>(firstStore)
    const activeBackend = ref<SpreadsheetBackend>(firstHarness.backend)
    let tabs: SpreadsheetSheetTabs | undefined
    const Capture = defineComponent({
      setup: function ReplacementSheetTabsCaptureSetup() {
        tabs = useSpreadsheetSheetTabs({ sheets: SHEETS })
        return () => null
      },
    })
    const Root = defineComponent({
      setup() {
        return () =>
          h(
            SpreadsheetUiProvider,
            { backend: activeBackend.value, store: activeStore.value },
            { default: () => h(Capture) },
          )
      },
    })
    const app = createApp(Root)
    app.mount(document.createElement('div'))

    await nextTick()
    expect(firstStore.getter(sheetTabsAtom).phase).toBe('loading')
    activeStore.value = secondStore
    activeBackend.value = secondHarness.backend
    await flushMicrotasks()
    delayedList.resolve({ sheets: [{ id: 'late', name: 'Late', index: 0 }] })
    await flushMicrotasks()
    expect(firstStore.getter(sheetTabsAtom).phase).toBe('unloaded')
    expect(firstStore.getter(sheetTabsSheetsAtom)).toEqual(SHEETS)
    expect(tabs?.sheets.value).toEqual(secondSheets)
    app.unmount()
    expect(secondStore.getter(sheetTabsAtom).phase).toBe('unloaded')
  })

  it('disposes a delayed list when its component unmounts', async () => {
    const store = createStore()
    const delayedList = deferred<SheetListResult>()
    const harness = createBackend(SHEETS, () => delayedList.promise)
    const mounted = mountSheetTabs(store, harness.backend)

    await nextTick()
    expect(store.getter(sheetTabsAtom).phase).toBe('loading')
    mounted.app.unmount()
    delayedList.resolve({ sheets: [{ id: 'late', name: 'Late', index: 0 }] })
    await flushMicrotasks()
    expect(store.getter(sheetTabsAtom).phase).toBe('unloaded')
    expect(store.getter(sheetTabsSheetsAtom)).toEqual(SHEETS)
  })
})
