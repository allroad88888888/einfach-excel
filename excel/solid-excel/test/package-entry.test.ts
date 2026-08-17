import { describe, expect, it, jest } from '@jest/globals'

import * as root from '@einfach/solid-excel'
import * as legacy from '@einfach/solid-excel/legacy'
import * as vNext from '@einfach/solid-excel/vnext'

interface SolidExcelPackageJson {
  name: string
  exports: Record<string, unknown>
}

const packageJson = jest.requireActual(
  '@einfach/solid-excel/package.json',
) as SolidExcelPackageJson

describe('@einfach/solid-excel package entry', () => {
  it('imports the root, vNext, legacy, demos, and package.json public entrypoints', () => {
    expect(packageJson.name).toBe('@einfach/solid-excel')
    // 双形态契约（ADR 0019）：solid 条件给源码，types 给 tsc 声明，
    // import/default 给 babel-preset-solid 预编译的 ESM。
    expect(packageJson.exports['.']).toEqual({
      solid: './src/index.tsx',
      types: './@types/src/index.d.ts',
      import: './esm/src/index.mjs',
      default: './esm/src/index.mjs',
    })
    expect(packageJson.exports['./legacy']).toEqual(packageJson.exports['.'])
    expect(packageJson.exports['./demos']).toEqual({
      solid: './src/demos/index.ts',
      types: './@types/src/demos/index.d.ts',
      import: './esm/src/demos/index.mjs',
      default: './esm/src/demos/index.mjs',
    })
    expect(packageJson.exports['./vnext']).toEqual({
      solid: './src-vnext/public.ts',
      types: './@types/src-vnext/public.d.ts',
      import: './esm/src-vnext/public.mjs',
      default: './esm/src-vnext/public.mjs',
    })
    expect(packageJson.exports['./package.json']).toBe('./package.json')

    expect(typeof root.Table).toBe('function')
    expect(typeof root.createJSSheet).toBe('function')
    expect(typeof root.vNext.SpreadsheetUiProvider).toBe('function')
    expect(typeof root.vNext.SpreadsheetGrid).toBe('function')

    expect(typeof legacy.Table).toBe('function')
    expect(typeof legacy.createJSSheet).toBe('function')
    expect(typeof legacy.vNext.SpreadsheetUiProvider).toBe('function')

    expect(typeof vNext.SpreadsheetUiProvider).toBe('function')
    expect(typeof vNext.SpreadsheetGrid).toBe('function')
    expect(typeof vNext.createStaticSpreadsheetBackend).toBe('function')
    expect(typeof vNext.createWorkerWorkbookSpreadsheetBackend).toBe('function')
  })

  it('keeps public package barrels free of demos and worker URL factories', () => {
    const publicSurfaces = [root, legacy, root.vNext, legacy.vNext, vNext]

    for (const surface of publicSurfaces) {
      expect('App' in surface).toBe(false)
      expect('DemoBlank' in surface).toBe(false)
      expect('DemoFormulas' in surface).toBe(false)
      expect('DemoWorker' in surface).toBe(false)
      expect('VNextSmokeDemo' in surface).toBe(false)
      expect('VNextWorkerDemo' in surface).toBe(false)
      expect('defaultWorkerFactory' in surface).toBe(false)
      expect('defaultWorkbookWorkerFactory' in surface).toBe(false)
      expect('defaultVNextWorkbookWorkerFactory' in surface).toBe(false)
    }
  })
})
