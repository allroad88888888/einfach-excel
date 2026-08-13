import { createStore, type Store } from '@einfach/core'
import {
  formulaBarDraftAtom,
  formulaBarStateAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { act, fireEvent, render } from '@testing-library/react'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetFormulaBar } from '../src/use-spreadsheet-formula-bar'

const backend = {} as SpreadsheetBackend

function syncInput(sheetId: string) {
  return {
    sheetId,
    cell: { row: 2, col: 3 },
    draft: '=A1+1',
    source: 'selection',
  } as const
}

function FormulaBarSurface({ id }: { id: string }) {
  const formulaBar = useSpreadsheetFormulaBar()
  return (
    <div data-testid={id}>
      <output data-testid={`${id}-status`}>{formulaBar.state.status}</output>
      <output data-testid={`${id}-draft`}>{formulaBar.draft}</output>
      <output data-testid={`${id}-sheet`}>{formulaBar.state.sheetId ?? ''}</output>
      <button data-testid={`${id}-sync`} onClick={() => formulaBar.sync(syncInput(id))}>
        Sync
      </button>
      <button data-testid={`${id}-focus`} onClick={() => formulaBar.focus()}>
        Focus
      </button>
      <button data-testid={`${id}-draft-button`} onClick={() => formulaBar.setDraft('=A1+2')}>
        Draft
      </button>
      <button
        data-testid={`${id}-diagnostic`}
        onClick={() =>
          formulaBar.setDiagnostic({
            code: 'FORMULA_WARNING',
            message: 'Check input',
            level: 'warning',
          })
        }
      >
        Diagnostic
      </button>
      <button
        data-testid={`${id}-error`}
        onClick={() => formulaBar.setError({ code: 'INVALID_FORMULA', message: 'Parse error' })}
      >
        Error
      </button>
    </div>
  )
}

function renderSurface(store: Store, id = 'sheet-1') {
  return render(
    <SpreadsheetUiProvider backend={backend} store={store}>
      <FormulaBarSurface id={id} />
    </SpreadsheetUiProvider>,
  )
}

describe('useSpreadsheetFormulaBar', () => {
  it('subscribes to core formula bar changes and forwards its commands', () => {
    const store = createStore()
    const view = renderSurface(store)

    act(() => store.setter(formulaBarDraftAtom, '=A1'))
    expect(view.getByTestId('sheet-1-draft')).toHaveTextContent('=A1')

    fireEvent.click(view.getByTestId('sheet-1-sync'))
    fireEvent.click(view.getByTestId('sheet-1-focus'))
    fireEvent.click(view.getByTestId('sheet-1-draft-button'))
    fireEvent.click(view.getByTestId('sheet-1-diagnostic'))
    fireEvent.click(view.getByTestId('sheet-1-error'))

    expect(store.getter(formulaBarStateAtom)).toMatchObject({
      status: 'error',
      focused: true,
      sheetId: 'sheet-1',
      cell: { row: 2, col: 3 },
      draft: '=A1+2',
      diagnostic: { code: 'FORMULA_WARNING', level: 'warning' },
      error: { code: 'INVALID_FORMULA', message: 'Parse error' },
    })
    expect(view.getByTestId('sheet-1-status')).toHaveTextContent('error')
    expect(view.getByTestId('sheet-1-draft')).toHaveTextContent('=A1+2')
    expect(view.getByTestId('sheet-1-sheet')).toHaveTextContent('sheet-1')
  })

  it('keeps formula bars isolated in independent provider stores', () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const view = render(
      <>
        <SpreadsheetUiProvider backend={backend} store={firstStore}>
          <FormulaBarSurface id="first" />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={backend} store={secondStore}>
          <FormulaBarSurface id="second" />
        </SpreadsheetUiProvider>
      </>,
    )

    fireEvent.click(view.getByTestId('first-sync'))
    fireEvent.click(view.getByTestId('first-focus'))

    expect(firstStore.getter(formulaBarStateAtom)).toMatchObject({
      status: 'focused',
      focused: true,
      sheetId: 'first',
    })
    expect(secondStore.getter(formulaBarStateAtom)).toMatchObject({
      status: 'idle',
      focused: false,
      sheetId: null,
      draft: '',
    })
    expect(view.getByTestId('first-sheet')).toHaveTextContent('first')
    expect(view.getByTestId('second-sheet')).toHaveTextContent('')
  })
})
