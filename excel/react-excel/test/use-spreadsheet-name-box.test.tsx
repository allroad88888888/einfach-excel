import { createStore, type Store } from '@einfach/core'
import {
  loadNamedRangeCapabilitiesAtom,
  nameBoxStateAtom,
  setNameRegistryAtom,
  setSelectionAtom,
  setViewportMetricsAtom,
  setWorkspaceActiveSheetAtom,
  viewportMetricsAtom,
  workspaceSessionAtom,
  type NameBoxCommitTarget,
  type NamedRangeBackendCapabilities,
  type NamedRangeControllerPort,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetNameBox, type NameBoxScrollTarget } from '../src/use-spreadsheet-name-box'

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

interface NameBoxSurfaceProps {
  readonly id: string
  readonly onCommit?: (target: NameBoxCommitTarget) => void
  readonly onScrollToCell?: (target: NameBoxScrollTarget) => void
  readonly source?: NamedRangeControllerPort
}

function NameBoxSurface({ id, onCommit, onScrollToCell, source }: NameBoxSurfaceProps) {
  const nameBox = useSpreadsheetNameBox({ onScrollToCell })
  const { state } = nameBox
  const commit = () => {
    const target = nameBox.commit({ input: state.input, source, sessionId: state.sessionId })
    onCommit?.(target)
  }

  return (
    <div data-testid={id}>
      <output data-testid={`${id}-display`}>{state.display}</output>
      <output data-testid={`${id}-mode`}>{state.mode}</output>
      <input
        data-testid={`${id}-input`}
        value={state.focused ? state.input : state.display}
        onBlur={() => nameBox.blur({ sessionId: state.sessionId })}
        onChange={(event) =>
          nameBox.updateInput({ input: event.target.value, sessionId: state.sessionId })
        }
        onFocus={() => nameBox.focus()}
      />
      <button data-testid={`${id}-commit`} onClick={commit}>
        Commit
      </button>
      <button
        data-testid={`${id}-revert`}
        onClick={() => nameBox.revert({ sessionId: state.sessionId })}
      >
        Revert
      </button>
    </div>
  )
}

function selectCell(store: Store, sheetId: string, row: number, col: number): void {
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId,
    anchor: { row, col },
    focus: { row, col },
  })
}

function renderSurface(store: Store, props: NameBoxSurfaceProps) {
  return render(
    <SpreadsheetUiProvider backend={backend} store={store}>
      <NameBoxSurface {...props} />
    </SpreadsheetUiProvider>,
  )
}

function commitInput(view: ReturnType<typeof render>, id: string, input: string): void {
  const field = view.getByTestId(`${id}-input`)
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: input } })
  fireEvent.click(view.getByTestId(`${id}-commit`))
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
  }
}

