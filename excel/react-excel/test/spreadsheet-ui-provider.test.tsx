import { createStore, type Store } from '@einfach/core'
import type { SpreadsheetBackend, SpreadsheetUiCore } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react'
import { SpreadsheetUiProvider, useSpreadsheetUiCore } from '../src'

function CoreCapture({ onCore }: { onCore: (core: SpreadsheetUiCore) => void }) {
  onCore(useSpreadsheetUiCore())
  return null
}

function renderProvider(
  backend: SpreadsheetBackend,
  onCore: (core: SpreadsheetUiCore) => void,
  store?: Store,
) {
  return render(
    <SpreadsheetUiProvider backend={backend} store={store}>
      <CoreCapture onCore={onCore} />
    </SpreadsheetUiProvider>,
  )
}

describe('SpreadsheetUiProvider', () => {
  it('supplies the caller-owned backend and store to descendants', () => {
    const backend = {} as SpreadsheetBackend
    const store = createStore()
    let capturedCore: SpreadsheetUiCore | undefined

    renderProvider(
      backend,
      (core) => {
        capturedCore = core
      },
      store,
    )

    expect(capturedCore).toEqual({ backend, store })
  })

  it('creates an isolated store when a caller does not provide one', () => {
    const backend = {} as SpreadsheetBackend
    let firstCore: SpreadsheetUiCore | undefined
    let secondCore: SpreadsheetUiCore | undefined

    renderProvider(backend, (core) => {
      firstCore = core
    })
    renderProvider(backend, (core) => {
      secondCore = core
    })

    expect(firstCore?.store).toBeDefined()
    expect(secondCore?.store).toBeDefined()
    expect(firstCore?.store).not.toBe(secondCore?.store)
  })

  it('updates the supplied core when its controlled backend changes', () => {
    const firstBackend = {} as SpreadsheetBackend
    const nextBackend = {} as SpreadsheetBackend
    const store = createStore()
    let capturedCore: SpreadsheetUiCore | undefined
    const onCore = (core: SpreadsheetUiCore) => {
      capturedCore = core
    }
    const view = renderProvider(firstBackend, onCore, store)

    view.rerender(
      <SpreadsheetUiProvider backend={nextBackend} store={store}>
        <CoreCapture onCore={onCore} />
      </SpreadsheetUiProvider>,
    )

    expect(capturedCore).toEqual({ backend: nextBackend, store })
  })

  it('rejects useSpreadsheetUiCore outside a provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      expect(() => render(<CoreCapture onCore={() => undefined} />)).toThrow(
        'useSpreadsheetUiCore must be used within a SpreadsheetUiProvider.',
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
