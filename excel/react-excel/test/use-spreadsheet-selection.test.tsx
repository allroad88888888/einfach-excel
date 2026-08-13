import { createStore, type Store } from '@einfach/core'
import { setSelectionAtom, type SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { act, render, screen } from '@testing-library/react'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetSelection } from '../src/use-spreadsheet-selection'

const backend = {} as SpreadsheetBackend

function SelectionProbe({ id }: { id: string }) {
  const snapshot = useSpreadsheetSelection()
  return (
    <output data-testid={id}>
      {`${snapshot.selection.sheetId}:${snapshot.activeCell.row}:${snapshot.activeCell.col}`}
    </output>
  )
}

function setCellSelection(store: Store, sheetId: string, row: number, col: number): void {
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId,
    anchor: { row, col },
    focus: { row, col },
  })
}

function createTrackedStore(store: Store): {
  readonly getUnsubscribeCount: () => number
  readonly store: Store
} {
  const subscribe = store.sub
  let count = 0
  const trackSubscription: Store['sub'] = (atom, listener) => {
    const unsubscribe = subscribe(atom, listener)
    return () => {
      count += 1
      unsubscribe()
    }
  }

  return {
    getUnsubscribeCount: () => count,
    store: {
      sub: trackSubscription,
      getter: store.getter,
      setter: store.setter,
      toString: store.toString,
      clear: store.clear,
    },
  }
}

describe('useSpreadsheetSelection', () => {
  it('follows selection updates in independent provider stores', () => {
    const firstStore = createStore()
    const secondStore = createStore()

    render(
      <>
        <SpreadsheetUiProvider backend={backend} store={firstStore}>
          <SelectionProbe id="first" />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={backend} store={secondStore}>
          <SelectionProbe id="second" />
        </SpreadsheetUiProvider>
      </>,
    )

    act(() => setCellSelection(firstStore, 'first-sheet', 2, 3))
    expect(screen.getByTestId('first')).toHaveTextContent('first-sheet:2:3')
    expect(screen.getByTestId('second')).toHaveTextContent(':0:0')

    act(() => setCellSelection(secondStore, 'second-sheet', 5, 7))
    expect(screen.getByTestId('first')).toHaveTextContent('first-sheet:2:3')
    expect(screen.getByTestId('second')).toHaveTextContent('second-sheet:5:7')
  })

  it('reads from the nearest provider store', () => {
    const outerStore = createStore()
    const innerStore = createStore()

    render(
      <SpreadsheetUiProvider backend={backend} store={outerStore}>
        <SelectionProbe id="outer" />
        <SpreadsheetUiProvider backend={backend} store={innerStore}>
          <SelectionProbe id="inner" />
        </SpreadsheetUiProvider>
      </SpreadsheetUiProvider>,
    )

    act(() => {
      setCellSelection(outerStore, 'outer-sheet', 1, 1)
      setCellSelection(innerStore, 'inner-sheet', 4, 6)
    })

    expect(screen.getByTestId('outer')).toHaveTextContent('outer-sheet:1:1')
    expect(screen.getByTestId('inner')).toHaveTextContent('inner-sheet:4:6')
  })

  it('unsubscribes from the provider store on unmount', () => {
    const tracked = createTrackedStore(createStore())
    const view = render(
      <SpreadsheetUiProvider backend={backend} store={tracked.store}>
        <SelectionProbe id="selection" />
      </SpreadsheetUiProvider>,
    )

    view.unmount()

    expect(tracked.getUnsubscribeCount()).toBe(1)
  })
})
