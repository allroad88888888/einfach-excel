import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from '@jest/globals'
import { createWorkerWorkbookSpreadsheetBackend } from '../src/rust-worker'

const RUST_WORKER_ROOT = join(process.cwd(), 'excel/spreadsheet-ui-core/src/rust-worker')

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : entry.endsWith('.ts')
        ? [path]
        : []
  })
}

describe('Rust Worker ownership boundary', () => {
  test('publishes the framework-neutral backend factory', () => {
    expect(typeof createWorkerWorkbookSpreadsheetBackend).toBe('function')
  })

  test('depends on Rust/WASM and UI-core contracts without importing framework runtimes', () => {
    const forbiddenImport =
      /from ['"](?:solid-js|react|@einfach\/solid|@einfach\/react|@einfach\/excel-core-ts)(?:\/[^'"]*)?['"]/
    const offenders = sourceFiles(RUST_WORKER_ROOT).flatMap((path) =>
      forbiddenImport.test(readFileSync(path, 'utf8')) ? [path] : [],
    )

    expect(offenders).toEqual([])
  })

  test('keeps the package root free of side-effectful Worker exports', () => {
    const root = readFileSync(
      join(process.cwd(), 'excel/spreadsheet-ui-core/src/index.ts'),
      'utf8',
    )

    expect(root).not.toContain("from './rust-worker")
    expect(root).not.toContain('worker-runtime')
  })
})
