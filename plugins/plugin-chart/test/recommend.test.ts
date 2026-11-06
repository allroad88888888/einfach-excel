import { describe, expect, test } from 'vitest'
import { detectChartLayout, type ChartCell, type ChartGrid } from '../src/core/series-layout'
import { recommendChart } from '../src/core/recommend'

/** 字符串为文字格，数字为数字格，空串为空格。 */
const table = (rows: (string | number)[][]): ChartGrid => rows.map((row) => row.map((value):
  ChartCell => typeof value === 'number' ? { display: String(value), value, kind: 'number' }
    : value === '' ? { display: '', value: null, kind: 'blank' }
      : { display: value, value: null, kind: 'string' }))

/** 与 Excel 插入图表时一样：先猜布局，再推荐。 */
const recommend = (rows: (string | number)[][]) => {
  const grid = table(rows)
  return recommendChart(grid, detectChartLayout(grid))
}

const range = (count: number, make: (index: number) => (string | number)[]) =>
  Array.from({ length: count }, (_, index) => make(index))

describe('recommendChart: pie', () => {
  test('one series of 2-8 positive values is a pie, layout passed through', () => {
    const result = recommend([['Name', 'Share'], ['a', 3], ['b', 5]])
    expect(result.type).toBe('pie')
    expect(result.layout).toEqual({ seriesIn: 'columns', headerRow: true, headerCol: true })
  })

  test('eight values still make a pie', () => {
    const rows = [['Name', 'Share'], ...range(8, (index) => [`c${index}`, index + 1])]
    expect(recommend(rows).type).toBe('pie')
  })

  test('nine values are too many slices for a pie', () => {
    const rows = [['Name', 'Share'], ...range(9, (index) => [`c${index}`, index + 1])]
    expect(recommend(rows).type).toBe('column')
  })

  test('a zero, negative or empty value rules out a pie', () => {
    expect(recommend([['Name', 'Share'], ['a', 0], ['b', 5]]).type).toBe('column')
    expect(recommend([['Name', 'Share'], ['a', -1], ['b', 5]]).type).toBe('column')
    expect(recommend([['Name', 'Share'], ['a', ''], ['b', 5]]).type).toBe('column')
  })

  test('a single value is not a pie', () => {
    expect(recommend([['Name', 'Share'], ['a', 3]]).type).toBe('column')
  })

  test('two or more series are never a pie', () => {
    expect(recommend([['Name', 'A', 'B'], ['a', 1, 2], ['b', 3, 4]]).type).toBe('column')
  })
})

describe('recommendChart: scatter', () => {
  test('two numeric columns with no headers become a scatter with the first column as X', () => {
    const result = recommend([[1, 2], [3, 4], [5, 6]])
    expect(result.type).toBe('scatter')
    expect(result.layout).toEqual({ seriesIn: 'columns', headerRow: false, headerCol: true })
  })

  test('two numeric columns under a text header are a scatter too', () => {
    const result = recommend([['X', 'Y'], [1, 2], [3, 4], [5, 6]])
    expect(result.type).toBe('scatter')
    expect(result.layout).toEqual({ seriesIn: 'columns', headerRow: true, headerCol: true })
  })

  test('text categories in the first column are not a scatter', () => {
    expect(recommend([['Name', 'A', 'B'], ['a', 1, 2], ['b', 3, 4]]).type).toBe('column')
  })

  test('three numeric columns are not a scatter', () => {
    expect(recommend([[1, 2, 3], [4, 5, 6], [7, 8, 9]]).type).toBe('column')
  })
})

describe('recommendChart: line for long category axes', () => {
  test('more than 12 categories recommend a line chart', () => {
    const rows = [['Name', 'A', 'B'], ...range(13, (index) => [`c${index}`, index, index])]
    expect(recommend(rows).type).toBe('line')
  })

  test('exactly 12 categories stay a column chart', () => {
    const rows = [['Name', 'A', 'B'], ...range(12, (index) => [`c${index}`, index, index])]
    expect(recommend(rows).type).toBe('column')
  })

  test('a single long series is a line too, since it is not a pie', () => {
    const rows = [['Name', 'A'], ...range(13, (index) => [`c${index}`, index + 1])]
    expect(recommend(rows).type).toBe('line')
  })
})
