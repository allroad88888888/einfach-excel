import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
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

describe('useSpreadsheetValue', () => {
  it('reads the initial snapshot and follows source updates', () => {
    const source = createValueSource('A1')
    const subscription = useSpreadsheetValue(source)

    expect(subscription.value.value).toBe('A1')
    source.setValue('B2')
    expect(subscription.value.value).toBe('B2')

    subscription.dispose()
  })

  it('unsubscribes when its enclosing Vue scope stops', () => {
    const source = createValueSource('A1')
    const scope = effectScope()
    const subscription = scope.run(() => useSpreadsheetValue(source))

    expect(subscription).toBeDefined()
    expect(source.listenerCount()).toBe(1)
    scope.stop()

    expect(source.listenerCount()).toBe(0)
    expect(source.unsubscribeCalls()).toBe(1)
  })

  it('disposes an unscoped bridge once and stops projecting later source updates', () => {
    const source = createValueSource('A1')
    const subscription = useSpreadsheetValue(source)

    subscription.dispose()
    subscription.dispose()
    source.setValue('B2')

    expect(source.listenerCount()).toBe(0)
    expect(source.unsubscribeCalls()).toBe(1)
    expect(subscription.value.value).toBe('A1')
  })
})
