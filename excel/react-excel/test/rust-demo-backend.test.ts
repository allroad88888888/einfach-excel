import { describe, expect, it, jest } from '@jest/globals'
import packageJson from '../../solid-excel/package.json'
import {
  RUST_DEMO_CELL_COUNT,
  RUST_DEMO_IMPORT_CHUNK_SIZE,
} from '../demo/rust-demo-seed'

type ImportRustDemoWorkbook = (
  client: {
    beginImport(options: { mode: 'direct' }): Promise<number>
    cancelImport(sessionId: number): Promise<boolean>
    commitImport(sessionId: number): Promise<{
      accepted: number
      errors: number
      rejectedFormulas: number
    }>
    importChunk(sessionId: number, cells: unknown[]): Promise<number>
  },
  sheetIndex: number,
) => Promise<void>

jest.mock(
  '@einfach/solid-excel/vnext-worker-runtime?worker',
  () => ({ default: class RustWorkbookWorker {} }),
  { virtual: true },
)

const { createWorkerWorkbookSpreadsheetBackend: exportedBackendFactory } = jest.requireActual(
  '@einfach/solid-excel/worker-backend',
) as { createWorkerWorkbookSpreadsheetBackend: unknown }
const { importRustDemoWorkbook } = jest.requireActual(
  '../demo/rust-demo-backend',
) as { importRustDemoWorkbook: ImportRustDemoWorkbook }

describe('React Rust demo backend', () => {
  it('exports the existing neutral backend at the exact package subpath', () => {
    expect(packageJson.exports['./worker-backend']).toEqual({
      solid: './src/adapter/worker/backend.ts',
      types: './@types/src/adapter/worker/backend.d.ts',
      import: './esm/src/adapter/worker/backend.mjs',
      default: './esm/src/adapter/worker/backend.mjs',
    })
    expect(typeof exportedBackendFactory).toBe('function')
  })

  it('direct-imports exactly 8,008 cells in bounded chunks', async () => {
    const importedCells: unknown[] = []
    const beginImport = jest.fn(async () => 17)
    let normalizedCellCount = 0
    const importChunk = jest.fn(async (_sessionId: number, cells: unknown[]) => {
      importedCells.push(...cells)
      normalizedCellCount += cells.length
      return normalizedCellCount
    })
    const commitImport = jest.fn(async () => ({
      accepted: RUST_DEMO_CELL_COUNT,
      formulas: 1_000,
      rejectedFormulas: 0,
      cleared: 0,
      errors: 0,
    }))
    const cancelImport = jest.fn(async () => true)

    await importRustDemoWorkbook(
      { beginImport, importChunk, commitImport, cancelImport },
      3,
    )

    expect(beginImport).toHaveBeenCalledWith({ mode: 'direct' })
    expect(importedCells).toHaveLength(8_008)
    expect(importedCells).toHaveLength(RUST_DEMO_CELL_COUNT)
    expect(importChunk.mock.calls.every(([, cells]) => cells.length <= RUST_DEMO_IMPORT_CHUNK_SIZE))
      .toBe(true)
    expect(importChunk.mock.calls[1]?.[1]).toHaveLength(RUST_DEMO_IMPORT_CHUNK_SIZE)
    expect(importedCells).toEqual(expect.arrayContaining([
      expect.objectContaining({ sheet: 3, row: 0, col: 0, kind: 'text', value: 'Order' }),
      expect.objectContaining({ sheet: 3, row: 1_000, col: 7 }),
    ]))
    expect(commitImport).toHaveBeenCalledWith(17)
    expect(cancelImport).not.toHaveBeenCalled()
  })

  it('rejects failed commit stats', async () => {
    let normalizedCellCount = 0
    const client = {
      beginImport: async () => 21,
      importChunk: async (_sessionId: number, cells: unknown[]) => {
        normalizedCellCount += cells.length
        return normalizedCellCount
      },
      commitImport: async () => ({
        accepted: RUST_DEMO_CELL_COUNT - 1,
        errors: 1,
        rejectedFormulas: 0,
      }),
      cancelImport: jest.fn(async () => true),
    }

    await expect(importRustDemoWorkbook(client, 0)).rejects.toThrow(
      'Rust workbook import failed',
    )
  })
})
