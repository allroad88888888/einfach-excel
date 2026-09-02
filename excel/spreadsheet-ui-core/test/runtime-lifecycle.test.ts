import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import {
  beginSpreadsheetRuntimeAtom,
  rejectSpreadsheetRuntimeAtom,
  resolveSpreadsheetRuntimeAtom,
  spreadsheetRuntimeAtom,
  type SpreadsheetBackend,
} from '../src'
import { spreadsheetBackendBindingAtom } from '../src/runtime/backend-state'

describe('spreadsheet runtime lifecycle', () => {
  test('publishes loading, ready and error while owning the backend binding', () => {
    const store = createStore()
    const backend = {} as SpreadsheetBackend

    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'loading' })
    expect(store.getter(spreadsheetBackendBindingAtom)).toBeNull()

    store.setter(resolveSpreadsheetRuntimeAtom, { backend })
    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'ready' })
    expect(store.getter(spreadsheetBackendBindingAtom)).toEqual({ backend })

    store.setter(rejectSpreadsheetRuntimeAtom, new Error('Rust startup failed'))
    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({
      status: 'error',
      message: 'Rust startup failed',
    })
    expect(store.getter(spreadsheetBackendBindingAtom)).toBeNull()

    store.setter(beginSpreadsheetRuntimeAtom)
    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'loading' })
    expect(store.getter(spreadsheetBackendBindingAtom)).toBeNull()
  })
})
