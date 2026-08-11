/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { atom, createStore, type Store } from '@einfach/core'
import { useAtomValue } from '@einfach/solid'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import { onMount } from 'solid-js'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'

import { SpreadsheetUiProvider, useSpreadsheetUiCore } from '../src-vnext/provider'

afterEach(cleanup)

const workbookMarkerAtom = atom('')

function unusedBackend(): SpreadsheetBackend {
  return {
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
}

function StoreProbe(props: { marker: string; stores: Store[]; testId: string }) {
  const core = useSpreadsheetUiCore()
  const marker = useAtomValue(workbookMarkerAtom)

  onMount(() => {
    props.stores.push(core.store)
    core.store.setter(workbookMarkerAtom, props.marker)
  })

  return <output data-testid={props.testId}>{marker()}</output>
}

describe('vNext provider Store ownership', () => {
  it('creates isolated Stores for independent mounts and a new Store after remount', async () => {
    const backend = unusedBackend()
    const seenStores: Store[] = []
    const first = render(() => (
      <>
        <SpreadsheetUiProvider backend={backend}>
          <StoreProbe marker="first" stores={seenStores} testId="first" />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={backend}>
          <StoreProbe marker="second" stores={seenStores} testId="second" />
        </SpreadsheetUiProvider>
      </>
    ))

    await waitFor(() => {
      expect(first.getByTestId('first').textContent).toBe('first')
      expect(first.getByTestId('second').textContent).toBe('second')
    })
    expect(seenStores).toHaveLength(2)
    expect(seenStores[0]).not.toBe(seenStores[1])

    first.unmount()
    const remount = render(() => (
      <SpreadsheetUiProvider backend={backend}>
        <StoreProbe marker="remounted" stores={seenStores} testId="remounted" />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => expect(remount.getByTestId('remounted').textContent).toBe('remounted'))
    expect(seenStores).toHaveLength(3)
    expect(seenStores[2]).not.toBe(seenStores[0])
    expect(seenStores[2]).not.toBe(seenStores[1])
  })

  it('uses the caller-provided Store as the workbook Store', () => {
    const suppliedStore = createStore()
    const seenStores: Store[] = []

    render(() => (
      <SpreadsheetUiProvider backend={unusedBackend()} store={suppliedStore}>
        <StoreProbe marker="supplied" stores={seenStores} testId="supplied" />
      </SpreadsheetUiProvider>
    ))

    expect(seenStores).toEqual([suppliedStore])
    expect(suppliedStore.getter(workbookMarkerAtom)).toBe('supplied')
  })
})
