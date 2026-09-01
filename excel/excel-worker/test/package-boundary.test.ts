import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from '@jest/globals'

const PACKAGE_PATH = fileURLToPath(new URL('../package.json', import.meta.url))
const manifest = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8')) as {
  dependencies?: Record<string, string>
  exports?: unknown
  private?: unknown
}

describe('@einfach/excel-worker package boundary', () => {
  it('is a private workspace source package', () => {
    expect(manifest.private).toBe(true)
  })

  it('has only the required exact source exports', () => {
    expect(manifest.exports).toEqual({
      '.': './src/index.ts',
      './wasm-worker-factory': './src/wasm-worker-factory.ts',
    })
  })

  it('depends only on the Rust/WASM worker allowlist', () => {
    expect(manifest.dependencies).toEqual({
      '@einfach/excel-wasm': 'workspace:*',
      '@einfach/spreadsheet-ui-core': 'workspace:*',
    })
  })
})
