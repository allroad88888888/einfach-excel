import { createStore, type Store } from '@einfach/core'
import {
  loadNamedRangeCapabilitiesAtom,
  nameRegistryCacheAtom,
  setSelectionAtom,
  setWorkspaceActiveSheetAtom,
  workspaceSessionAtom,
  type CellCoord,
  type NamedRangeControllerPort,
  type NamedRangeBackendCapabilities,
  type SetNamedRangeRequest,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import {
  useSpreadsheetNameBox,
  type SpreadsheetNameBox,
  type UseSpreadsheetNameBoxOptions,
} from '../src/use-spreadsheet-name-box'

const backend = {} as SpreadsheetBackend

const capabilities: NamedRangeBackendCapabilities = {
  runtime: 'static-session',
  scopes: ['workbook', 'sheet'],
  bindings: { range: true, constant: true, lambda: true },
  delete: true,
  rangeSemantics: 'stored-definition',
  listAuthority: 'static-session-registry',
  definitionReadback: 'full',
  namesWitness: true,
  mutationAck: 'session-registry-accepted',
  durability: 'session-local',
}

interface MountedNameBox {
  readonly app: ReturnType<typeof createApp>
  readonly nameBox: SpreadsheetNameBox
}

function mountNameBox(store: Store, options?: UseSpreadsheetNameBoxOptions): MountedNameBox {
  let nameBox: SpreadsheetNameBox | undefined
  const Capture = defineComponent({
    name: 'NameBoxCapture',
    setup: function NameBoxCaptureSetup() {
      nameBox = useSpreadsheetNameBox(options)
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

  if (nameBox === undefined) throw new Error('Name-box hook was not mounted.')
  return { app, nameBox }
}

function selectRange(
  store: Store,
  sheetId: string,
  rowStart: number,
  colStart: number,
  rowEnd = rowStart,
  colEnd = colStart,
): void {
  store.setter(setSelectionAtom, {
    kind: rowStart === rowEnd && colStart === colEnd ? 'cell' : 'range',
    sheetId,
    anchor: { row: rowStart, col: colStart },
    focus: { row: rowEnd, col: colEnd },
  })
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

describe('useSpreadsheetNameBox', () => {
  it('reactively follows focus, input, revert, and blur from the provider store', async () => {
    const store = createStore()
    selectRange(store, 'sheet-1', 1, 1)
    const mounted = mountNameBox(store)

    const sessionId = mounted.nameBox.focus()
    expect(mounted.nameBox.updateInput({ sessionId, input: 'C3' })).toBe(true)
    await nextTick()
    expect(mounted.nameBox.state.value).toMatchObject({
      input: 'C3',
      display: 'B2',
      focused: true,
      mode: 'typing',
      sessionId,
    })

    expect(mounted.nameBox.revert({ sessionId })).toBe(true)
    expect(mounted.nameBox.blur({ sessionId })).toBe(true)
    await nextTick()
    expect(mounted.nameBox.state.value).toMatchObject({
      input: 'B2',
      focused: false,
      mode: 'idle',
    })
    mounted.app.unmount()
  })

  it('forwards cell and range commits through the provider-owned core commands', async () => {
    const store = createStore()
    selectRange(store, 'sheet-1', 0, 0)
    const mounted = mountNameBox(store)

    const cellSession = mounted.nameBox.focus()
    mounted.nameBox.updateInput({ sessionId: cellSession, input: 'C4' })
    expect(mounted.nameBox.commit({ input: 'C4', sessionId: cellSession })).toEqual({
      kind: 'cell',
      sheetId: 'sheet-1',
      coord: { row: 3, col: 2 },
    })

    const rangeSession = mounted.nameBox.focus()
    mounted.nameBox.updateInput({ sessionId: rangeSession, input: 'D5:B2' })
    expect(mounted.nameBox.commit({ input: 'D5:B2', sessionId: rangeSession })).toEqual({
      kind: 'range',
      sheetId: 'sheet-1',
      range: { rowStart: 1, rowEnd: 4, colStart: 1, colEnd: 3 },
    })
    await nextTick()
    expect(mounted.nameBox.state.value.display).toBe('B2:D5')
    mounted.app.unmount()
  })

  it('activates a named range sheet before emitting its scroll target', async () => {
    const store = createStore()
    selectRange(store, 'sheet-1', 0, 0)
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(nameRegistryCacheAtom, [
      {
        name: 'RemoteRange',
        scope: 'workbook',
        refersTo: { kind: 'range', sheetId: 'sheet-2', address: 'Z100:AA101' },
      },
    ])
    const activeSheetsWhenScrolled: Array<string | null> = []
    const scrollTargets: Array<{ sheetId: string; coord: CellCoord }> = []
    const mounted = mountNameBox(store, {
      onScrollToCell: (target) => {
        scrollTargets.push(target)
        activeSheetsWhenScrolled.push(store.getter(workspaceSessionAtom).activeSheetId)
      },
    })

    const sessionId = mounted.nameBox.focus()
    mounted.nameBox.updateInput({ sessionId, input: 'RemoteRange' })
    expect(mounted.nameBox.commit({ input: 'RemoteRange', sessionId })).toMatchObject({
      kind: 'named-range',
      sheetId: 'sheet-2',
      range: { rowStart: 99, colStart: 25 },
    })
    await nextTick()
    expect(mounted.nameBox.state.value.display).toBe('RemoteRange')
    expect(activeSheetsWhenScrolled).toEqual(['sheet-2'])
    expect(scrollTargets).toEqual([{ sheetId: 'sheet-2', coord: { row: 99, col: 25 } }])
    mounted.app.unmount()
  })

  it('sends a new name through the shared named-range mutation command', async () => {
    const store = createStore()
    const setNamedRange = jest.fn(async (request: SetNamedRangeRequest) => ({
      requestId: request.requestId,
      outcome: 'w0-acknowledged' as const,
      authority: 'static-session-registry' as const,
    }))
    const source: NamedRangeControllerPort = {
      readNamedRangeCapabilities: async () => capabilities,
      setNamedRange,
      listNamedRanges: async (request) => ({
        requestId: request.requestId,
        names: [],
        authority: 'static-session-registry',
        definitionReadback: 'full',
      }),
    }
    store.setter(loadNamedRangeCapabilitiesAtom, { source })
    await flushMicrotasks()
    selectRange(store, 'sheet-1', 2, 2, 4, 4)
    const mounted = mountNameBox(store)

    const sessionId = mounted.nameBox.focus()
    mounted.nameBox.updateInput({ sessionId, input: 'Revenue' })
    expect(mounted.nameBox.commit({ input: 'Revenue', sessionId, source })).toMatchObject({
      kind: 'define-name',
      name: 'Revenue',
      range: { rowStart: 2, rowEnd: 4, colStart: 2, colEnd: 4 },
    })
    await flushMicrotasks()
    expect(setNamedRange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'set-named-range',
        name: 'Revenue',
        refersTo: { kind: 'range', sheetId: 'sheet-1', address: 'C3:E5' },
      }),
    )
    mounted.app.unmount()
  })

  it('follows a replacement provider store without retaining the old subscription', async () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const activeStore = ref<Store>(firstStore)
    let nameBox: SpreadsheetNameBox | undefined
    const Capture = defineComponent({
      setup: function ProviderReplacementCaptureSetup() {
        nameBox = useSpreadsheetNameBox()
        return () => null
      },
    })
    const Root = defineComponent({
      setup() {
        return () =>
          h(
            SpreadsheetUiProvider,
            { backend, store: activeStore.value },
            { default: () => h(Capture) },
          )
      },
    })
    const app = createApp(Root)
    app.mount(document.createElement('div'))

    selectRange(firstStore, 'first', 1, 1)
    await nextTick()
    expect(nameBox?.state.value.display).toBe('B2')
    activeStore.value = secondStore
    await nextTick()
    selectRange(secondStore, 'second', 3, 3)
    await nextTick()
    expect(nameBox?.state.value.display).toBe('D4')
    selectRange(firstStore, 'first', 7, 7)
    await nextTick()
    expect(nameBox?.state.value.display).toBe('D4')
    app.unmount()
  })

  it('keeps sibling providers isolated and unsubscribes when its scope stops', async () => {
    const firstStore = createStore()
    const secondBackingStore = createStore()
    let unsubscribeCalls = 0
    const secondStore = Object.create(secondBackingStore) as Store
    Object.defineProperty(secondStore, 'sub', {
      value(atom: Parameters<Store['sub']>[0], listener: Parameters<Store['sub']>[1]) {
        const unsubscribe = secondBackingStore.sub(atom, listener)
        return () => {
          unsubscribeCalls += 1
          unsubscribe()
        }
      },
    })
    const first = mountNameBox(firstStore)
    const second = mountNameBox(secondStore)

    const sessionId = first.nameBox.focus()
    first.nameBox.updateInput({ sessionId, input: 'E5' })
    await nextTick()
    expect(first.nameBox.state.value.input).toBe('E5')
    expect(second.nameBox.state.value.input).toBe('')
    first.app.unmount()
    second.app.unmount()
    expect(unsubscribeCalls).toBe(1)
  })
})
