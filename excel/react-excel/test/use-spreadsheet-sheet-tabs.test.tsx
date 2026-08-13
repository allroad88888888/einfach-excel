import { createStore, type Store } from '@einfach/core'
import {
  sheetTabsAtom,
  sheetTabsSheetsAtom,
  workspaceSessionAtom,
  type AddSheetRequest,
  type SheetListResult,
  type SpreadsheetBackend,
  type SpreadsheetSheetMetadata,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import {
  useSpreadsheetSheetTabs,
  type SpreadsheetSheetTabMetadataInput,
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
  const listed = jest.fn(listSheets ?? (async () => ({ sheets: currentSheets })))
  const addSheet = jest.fn(async (request: AddSheetRequest) => {
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

interface SheetTabsSurfaceProps {
  readonly id: string
  readonly sheets: readonly SpreadsheetSheetTabMetadataInput[]
}

function SheetTabsSurface({ id, sheets }: SheetTabsSurfaceProps) {
  const sheetTabs = useSpreadsheetSheetTabs({ sheets })

  return (
    <section data-testid={id}>
      <output data-testid={`${id}-phase`}>{sheetTabs.state.phase}</output>
      <output data-testid={`${id}-sheets`}>
        {sheetTabs.sheets.map((sheet) => sheet.id).join(',')}
      </output>
      <button
        data-testid={`${id}-activate-second`}
        onClick={() => sheetTabs.activate({ sheetId: sheets[1]?.id ?? '' })}
      >
        Activate second
      </button>
      <button data-testid={`${id}-add`} onClick={() => void sheetTabs.addSheet()}>
        Add sheet
      </button>
    </section>
  )
}

function renderSurface(store: Store, backend: SpreadsheetBackend, props: SheetTabsSurfaceProps) {
  return render(
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SheetTabsSurface {...props} />
    </SpreadsheetUiProvider>,
  )
}

describe('useSpreadsheetSheetTabs', () => {
  it('initializes the nearest provider from the seed and its UI-core backend', async () => {
    const store = createStore()
    const harness = createBackend(SHEETS)
    const view = renderSurface(store, harness.backend, { id: 'tabs', sheets: SHEETS })

    await waitFor(() => expect(view.getByTestId('tabs-phase')).toHaveTextContent('ready'))

    expect(harness.listed).toHaveBeenCalledTimes(1)
    expect(store.getter(sheetTabsAtom)).toMatchObject({ phase: 'ready', error: null })
    expect(store.getter(sheetTabsSheetsAtom)).toEqual(SHEETS)
    expect(view.getByTestId('tabs-sheets')).toHaveTextContent('sheet-1,sheet-2')
  })

  it('forwards activation and add-sheet mutation commands through UI core', async () => {
    const store = createStore()
    const harness = createBackend(SHEETS)
    const view = renderSurface(store, harness.backend, { id: 'tabs', sheets: SHEETS })

    await waitFor(() => expect(view.getByTestId('tabs-phase')).toHaveTextContent('ready'))
    fireEvent.click(view.getByTestId('tabs-activate-second'))
    expect(store.getter(workspaceSessionAtom).activeSheetId).toBe('sheet-2')

    fireEvent.click(view.getByTestId('tabs-add'))
    await waitFor(() => expect(harness.addSheet).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(store.getter(sheetTabsAtom)).toMatchObject({
        mutation: null,
        lastMutation: { kind: 'add', outcome: 'acknowledged' },
      }),
    )

    expect(harness.addSheet).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'add-sheet', name: 'Sheet3' }),
    )
    expect(store.getter(sheetTabsSheetsAtom).map((sheet) => sheet.id)).toEqual([
      'sheet-1',
      'sheet-2',
      'sheet-3',
    ])
    expect(store.getter(workspaceSessionAtom).activeSheetId).toBe('sheet-3')
  })

  it('disposes an unmounted session and ignores its delayed initialization result', async () => {
    const store = createStore()
    const delayedList = deferred<SheetListResult>()
    const harness = createBackend(SHEETS, () => delayedList.promise)
    const view = renderSurface(store, harness.backend, { id: 'tabs', sheets: SHEETS })

    await waitFor(() => expect(store.getter(sheetTabsAtom).phase).toBe('loading'))
    view.unmount()
    expect(store.getter(sheetTabsAtom).phase).toBe('unloaded')

    await act(async () => {
      delayedList.resolve({ sheets: [{ id: 'late', name: 'Late', index: 0 }] })
      await Promise.resolve()
    })

    expect(store.getter(sheetTabsAtom).phase).toBe('unloaded')
    expect(store.getter(sheetTabsSheetsAtom)).toEqual(SHEETS)
  })

  it('keeps sheet-tab state isolated between sibling providers', async () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const firstHarness = createBackend(SHEETS)
    const secondSheets = [
      { id: 'other-1', name: 'Other1', index: 0 },
      { id: 'other-2', name: 'Other2', index: 1 },
    ]
    const secondHarness = createBackend(secondSheets)
    const view = render(
      <>
        <SpreadsheetUiProvider backend={firstHarness.backend} store={firstStore}>
          <SheetTabsSurface id="first" sheets={SHEETS} />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={secondHarness.backend} store={secondStore}>
          <SheetTabsSurface id="second" sheets={secondSheets} />
        </SpreadsheetUiProvider>
      </>,
    )

    await waitFor(() => expect(view.getByTestId('first-phase')).toHaveTextContent('ready'))
    await waitFor(() => expect(view.getByTestId('second-phase')).toHaveTextContent('ready'))
    fireEvent.click(view.getByTestId('first-activate-second'))

    expect(firstStore.getter(workspaceSessionAtom).activeSheetId).toBe('sheet-2')
    expect(secondStore.getter(workspaceSessionAtom).activeSheetId).toBe('other-1')
    expect(firstStore.getter(sheetTabsSheetsAtom)).toEqual(SHEETS)
    expect(secondStore.getter(sheetTabsSheetsAtom)).toEqual(secondSheets)
  })
})
