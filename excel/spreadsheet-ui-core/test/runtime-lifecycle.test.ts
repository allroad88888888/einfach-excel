import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import {
  beginSpreadsheetRuntimeAtom,
  rejectSpreadsheetRuntimeAtom,
  resolveSpreadsheetRuntimeAtom,
  rustWorkbookConnectionAtom,
  spreadsheetRuntimeAtom,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

describe('spreadsheet runtime lifecycle', () => {
  test('publishes loading, ready and error while owning the Rust connection', () => {
    const store = createStore()
    const connection = createTestRustWorkbookConnection()

    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'loading' })
    expect(store.getter(rustWorkbookConnectionAtom)).toBeNull()

    store.setter(resolveSpreadsheetRuntimeAtom, { connection })
    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'ready' })
    expect(store.getter(rustWorkbookConnectionAtom)).toBe(connection)

    store.setter(rejectSpreadsheetRuntimeAtom, new Error('Rust startup failed'))
    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({
      status: 'error',
      message: 'Rust startup failed',
    })
    expect(store.getter(rustWorkbookConnectionAtom)).toBeNull()

    store.setter(beginSpreadsheetRuntimeAtom)
    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'loading' })
    expect(store.getter(rustWorkbookConnectionAtom)).toBeNull()
  })
})