describe('useSpreadsheetNameBox', () => {
  it('forwards focus, commit, blur, and revert commands through the provider store', () => {
    const store = createStore()
    const onCommit = jest.fn()
    selectCell(store, 'sheet-1', 0, 0)
    const view = renderSurface(store, { id: 'name-box', onCommit })
    const input = view.getByTestId('name-box-input')

    expect(input).toHaveValue('A1')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'C3' } })
    expect(store.getter(nameBoxStateAtom)).toMatchObject({
      input: 'C3',
      focused: true,
      mode: 'typing',
    })

    fireEvent.click(view.getByTestId('name-box-revert'))
    expect(store.getter(nameBoxStateAtom)).toMatchObject({ input: 'A1', mode: 'idle' })

    commitInput(view, 'name-box', 'C3')
    expect(onCommit).toHaveBeenLastCalledWith({
      kind: 'cell',
      sheetId: 'sheet-1',
      coord: { row: 2, col: 2 },
    })
    fireEvent.blur(input)
    expect(store.getter(nameBoxStateAtom)).toMatchObject({
      display: 'C3',
      focused: false,
      mode: 'idle',
    })
  })

  it('commits cell, range, and named-range targets parsed by UI core', () => {
    const store = createStore()
    const onCommit = jest.fn()
    selectCell(store, 'sheet-1', 0, 0)
    store.setter(setNameRegistryAtom, {
      names: [
        {
          name: 'Budget',
          scope: 'workbook',
          refersTo: { kind: 'range', sheetId: 'sheet-1', address: 'D5:E6' },
        },
      ],
    })
    const view = renderSurface(store, { id: 'name-box', onCommit })

    commitInput(view, 'name-box', 'B4')
    commitInput(view, 'name-box', 'C3:E5')
    commitInput(view, 'name-box', 'Budget')

    expect(onCommit.mock.calls.map(([target]) => (target as NameBoxCommitTarget).kind)).toEqual([
      'cell',
      'range',
      'named-range',
    ])
    expect(onCommit).toHaveBeenLastCalledWith({
      kind: 'named-range',
      sheetId: 'sheet-1',
      name: 'Budget',
      range: { rowStart: 4, rowEnd: 5, colStart: 3, colEnd: 4 },
      coord: undefined,
    })
  })

  it('passes a new named-range definition to the supplied core port', async () => {
    const store = createStore()
    const setNamedRange = jest.fn(async () => ({
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
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 2, col: 2 },
      focus: { row: 4, col: 4 },
    })
    const onCommit = jest.fn()
    const view = renderSurface(store, { id: 'name-box', onCommit, source })

    commitInput(view, 'name-box', 'BrandNew')
    expect(onCommit).toHaveBeenLastCalledWith({
      kind: 'define-name',
      sheetId: 'sheet-1',
      name: 'BrandNew',
      range: { rowStart: 2, rowEnd: 4, colStart: 2, colEnd: 4 },
    })
    await waitFor(() =>
      expect(setNamedRange).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'set-named-range',
          name: 'BrandNew',
          scope: 'workbook',
          refersTo: { kind: 'range', sheetId: 'sheet-1', address: 'C3:E5' },
        }),
      ),
    )
  })

  it('activates and scrolls to a named range on another sheet', () => {
    const store = createStore()
    const onCommit = jest.fn()
    const onScrollToCell = jest.fn()
    selectCell(store, 'sheet-1', 0, 0)
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(setViewportMetricsAtom, {
      scrollTop: 0,
      scrollLeft: 0,
      viewportHeight: 24,
      viewportWidth: 96,
      rowHeight: 24,
      colWidth: 96,
      rowCount: 100,
      colCount: 100,
      overscanRows: 0,
      overscanCols: 0,
    })
    store.setter(setNameRegistryAtom, {
      names: [
        {
          name: 'OtherSheet',
          scope: 'workbook',
          refersTo: { kind: 'range', sheetId: 'sheet-2', address: 'E7:F8' },
        },
      ],
    })
    const view = renderSurface(store, { id: 'name-box', onCommit, onScrollToCell })

    commitInput(view, 'name-box', 'OtherSheet')

    expect(onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'named-range', sheetId: 'sheet-2' }),
    )
    expect(onScrollToCell).toHaveBeenCalledWith({
      sheetId: 'sheet-2',
      coord: { row: 6, col: 4 },
    })
    expect(store.getter(workspaceSessionAtom).activeSheetId).toBe('sheet-2')
    expect(store.getter(viewportMetricsAtom)).toMatchObject({
      scrollTop: expect.any(Number),
      scrollLeft: expect.any(Number),
    })
    expect(store.getter(viewportMetricsAtom).scrollTop).toBeGreaterThan(0)
    expect(store.getter(viewportMetricsAtom).scrollLeft).toBeGreaterThan(0)
  })

  it('keeps name-box state isolated between sibling providers', () => {
    const firstStore = createStore()
    const secondStore = createStore()
    selectCell(firstStore, 'first-sheet', 0, 0)
    selectCell(secondStore, 'second-sheet', 1, 1)
    const view = render(
      <>
        <SpreadsheetUiProvider backend={backend} store={firstStore}>
          <NameBoxSurface id="first" />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={backend} store={secondStore}>
          <NameBoxSurface id="second" />
        </SpreadsheetUiProvider>
      </>,
    )

    const firstInput = view.getByTestId('first-input')
    fireEvent.focus(firstInput)
    fireEvent.change(firstInput, { target: { value: 'C3' } })

    expect(firstStore.getter(nameBoxStateAtom)).toMatchObject({
      input: 'C3',
      focused: true,
    })
    expect(secondStore.getter(nameBoxStateAtom)).toMatchObject({
      display: 'B2',
      input: '',
      focused: false,
      sessionId: 0,
    })
    expect(view.getByTestId('second-input')).toHaveValue('B2')
  })
})
