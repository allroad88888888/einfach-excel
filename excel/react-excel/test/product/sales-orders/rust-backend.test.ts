import { describe, expect, it, jest } from '@jest/globals'
import packageJson from '../../../../spreadsheet-ui-core/package.json'
import {
  SALES_ORDER_CELL_COUNT,
  SALES_ORDER_IMPORT_CHUNK_SIZE,
  createSalesOrderImportChunks,
} from '../../../src/product/sales-orders/data/import-seed'

const { createWorkerTransport } = jest.requireActual(
  '@einfach/spreadsheet-ui-core/rust-worker',
) as { createWorkerTransport: unknown }
const { createRustWorkbookConnection } = jest.requireActual(
  '@einfach/spreadsheet-ui-core',
) as { createRustWorkbookConnection: unknown }

describe('React workbook Rust connection', () => {
  it('exports transport separately from the side-effectful runtime', () => {
    expect(packageJson.exports['./rust-worker']).toEqual({
      types: './@types/rust-worker/index.d.ts',
      import: './esm/rust-worker/index.mjs',
      require: './cjs/rust-worker/index.cjs',
    })
    expect(packageJson.exports['./rust-runtime']).toEqual({
      types: './@types/rust-runtime.d.ts',
      import: './esm/rust-runtime.mjs',
      default: './esm/rust-runtime.mjs',
    })
    expect(typeof createWorkerTransport).toBe('function')
    expect(typeof createRustWorkbookConnection).toBe('function')
  })

  it('provides exactly 8,008 initial cells in bounded chunks', () => {
    const chunks = createSalesOrderImportChunks()
    const importedCells = chunks.flat()
    expect(importedCells).toHaveLength(8_008)
    expect(importedCells).toHaveLength(SALES_ORDER_CELL_COUNT)
    expect(chunks.every((cells) => cells.length <= SALES_ORDER_IMPORT_CHUNK_SIZE)).toBe(true)
    expect(chunks[1]).toHaveLength(SALES_ORDER_IMPORT_CHUNK_SIZE)
    expect(importedCells).toEqual(expect.arrayContaining([
      expect.objectContaining({ sheet: 0, row: 0, col: 0, kind: 'text', value: 'Order' }),
      expect.objectContaining({ sheet: 0, row: 1_000, col: 7 }),
    ]))
  })
})
