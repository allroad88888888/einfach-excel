import { describe, expect, it, jest } from '@jest/globals'
import {
  SpreadsheetGrid,
  SpreadsheetUiProvider,
  createWorkerWorkbook,
  createStaticSpreadsheetBackend,
  createWorkerWorkbookSpreadsheetBackend,
} from '../src/public'
import * as vNext from '../src/public'

const packageJson = jest.requireActual('../package.json') as {
  exports: Record<string, unknown>
}

describe('@einfach/solid-excel/vnext subpath', () => {
  it('exposes the vNext public API without importing demos', () => {
    expect(typeof SpreadsheetUiProvider).toBe('function')
    expect(typeof SpreadsheetGrid).toBe('function')
    expect(typeof createWorkerWorkbook).toBe('function')
    expect(typeof createStaticSpreadsheetBackend).toBe('function')
    expect(typeof createWorkerWorkbookSpreadsheetBackend).toBe('function')
    expect('VNextSmokeDemo' in vNext).toBe(false)
    expect('VNextWorkerDemo' in vNext).toBe(false)
    expect('defaultVNextWorkbookWorkerFactory' in vNext).toBe(false)
  })

  it('keeps every vnext worker path as an alias of its canonical path', () => {
    const pairs = [
      ['./worker-factory', './vnext-worker-factory'],
      ['./worker-runtime', './vnext-worker-runtime'],
      ['./worker-runtime-full', './vnext-worker-runtime-full'],
      ['./worker-runtime-core', './vnext-worker-runtime-core'],
    ] as const

    for (const [canonical, alias] of pairs) {
      expect(packageJson.exports[canonical]).toEqual(packageJson.exports[alias])
    }
  })
})
