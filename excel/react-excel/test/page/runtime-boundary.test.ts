import { describe, expect, it, jest } from '@jest/globals'
import packageJson from '../../../spreadsheet-ui-core/package.json'

const { createWorkerTransport } = jest.requireActual(
  '@einfach/spreadsheet-ui-core/rust-worker',
) as { createWorkerTransport: unknown }
const { createRustWorkbookConnection } = jest.requireActual('@einfach/spreadsheet-ui-core') as {
  createRustWorkbookConnection: unknown
}

describe('React workbook Rust runtime boundary', () => {
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
})
