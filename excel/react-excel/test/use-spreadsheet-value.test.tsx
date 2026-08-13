import { describe, expect, it } from '@jest/globals'
import { act, render, screen } from '@testing-library/react'
import type { SpreadsheetValueSource } from '../src/use-spreadsheet-value'
import { useSpreadsheetValue } from '../src/use-spreadsheet-value'

interface TestValueSource<T> extends SpreadsheetValueSource<T> {
  listenerCount: () => number
  setValue: (nextValue: T) => void
  unsubscribeCalls: () => number
}

function createValueSource<T>(initialValue: T): TestValueSource<T> {
  let value = initialValue
  let unsubscribeCount = 0
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        unsubscribeCount += 1
        listeners.delete(listener)
      }
    },
    listenerCount: () => listeners.size,
    setValue: (nextValue) => {
      value = nextValue
      for (const listener of listeners) listener()
    },
    unsubscribeCalls: () => unsubscribeCount,
  }
}

function ValueView({ source }: { source: SpreadsheetValueSource<string> }) {
  return <output data-testid="value">{useSpreadsheetValue(source)}</output>
}

describe('useSpreadsheetValue', () => {
  it('renders the source snapshot and follows updates', () => {
    const source = createValueSource('A1')

    render(<ValueView source={source} />)
    expect(screen.getByTestId('value')).toHaveTextContent('A1')

    act(() => source.setValue('B2'))
    expect(screen.getByTestId('value')).toHaveTextContent('B2')
  })

  it('unsubscribes from the source when the React view unmounts', () => {
    const source = createValueSource('A1')
    const view = render(<ValueView source={source} />)

    expect(source.listenerCount()).toBe(1)
    view.unmount()

    expect(source.listenerCount()).toBe(0)
    expect(source.unsubscribeCalls()).toBe(1)
  })
})
