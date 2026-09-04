import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_STATUS_BAR_AGGREGATE_CONFIG,
  setStatusBarAggregateConfigAtom,
  statusBarAggregateConfigAtom,
  toggleStatusBarAggregateAtom,
} from '../src/status-bar'

describe('statusBarAggregateConfigAtom', () => {
  test('defaults enable sum / average / count', () => {
    const store = createStore()
    expect(store.getter(statusBarAggregateConfigAtom)).toEqual(DEFAULT_STATUS_BAR_AGGREGATE_CONFIG)
  })

  test('toggling one key leaves the others untouched', () => {
    const store = createStore()
    store.setter(toggleStatusBarAggregateAtom, 'sum')
    const next = store.getter(statusBarAggregateConfigAtom)

    expect(next.sum).toBe(false)
    expect(next.average).toBe(true)
    expect(next.count).toBe(true)
    expect(next.numericCount).toBe(false)
    expect(next.min).toBe(false)
    expect(next.max).toBe(false)

    store.setter(toggleStatusBarAggregateAtom, 'numericCount')
    const after = store.getter(statusBarAggregateConfigAtom)
    expect(after.numericCount).toBe(true)
    expect(after.sum).toBe(false)
  })

  test('setStatusBarAggregateConfigAtom replaces the whole config', () => {
    const store = createStore()
    store.setter(setStatusBarAggregateConfigAtom, {
      sum: false,
      average: false,
      count: false,
      numericCount: true,
      min: true,
      max: true,
    })

    const config = store.getter(statusBarAggregateConfigAtom)
    expect(config.sum).toBe(false)
    expect(config.numericCount).toBe(true)
    expect(config.min).toBe(true)
    expect(config.max).toBe(true)
  })
})
