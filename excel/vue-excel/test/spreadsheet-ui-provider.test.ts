import { createStore, type Store } from '@einfach/core'
import type { SpreadsheetBackend, SpreadsheetUiCore } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import { SpreadsheetUiProvider, useSpreadsheetUiCore } from '../src'

function createCapture(onCore: (core: SpreadsheetUiCore) => void) {
  return defineComponent({
    name: 'CoreCapture',
    setup() {
      const core = useSpreadsheetUiCore()
      return () => {
        onCore(core.value)
        return null
      }
    },
  })
}

function mountProvider(
  backend: SpreadsheetBackend,
  onCore: (core: SpreadsheetUiCore) => void,
  store?: Store,
) {
  const Capture = createCapture(onCore)
  const Root = defineComponent({
    setup() {
      return () => h(SpreadsheetUiProvider, { backend, store }, { default: () => h(Capture) })
    },
  })
  const host = document.createElement('div')
  const app = createApp(Root)
  app.mount(host)
  return app
}

describe('SpreadsheetUiProvider', () => {
  it('supplies the caller-owned backend and store to descendants', () => {
    const backend = {} as SpreadsheetBackend
    const store = createStore()
    let capturedCore: SpreadsheetUiCore | undefined
    const app = mountProvider(
      backend,
      (core) => {
        capturedCore = core
      },
      store,
    )

    expect(capturedCore).toEqual({ backend, store })
    app.unmount()
  })

  it('creates an isolated store when a caller does not provide one', () => {
    const backend = {} as SpreadsheetBackend
    let firstCore: SpreadsheetUiCore | undefined
    let secondCore: SpreadsheetUiCore | undefined
    const firstApp = mountProvider(backend, (core) => {
      firstCore = core
    })
    const secondApp = mountProvider(backend, (core) => {
      secondCore = core
    })

    expect(firstCore?.store).toBeDefined()
    expect(secondCore?.store).toBeDefined()
    expect(firstCore?.store).not.toBe(secondCore?.store)

    firstApp.unmount()
    secondApp.unmount()
  })

  it('updates the supplied core when its controlled backend changes', async () => {
    const firstBackend = {} as SpreadsheetBackend
    const nextBackend = {} as SpreadsheetBackend
    const backend = shallowRef(firstBackend)
    const store = createStore()
    let capturedCore: SpreadsheetUiCore | undefined
    const Capture = createCapture((core) => {
      capturedCore = core
    })
    const Root = defineComponent({
      setup() {
        return () =>
          h(SpreadsheetUiProvider, { backend: backend.value, store }, { default: () => h(Capture) })
      },
    })
    const host = document.createElement('div')
    const app = createApp(Root)
    app.mount(host)

    backend.value = nextBackend
    await nextTick()

    expect(capturedCore).toEqual({ backend: nextBackend, store })
    app.unmount()
  })

  it('rejects useSpreadsheetUiCore outside a provider', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const Root = defineComponent({
      setup() {
        useSpreadsheetUiCore()
        return () => null
      },
    })
    const app = createApp(Root)

    try {
      expect(() => app.mount(document.createElement('div'))).toThrow(
        'useSpreadsheetUiCore must be used within a SpreadsheetUiProvider.',
      )
    } finally {
      consoleWarn.mockRestore()
    }
  })
})
