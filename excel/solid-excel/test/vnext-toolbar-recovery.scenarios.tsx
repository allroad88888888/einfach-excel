/** @jsxImportSource solid-js */

import { expect, it } from 'vitest'
import * as toolbar from './vnext-toolbar-test-support'

export function registerRecoveryScenarios(): void {
  it('reconciles a dispatched transport rejection without resending the mutation', async () => {
    const store = toolbar.createStore()
    const recording = toolbar.createRecordingBackend()
    const requests: toolbar.SetFormatRangeRequest[] = []
    const backend: toolbar.SpreadsheetBackend = {
      ...recording.backend,
      async setFormatRange(request) {
        requests.push(request)
        throw new Error('transport rejected after dispatch')
      },
    }

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    toolbar.seedReadyProjection(store)

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    toolbar.fireEvent.click(toolbar.getButtons(container).bold)

    await toolbar.waitFor(() => {
      expect(store.getter(toolbar.toolbarMutationLifecycleAtom).status).toBe('outcome-unknown')
      expect(
        container.querySelector('[data-testid="toolbar-mutation-refresh-retry"]'),
      ).not.toBeNull()
    })
    expect(container.querySelector('[data-testid="toolbar-mutation-retry"]')).toBeNull()
    expect(requests).toHaveLength(1)
    expect(store.getter(toolbar.historyStackAtom).entries).toHaveLength(0)

    toolbar.fireEvent.click(
      container.querySelector(
        '[data-testid="toolbar-mutation-refresh-retry"]',
      ) as HTMLButtonElement,
    )

    await toolbar.waitFor(() => {
      expect(store.getter(toolbar.toolbarMutationLifecycleAtom)).toMatchObject({
        status: 'outcome-unknown',
        canRetryRefresh: false,
      })
      expect(recording.readVisibleProjectionCalls).toHaveLength(1)
      expect(store.getter(toolbar.historyStackAtom).entries).toHaveLength(0)
      expect(container.querySelector('[data-testid="toolbar-mutation-refresh-retry"]')).toBeNull()
    })
    expect(requests).toHaveLength(1)
  })

  it('offers reconcile-only recovery after an ambiguous ACK without resending the mutation', async () => {
    const store = toolbar.createStore()
    const recording = toolbar.createRecordingBackend()
    const requests: toolbar.SetFormatRangeRequest[] = []
    const backend: toolbar.SpreadsheetBackend = {
      ...recording.backend,
      async setFormatRange(request) {
        requests.push(request)
        return {
          kind: request.kind,
          sheetId: request.sheetId,
          requestId: 999_999,
          revision: 2,
          affectedRange: { ...request.range },
        }
      },
    }

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    toolbar.seedReadyProjection(store)

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    toolbar.fireEvent.click(toolbar.getButtons(container).bold)

    await toolbar.waitFor(() => {
      expect(store.getter(toolbar.toolbarMutationLifecycleAtom).status).toBe('outcome-unknown')
      expect(
        container.querySelector('[data-testid="toolbar-mutation-refresh-retry"]'),
      ).not.toBeNull()
    })
    expect(requests).toHaveLength(1)
    expect(recording.readVisibleProjectionCalls).toHaveLength(0)
    expect(store.getter(toolbar.historyStackAtom).entries).toHaveLength(0)

    toolbar.fireEvent.click(
      container.querySelector(
        '[data-testid="toolbar-mutation-refresh-retry"]',
      ) as HTMLButtonElement,
    )

    await toolbar.waitFor(() => {
      expect(store.getter(toolbar.toolbarMutationLifecycleAtom)).toMatchObject({
        status: 'outcome-unknown',
        canRetryRefresh: false,
      })
      expect(recording.readVisibleProjectionCalls).toHaveLength(1)
      expect(container.querySelector('[data-testid="toolbar-mutation-refresh-retry"]')).toBeNull()
    })
    expect(requests).toHaveLength(1)
    expect(store.getter(toolbar.historyStackAtom).entries).toHaveLength(0)
  })
}
