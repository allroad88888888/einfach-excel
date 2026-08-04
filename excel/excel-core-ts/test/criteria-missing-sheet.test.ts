/** 条件聚合的整轴稀疏路径必须传播不存在工作表的 #REF!，不能当作空集合。 */
import { describe, expect, test } from '@jest/globals'

import { createWorkbook } from '../src/workbook'
import { keyFor } from '../src/sheet'
import type { Value, Workbook } from '../src/types'

function fixture(): Workbook {
  const wb = createWorkbook([
    { id: 's1', name: 'Sheet1' },
    { id: 's2', name: 'Sheet2' },
  ])
  wb.setCell('s2', 0, 0, '1')
  wb.setCell('s2', 0, 1, '10')
  return wb
}

function read(wb: Workbook, row: number): Value {
  const sheet = wb.sheet('s1')
  if (!sheet) throw new Error('missing Sheet1')
  return wb.store.getter(sheet.formulaCellAtom(keyFor(row, 25)))
}

const CASES = [
  '=COUNTIF(Missing!A:A,">0")',
  '=SUMIF(Missing!A:A,">0",Sheet2!B:B)',
  '=SUMIF(Sheet2!A:A,">0",Missing!B:B)',
  '=AVERAGEIF(Missing!A:A,">0",Sheet2!B:B)',
  '=AVERAGEIF(Sheet2!A:A,">0",Missing!B:B)',
  '=COUNTIFS(Sheet2!A:A,">0",Missing!B:B,">0")',
  '=SUMIFS(Missing!A:A,Sheet2!A:A,">0")',
  '=AVERAGEIFS(Sheet2!B:B,Missing!A:A,">0")',
  '=MAXIFS(Sheet2!B:B,Missing!A:A,">0")',
  '=MINIFS(Missing!B:B,Sheet2!A:A,">0")',
] as const

describe('条件聚合：缺失工作表不静默为空集合', () => {
  test.each(CASES)('%s → #REF!', (formula) => {
    const wb = fixture()
    wb.setCell('s1', 100, 25, formula)
    expect(read(wb, 100)).toMatchObject({ kind: 'error', code: '#REF!' })
  })
})
