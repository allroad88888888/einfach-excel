/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import type { SpreadsheetBackend, VisibleProjectionRequest } from '@einfach/spreadsheet-ui-core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import {
  SpreadsheetUiProvider,
  useSpreadsheetBackend,
  useSpreadsheetUiCoreContext,
} from '../src/provider'

afterEach(cleanup)

function createBackend(onReadVisibleProjection: () => void): SpreadsheetBackend {
  return {
    async readVisibleProjection() {
      onReadVisibleProjection()
      return {} as never
    },
    async readRangeProjection() {
      return {} as never
    },
    async setCellInput() {
      return {} as never
    },
  }
}

function BackendPortProbe(props: { onPort: (backend: SpreadsheetBackend) => void }) {
  props.onPort(useSpreadsheetBackend())
  return <span />
}

function SwitchableProvider(props: {
  backend: SpreadsheetBackend
  onChange: (change: (next: SpreadsheetBackend) => void) => void
  onPort: (backend: SpreadsheetBackend) => void
}) {
  const [backend, setBackend] = createSignal(props.backend)
  props.onChange((next) => setBackend(() => next))
  return (
    <SpreadsheetUiProvider backend={backend()} store={createStore()}>
      <BackendPortProbe onPort={props.onPort} />
    </SpreadsheetUiProvider>
  )
}

describe('vNext provider backend port', () => {
  it('exposes a callable Context port without placing the raw backend in UI state', async () => {
    let reads = 0
    const backend = createBackend(() => {
      reads += 1
    })
    let core: ReturnType<typeof useSpreadsheetUiCoreContext> | undefined

    function Probe() {
      core = useSpreadsheetUiCoreContext()
      return <span data-testid="core">{core ? 'ready' : 'missing'}</span>
    }

    const view = render(() => (
      <SpreadsheetUiProvider backend={backend}>
        <Probe />
      </SpreadsheetUiProvider>
    ))

    expect(view.getByTestId('core').textContent).toBe('ready')
    expect(core!.backend).not.toBe(backend)
    await core!.backend.readVisibleProjection({} as VisibleProjectionRequest)
    expect(reads).toBe(1)
  })

  it('keeps a retained hook port bound to the latest workbook after rebind', async () => {
    let firstReads = 0
    let secondReads = 0
    const first = createBackend(() => {
      firstReads += 1
    })
    const second = createBackend(() => {
      secondReads += 1
    })
    let changeBackend = (_next: SpreadsheetBackend): void => {}
    let retainedPort: SpreadsheetBackend | undefined

    render(() => (
      <SwitchableProvider
        backend={first}
        onChange={(change) => {
          changeBackend = change
        }}
        onPort={(port) => {
          retainedPort = port
        }}
      />
    ))

    expect(retainedPort).not.toBe(first)
    changeBackend(second)
    await waitFor(async () => {
      await retainedPort!.readVisibleProjection({} as VisibleProjectionRequest)
      expect(secondReads).toBe(1)
    })
    expect(firstReads).toBe(0)
  })
})
