import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import * as i18n from '../src/i18n'
import * as legacy from '../legacy'
import * as root from '../src'
import * as vNext from '../src/public'

interface SolidExcelPackageJson {
  name: string
  main: string
  types: string
  exports: Record<string, unknown>
}

const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'),
) as SolidExcelPackageJson

describe('@einfach/solid-excel package entry', () => {
  it('maps root to the current API and keeps legacy isolated', () => {
    expect(packageJson.name).toBe('@einfach/solid-excel')
    expect(packageJson.main).toBe('./esm/src/index.mjs')
    expect(packageJson.types).toBe('./@types/src/index.d.ts')
    expect(packageJson.exports['.']).toEqual({
      solid: './src/index.ts',
      types: './@types/src/index.d.ts',
      import: './esm/src/index.mjs',
      default: './esm/src/index.mjs',
    })
    expect(packageJson.exports['./vnext']).toEqual({
      solid: './src/public.ts',
      types: './@types/src/public.d.ts',
      import: './esm/src/public.mjs',
      default: './esm/src/public.mjs',
    })
    expect(packageJson.exports['./legacy']).toEqual({
      solid: './legacy/index.tsx',
      types: './@types/legacy/index.d.ts',
      import: './esm/legacy/index.mjs',
      default: './esm/legacy/index.mjs',
    })
    expect(typeof root.SpreadsheetUiProvider).toBe('function')
    expect(typeof root.SpreadsheetGrid).toBe('function')
    expect(typeof vNext.SpreadsheetUiProvider).toBe('function')
    expect(typeof legacy.Table).toBe('function')
    expect('Table' in root).toBe(false)
    expect('vNext' in root).toBe(false)
  })

  it('maps demos and i18n to the current source tree', () => {
    expect(packageJson.exports['./demos']).toEqual({
      solid: './src/demos/index.ts',
      types: './@types/src/demos/index.d.ts',
      import: './esm/src/demos/index.mjs',
      default: './esm/src/demos/index.mjs',
    })
    expect(packageJson.exports['./i18n']).toEqual({
      solid: './src/i18n/index.ts',
      types: './@types/src/i18n/index.d.ts',
      import: './esm/src/i18n/index.mjs',
      default: './esm/src/i18n/index.mjs',
    })
    expect(Object.keys(i18n).length).toBeGreaterThan(0)
    expect(packageJson.exports['./package.json']).toBe('./package.json')
  })

  it('keeps root and vnext free of demos and worker URL factories', () => {
    for (const surface of [root, vNext]) {
      expect('VNextSmokeDemo' in surface).toBe(false)
      expect('WorkerWorkbookHost' in surface).toBe(false)
      expect('defaultWorkerFactory' in surface).toBe(false)
      expect('defaultWorkbookWorkerFactory' in surface).toBe(false)
      expect('defaultVNextWorkbookWorkerFactory' in surface).toBe(false)
    }
  })
})
