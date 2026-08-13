import { createStore, type Store } from '@einfach/core'
import {
  clipboardStateAtom,
  copyClipboardAtom,
  type ClipboardTransferInput,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import {
  useSpreadsheetClipboard,
  type SpreadsheetClipboard,
} from '../src/use-spreadsheet-clipboard'

const backend = {} as SpreadsheetBackend

function transfer(sheetId: string): ClipboardTransferInput {
  return {
    source: {
      sheetId,
      range: { rowStart: 1, rowEnd: 2, colStart: 3, colEnd: 4 },
    },
    target: {
      sheetId,
      range: { rowStart: 5, rowEnd: 6, colStart: 7, colEnd: 8 },
    },
    includesFormulas: true,
  }
}

interface MountedClipboard {
  readonly app: ReturnType<typeof createApp>
  readonly clipboard: SpreadsheetClipboard
}

function mountClipboard(store: Store): MountedClipboard {
  let clipboard: SpreadsheetClipboard | undefined
  const Capture = defineComponent({
    name: 'ClipboardCapture',
    setup: function ClipboardCaptureSetup() {
      clipboard = useSpreadsheetClipboard()
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
  if (clipboard === undefined) throw new Error('Clipboard hook was not mounted.')
  return { app, clipboard }
}

describe('useSpreadsheetClipboard', () => {
  it('reactively projects clipboard state from the nearest provider store', async () => {
    const store = createStore()
    const mounted = mountClipboard(store)

    store.setter(copyClipboardAtom, transfer('external'))
    await nextTick()

    expect(mounted.clipboard.state.value).toMatchObject({
      status: 'copying',
      intent: { type: 'clipboard.copy' },
      source: { sheetId: 'external' },
    })
    mounted.app.unmount()
  })

  it('forwards every clipboard command through the provider-owned atoms', async () => {
    const store = createStore()
    const mounted = mountClipboard(store)

    expect(mounted.clipboard.copy(transfer('copy'))).toMatchObject({ type: 'clipboard.copy' })
    expect(store.getter(clipboardStateAtom).status).toBe('copying')
    expect(mounted.clipboard.cut(transfer('cut'))).toMatchObject({ type: 'clipboard.cut' })
    expect(store.getter(clipboardStateAtom).status).toBe('cutting')
    expect(mounted.clipboard.paste(transfer('paste'))).toMatchObject({ type: 'clipboard.paste' })
    expect(store.getter(clipboardStateAtom).status).toBe('pasting')

    mounted.clipboard.ready()
    expect(store.getter(clipboardStateAtom).status).toBe('ready')
    expect(
      mounted.clipboard.setError({ code: 'BACKEND_ERROR', message: 'clipboard failed' }),
    ).toMatchObject({ status: 'error', error: { code: 'BACKEND_ERROR' } })

    mounted.clipboard.clear()
    await nextTick()
    expect(store.getter(clipboardStateAtom)).toEqual({
      status: 'idle',
      intent: null,
      source: null,
      target: null,
      payload: null,
      error: null,
    })
    expect(mounted.clipboard.state.value.status).toBe('idle')
    mounted.app.unmount()
  })

  it('keeps clipboard state isolated between sibling providers', async () => {
    const firstStore = createStore()
    const secondStore = createStore()
    let first: SpreadsheetClipboard | undefined
    let second: SpreadsheetClipboard | undefined
    const Capture = defineComponent({
      props: { id: { type: String, required: true } },
      setup: function ClipboardSiblingCaptureSetup(props) {
        const clipboard = useSpreadsheetClipboard()
        if (props.id === 'first') first = clipboard
        else second = clipboard
        return () => null
      },
    })
    const Root = defineComponent({
      setup() {
        return () => [
          h(
            SpreadsheetUiProvider,
            { backend, store: firstStore },
            { default: () => h(Capture, { id: 'first' }) },
          ),
          h(
            SpreadsheetUiProvider,
            { backend, store: secondStore },
            { default: () => h(Capture, { id: 'second' }) },
          ),
        ]
      },
    })
    const app = createApp(Root)
    app.mount(document.createElement('div'))

    first?.copy(transfer('first'))
    await nextTick()

    expect(firstStore.getter(clipboardStateAtom)).toMatchObject({
      status: 'copying',
      source: { sheetId: 'first' },
    })
    expect(secondStore.getter(clipboardStateAtom).status).toBe('idle')
    expect(first?.state.value.status).toBe('copying')
    expect(second?.state.value.status).toBe('idle')
    app.unmount()
  })

  it('resubscribes after provider replacement and cleans up on unmount', async () => {
    const backingFirstStore = createStore()
    let unsubscribeCalls = 0
    const firstStore = Object.create(backingFirstStore) as Store
    Object.defineProperty(firstStore, 'sub', {
      value(atom: Parameters<Store['sub']>[0], listener: Parameters<Store['sub']>[1]) {
        const unsubscribe = backingFirstStore.sub(atom, listener)
        return () => {
          unsubscribeCalls += 1
          unsubscribe()
        }
      },
    })
    const secondStore = createStore()
    const trackedSecondStore = Object.create(secondStore) as Store
    Object.defineProperty(trackedSecondStore, 'sub', {
      value(atom: Parameters<Store['sub']>[0], listener: Parameters<Store['sub']>[1]) {
        const unsubscribe = secondStore.sub(atom, listener)
        return () => {
          unsubscribeCalls += 1
          unsubscribe()
        }
      },
    })
    const activeStore = ref<Store>(firstStore)
    const activeBackend = ref<SpreadsheetBackend>(backend)
    let clipboard: SpreadsheetClipboard | undefined
    const Capture = defineComponent({
      setup: function ReplacementClipboardCaptureSetup() {
        clipboard = useSpreadsheetClipboard()
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

    activeStore.value = trackedSecondStore
    activeBackend.value = {} as SpreadsheetBackend
    await nextTick()
    backingFirstStore.setter(copyClipboardAtom, transfer('stale'))
    await nextTick()

    expect(unsubscribeCalls).toBe(1)
    expect(clipboard?.state.value.status).toBe('idle')
    clipboard?.copy(transfer('second'))
    expect(secondStore.getter(clipboardStateAtom)).toMatchObject({
      status: 'copying',
      source: { sheetId: 'second' },
    })

    app.unmount()
    expect(unsubscribeCalls).toBe(2)
  })
})
