import { describe, expect, test } from 'vitest'
import { cellRanges, pointCell, sourceRoles, sourceTable } from '../src/core/source-cells'
import { DEFAULT_CHART_SPEC, type ChartSpec } from '../src/core/spec'

const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({ ...DEFAULT_CHART_SPEC, ...over })
const at = (sheetId: string, row: number, col: number) => ({ sheetId, row, col })
// B2:D5：首行是系列名，首列是类别，三个类别两个系列。
const area = { startRow: 1, startCol: 1, endRow: 4, endCol: 3 }

describe('a data point leads back to its cell', () => {
  test('series in columns', () => {
    const table = sourceTable([area], 'main', spec())!
    expect(pointCell(table, spec(), 0, 0)).toEqual(at('main', 2, 2))
    expect(pointCell(table, spec(), 1, 2)).toEqual(at('main', 4, 3))
    expect(pointCell(table, spec(), 2, 0)).toBeNull()
  })

  test('series in rows swap the roles of the header row and column', () => {
    const rows = spec({ seriesIn: 'rows' })
    const table = sourceTable([area], 'main', rows)!
    // 按行：第 0 个系列是第 3 行（行 2），第 1 个类别是 D 列（列 3）。
    expect(pointCell(table, rows, 0, 1)).toEqual(at('main', 2, 3))
  })

  test('hidden rows are skipped like the chart skips them', () => {
    const table = sourceTable([area], 'main', spec(), { rows: [1], cols: [] })!
    // 区域内第 1 行（工作表行 2）隐藏：第 0 个类别变成工作表行 3。
    expect(pointCell(table, spec(), 0, 0)).toEqual(at('main', 3, 2))
  })

  test('joined areas and other sheets keep their own coordinates', () => {
    const left = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 }
    const right = { startRow: 10, startCol: 5, endRow: 12, endCol: 5, sheetId: 'data' }
    const table = sourceTable([left, right], 'main', spec())!
    expect(pointCell(table, spec(), 0, 1)).toEqual(at('data', 12, 5))
  })

  test('areas that do not line up have no table', () => {
    expect(sourceTable([area, { startRow: 0, startCol: 9, endRow: 1, endCol: 10 }], 'main',
      spec())).toBeNull()
  })
})

describe('source roles become highlight rectangles', () => {
  test('names, categories and values, like Excel’s range colours', () => {
    const roles = sourceRoles(sourceTable([area], 'main', spec())!, spec())
    expect(cellRanges(roles.names)).toEqual(
      [{ sheetId: 'main', range: { rowStart: 1, rowEnd: 1, colStart: 2, colEnd: 3 } }])
    expect(cellRanges(roles.categories)).toEqual(
      [{ sheetId: 'main', range: { rowStart: 2, rowEnd: 4, colStart: 1, colEnd: 1 } }])
    expect(cellRanges(roles.values)).toEqual(
      [{ sheetId: 'main', range: { rowStart: 2, rowEnd: 4, colStart: 2, colEnd: 3 } }])
  })

  test('scattered cells merge into as few rectangles as possible', () => {
    expect(cellRanges([at('a', 0, 0), at('a', 0, 1), at('a', 1, 0), at('a', 1, 1),
      at('a', 3, 0), at('b', 0, 0)])).toEqual([
      { sheetId: 'a', range: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 } },
      { sheetId: 'a', range: { rowStart: 3, rowEnd: 3, colStart: 0, colEnd: 0 } },
      { sheetId: 'b', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } },
    ])
  })
})
