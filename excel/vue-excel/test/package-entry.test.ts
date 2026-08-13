import { describe, expect, it, jest } from '@jest/globals'

import * as packageEntry from '../src/index'

interface VueExcelPackageJson {
  exports: Record<string, unknown>
  name: string
  peerDependencies: Record<string, string>
  private: boolean
}

const packageJson = jest.requireActual('../package.json') as VueExcelPackageJson

describe('@einfach/vue-excel package entry', () => {
  it('keeps the package private while exposing the subscription bridge', () => {
    expect(packageJson.name).toBe('@einfach/vue-excel')
    expect(packageJson.private).toBe(true)
    expect(packageJson.peerDependencies).toEqual({ vue: '>=3.3.0' })
    expect(packageJson.exports['.']).toEqual({
      types: './src/index.ts',
      import: './src/index.ts',
      default: './src/index.ts',
    })
    expect(packageEntry).toEqual({
      useSpreadsheetValue: expect.any(Function),
    })
  })
})
