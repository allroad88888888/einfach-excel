/** @jsxImportSource solid-js */

/**
 * `backend.setCellInput` REJECTS when the engine refuses a write (the
 * fallible `try*` bindings surface `CELL_WRITE_REJECTED` — see
 * `src-vnext/adapter/cell-write-reject.ts`). These suites pin the host's
 * behaviour on the command paths that are NOT the editing-commit lane and
 * therefore have no `editingCommitLifecycle` to land in: Delete-clears,
 * context-menu clears, and the per-cell paste fallback taken when the host
 * backend exposes no batch `importCells` port.
 *
 * The refusal REASON is deliberately irrelevant here. ADR 0006 retired
 * `spill-write` while `invalid-address` and `mutation-during-custom-call`
 * stay, so the fixture triggers with a stable reason and every assertion
 * looks only at the generic `CELL_WRITE_REJECTED` envelope.
 */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, waitFor } from '@solidjs/testing-library'
import {
  clipboardStateAtom,
  historyStackAtom,
  projectionSnapshotAtom,
} from '@einfach/spreadsheet-ui-core'
import {
  clickCell,
  createRefusingBackend,
  installClipboard,
  openCellMenu,
  pressGridKey,
  renderContextMenu,
  renderGrid,
  seedVisibleWindow,
  waitForGrid,
  withUnhandledRejectionWatch,
} from './cell-write-rejection-fixture'

let restoreClipboard: (() => void) | null = null

afterEach(() => {
  cleanup()
  restoreClipboard?.()
  restoreClipboard = null
})

describe('grid — refused single-cell clear', () => {
  it('reports the refusal, pushes no history entry and leaks no unhandled rejection', async () => {
    const store = createStore()
    const { backend, setCellInputRequests } = createRefusingBackend(0)

    const leaked = await withUnhandledRejectionWatch(async () => {
      const { container } = renderGrid(backend, store)
      await waitForGrid(container)
      clickCell(container, 'A1')
      pressGridKey(container, { key: 'Delete' })

      await waitFor(() => {
        expect(store.getter(projectionSnapshotAtom).status).toBe('error')
      })
    })

    expect(leaked).toEqual([])
    expect(setCellInputRequests).toHaveLength(1)
    expect(store.getter(projectionSnapshotAtom).error).toMatchObject({
      code: 'CELL_WRITE_REJECTED',
      message: 'cannot write R1C1: not a valid cell address',
    })
    // Nothing landed, so no UI history entry may exist — the worker adapter
    // records none either and the two stacks must stay aligned.
    expect(store.getter(historyStackAtom).entries).toHaveLength(0)
  })
})

describe('grid — refused paste fallback write', () => {
  it('stops at the refused cell, keeps the landed entry and refreshes the projection', async () => {
    restoreClipboard = installClipboard('a\tb')
    const store = createStore()
    const { backend, setCellInputRequests, readVisibleRequests } = createRefusingBackend(1)

    const leaked = await withUnhandledRejectionWatch(async () => {
      const { container } = renderGrid(backend, store)
      await waitForGrid(container)
      const readsBeforePaste = readVisibleRequests.length
      clickCell(container, 'A1')
      pressGridKey(container, { key: 'v', ctrlKey: true })

      await waitFor(() => {
        expect(store.getter(clipboardStateAtom).status).toBe('error')
      })
      // The cells that DID land must not stay invisible.
      await waitFor(() => {
        expect(readVisibleRequests.length).toBeGreaterThan(readsBeforePaste)
      })
    })

    expect(leaked).toEqual([])
    expect(setCellInputRequests).toHaveLength(2)
    expect(store.getter(clipboardStateAtom).error).toMatchObject({
      code: 'CELL_WRITE_REJECTED',
    })
    // One entry for the write that landed; none for the refused one.
    expect(store.getter(historyStackAtom).entries).toHaveLength(1)
  })
})

describe('context menu — refused writes', () => {
  it('Delete reports the refusal and leaks no unhandled rejection', async () => {
    const store = createStore()
    const { backend, setCellInputRequests } = createRefusingBackend(0)
    openCellMenu(store)

    const leaked = await withUnhandledRejectionWatch(async () => {
      const { getByTestId } = renderContextMenu(backend, store)
      fireEvent.click(getByTestId('context-menu-command-cell.clear'))
      await waitFor(() => {
        expect(store.getter(projectionSnapshotAtom).status).toBe('error')
      })
    })

    expect(leaked).toEqual([])
    expect(setCellInputRequests).toHaveLength(1)
    expect(store.getter(projectionSnapshotAtom).error).toMatchObject({
      code: 'CELL_WRITE_REJECTED',
    })
    expect(store.getter(historyStackAtom).entries).toHaveLength(0)
  })

  it('paste stops at the refused cell and still refreshes the projection', async () => {
    restoreClipboard = installClipboard('a\tb')
    const store = createStore()
    const { backend, setCellInputRequests, readVisibleRequests } = createRefusingBackend(1)
    seedVisibleWindow(store)
    openCellMenu(store)

    const leaked = await withUnhandledRejectionWatch(async () => {
      const { getByTestId } = renderContextMenu(backend, store)
      fireEvent.click(getByTestId('context-menu-command-clipboard.paste'))

      await waitFor(() => {
        expect(store.getter(clipboardStateAtom).status).toBe('error')
      })
      await waitFor(() => {
        expect(readVisibleRequests.length).toBeGreaterThan(0)
      })
    })

    expect(leaked).toEqual([])
    expect(setCellInputRequests).toHaveLength(2)
    expect(store.getter(clipboardStateAtom).error).toMatchObject({
      code: 'CELL_WRITE_REJECTED',
    })
  })
})
