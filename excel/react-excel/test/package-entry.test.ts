import { describe, expect, it, jest } from '@jest/globals'

import * as packageEntry from '../src/index'

interface ReactExcelPackageJson {
  exports: Record<string, unknown>
  name: string
  peerDependencies: Record<string, string>
  private: boolean
}

const packageJson = jest.requireActual('../package.json') as ReactExcelPackageJson

describe('@einfach/react-excel package entry', () => {
  it('keeps the package private while exposing the React bridges', () => {
    expect(packageJson.name).toBe('@einfach/react-excel')
    expect(packageJson.private).toBe(true)
    expect(packageJson.peerDependencies).toEqual({ react: '>=18.0.0' })
    expect(packageJson.exports['.']).toEqual({
      types: './src/index.ts',
      import: './src/index.ts',
      default: './src/index.ts',
    })
    expect(packageEntry).toEqual({
      SpreadsheetGridView: expect.any(Function),
      SpreadsheetFrozenGridView: expect.any(Function),
      SpreadsheetUiProvider: expect.any(Function),
      getSpreadsheetGridGeometry: expect.any(Function),
      useSpreadsheetUiCore: expect.any(Function),
      useSpreadsheetSelection: expect.any(Function),
      useSpreadsheetValue: expect.any(Function),
      useSpreadsheetViewport: expect.any(Function),
      useSpreadsheetKeyboardNavigation: expect.any(Function),
      useSpreadsheetEditing: expect.any(Function),
      useSpreadsheetImeComposition: expect.any(Function),
      useSpreadsheetFormulaBar: expect.any(Function),
    })
  })
})
