/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import {
  createTableSupportedAtom,
  filterSortCapabilityAtom,
  findReplaceCapabilityProjectionAtom,
  pasteSpecialCapabilityAtom,
  presenceStateAtom,
  removeDuplicatesCapabilityAtom,
  sortRangeSupportedAtom,
  spillRegionSupportedAtom,
  textToColumnsCapabilityAtom,
  type PresenceUpdate,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import {
  SpreadsheetUiProvider,
  customFormulasSupportedAtom,
  spreadsheetBackendAtom,
  spreadsheetWorkbookLifecycleAtom,
} from '../src/provider'

afterEach(cleanup)

type ReadyableBackend = SpreadsheetBackend & { ready?: () => Promise<unknown> | unknown }
type ExtendedBackend = ReadyableBackend & { removeRowsExact?: () => Promise<unknown> }

function createBackend(
  options: {
    onReadVisibleProjection?: () => void
    ready?: () => Promise<unknown> | unknown
    subscribePresence?: (handler: (update: PresenceUpdate) => void) => () => void
  } = {},
): ReadyableBackend {
  const backend: ReadyableBackend = {
    async readVisibleProjection() {
      options.onReadVisibleProjection?.()
      return {} as never
    },
    async readRangeProjection() {
      return {} as never
    },
    async setCellInput() {
      return {} as never
    },
  }
  if (options.ready) backend.ready = options.ready
  if (options.subscribePresence) backend.subscribePresence = options.subscribePresence
  return backend
}

function createDeferred() {
  let resolve = (): void => {}
  let reject = (_error: unknown): void => {}
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function SwitchableProvider(props: {
  backend: SpreadsheetBackend
  onBackendChange: (change: (next: SpreadsheetBackend) => void) => void
  store: ReturnType<typeof createStore>
}) {
  const [backend, setBackend] = createSignal(props.backend)
  props.onBackendChange((next) => setBackend(() => next))
  return (
    <SpreadsheetUiProvider backend={backend()} store={props.store}>
      <span />
    </SpreadsheetUiProvider>
  )
}

const aliceUpdate: PresenceUpdate = {
  kind: 'join',
  participant: { id: 'alice', displayName: 'Alice', lastSeenAt: 1 },
}

describe('vNext provider workbook lifecycle', () => {
  it('projects all provider-owned primitive capabilities without storing the backend in Atom state', () => {
    const store = createStore()
    const backend = createBackend() as ExtendedBackend
    backend.pasteRange = async () => ({}) as never
    backend.readSpillRegion = async () => ({}) as never
    backend.setFilterSort = async () => ({}) as never
    backend.sortRange = async () => ({}) as never
    backend.searchRange = async () => ({}) as never
    backend.replaceMatches = async () => ({}) as never
    backend.removeRowsExact = async () => ({}) as never
    backend.importCellChunks = async () => ({}) as never
    backend.createTable = async () => ({}) as never
    backend.registerCustomFormula = async () => {}
    backend.unregisterCustomFormula = async () => {}

    render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <span />
      </SpreadsheetUiProvider>
    ))

    expect(store.getter(spreadsheetBackendAtom)).toBeNull()
    expect(store.getter(spreadsheetWorkbookLifecycleAtom).phase).toBe('ready')
    expect(store.getter(pasteSpecialCapabilityAtom)).toBe(true)
    expect(store.getter(spillRegionSupportedAtom)).toBe(true)
    expect(store.getter(filterSortCapabilityAtom)).toBe(true)
    expect(store.getter(sortRangeSupportedAtom)).toBe(true)
    expect(store.getter(findReplaceCapabilityProjectionAtom).capability).toBe('find-and-replace')
    expect(store.getter(removeDuplicatesCapabilityAtom)).toEqual({ canRead: true, canRemove: true })
    expect(store.getter(textToColumnsCapabilityAtom)).toBe(true)
    expect(store.getter(createTableSupportedAtom)).toBe(true)
    expect(store.getter(customFormulasSupportedAtom)).toBe(true)
  })

  it('ignores an old ready rejection after a workbook replacement', async () => {
    const firstReady = createDeferred()
    let firstReadyCalls = 0
    const first = createBackend({
      ready: () => {
        firstReadyCalls += 1
        return firstReady.promise
      },
    })
    const second = createBackend()
    second.pasteRange = async () => ({}) as never
    const store = createStore()
    let changeBackend = (_next: SpreadsheetBackend): void => {}

    render(() => (
      <SwitchableProvider
        backend={first}
        store={store}
        onBackendChange={(change) => {
          changeBackend = change
        }}
      />
    ))

    await waitFor(() => expect(firstReadyCalls).toBe(1))
    expect(store.getter(spreadsheetWorkbookLifecycleAtom).phase).toBe('initializing')
    changeBackend(second)
    await waitFor(() => expect(store.getter(spreadsheetWorkbookLifecycleAtom).phase).toBe('ready'))
    expect(store.getter(pasteSpecialCapabilityAtom)).toBe(true)

    firstReady.reject(new Error('old workbook failed'))
    await waitFor(() => {
      expect(store.getter(spreadsheetWorkbookLifecycleAtom)).toMatchObject({
        error: null,
        phase: 'ready',
      })
    })
  })

  it('exposes initialization failure as Atom state', async () => {
    const ready = createDeferred()
    const store = createStore()

    render(() => (
      <SpreadsheetUiProvider backend={createBackend({ ready: () => ready.promise })} store={store}>
        <span />
      </SpreadsheetUiProvider>
    ))

    expect(store.getter(spreadsheetWorkbookLifecycleAtom).phase).toBe('initializing')
    ready.reject(new Error('worker unavailable'))
    await waitFor(() => {
      expect(store.getter(spreadsheetWorkbookLifecycleAtom)).toMatchObject({
        error: 'worker unavailable',
        phase: 'failed',
      })
    })
  })

  it('cleans presence subscriptions on rebind and unmount while stale callbacks cannot write', async () => {
    let firstHandler: ((update: PresenceUpdate) => void) | undefined
    let secondHandler: ((update: PresenceUpdate) => void) | undefined
    let firstUnsubscribes = 0
    let secondUnsubscribes = 0
    const first = createBackend({
      subscribePresence: (handler) => {
        firstHandler = handler
        return () => {
          firstUnsubscribes += 1
        }
      },
    })
    const second = createBackend({
      subscribePresence: (handler) => {
        secondHandler = handler
        return () => {
          secondUnsubscribes += 1
        }
      },
    })
    const store = createStore()
    let changeBackend = (_next: SpreadsheetBackend): void => {}
    const view = render(() => (
      <SwitchableProvider
        backend={first}
        store={store}
        onBackendChange={(change) => {
          changeBackend = change
        }}
      />
    ))

    firstHandler!(aliceUpdate)
    expect(store.getter(presenceStateAtom).participants).toHaveLength(1)
    changeBackend(second)
    await waitFor(() => expect(secondHandler).toBeDefined())
    expect(firstUnsubscribes).toBe(1)
    expect(store.getter(presenceStateAtom).participants).toHaveLength(0)
    firstHandler!(aliceUpdate)
    expect(store.getter(presenceStateAtom).participants).toHaveLength(0)
    secondHandler!(aliceUpdate)
    expect(store.getter(presenceStateAtom).participants).toHaveLength(1)

    view.unmount()
    expect(secondUnsubscribes).toBe(1)
    expect(store.getter(presenceStateAtom).participants).toHaveLength(0)
    secondHandler!(aliceUpdate)
    expect(store.getter(presenceStateAtom).participants).toHaveLength(0)
  })
})
