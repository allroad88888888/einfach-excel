/**
 * 溢出投影：**公式层读得到投影格**。
 *
 * TS 引擎的投影格是虚的（`A1 = =SEQUENCE(3)` 只在 `cells` 留 A1 一条条目），投影
 * 以前只活在宿主的显示层，公式层完全读不到。于是 `=SUM(A1:A3)` 给 `#CALC!`、
 * `=A2` 给空、`=COUNTA(A1:A3)` 给 1 —— 而 Rust / Excel 给 6 / 2 / 3。
 *
 * 每一条都走 `createWorkbook` + 真实公式路径。**不直接调 `scanSpillAnchors`**：
 * 这一族缺陷的形态就是「单测绿、端到端错」。
 *
 * ── 为什么每个函数都要「区间」与「整列」两种写法 ──
 *
 * `evaluate.ts` 在派发到内建函数表之前把 17 个聚合函数名截走交给
 * `eval/sparse-*.ts`，所以 `=SUM(A1:A3)`（物化）与 `=SUM(A:A)`（稀疏）跑的是
 * **两份不同的实现**。下沉之前它们对同一片数组给的答案就已经不一样了：
 * `SUM(A1:A3)` = `#CALC!`，`SUM(A:A)` = 6 —— 后者「碰巧对」，因为稀疏聚合会把
 * 锚点那一格的数组**摊平**。
 *
 * 下沉之后这里有一个新的翻车方式：锚点被收成左上角标量、投影格又被单独补进
 * 稀疏遍历，两件事叠起来就是**双重投影**（A1 报 1，投影再报 1、2、3 → 7）。
 * 所以下面每一条整列断言都写成**闭式字面量**，不写「两侧相等」—— 后者会被
 * 「两边一起错」满足。
 *
 * 失效那一半（锚点动了读者跟不跟）在兄弟文件 `spill-projection-invalidation.test.ts`。
 */

import { describe, expect, test } from '@jest/globals'

import { createWorkbook } from '../src/workbook'
import { keyFor } from '../src/sheet'
import type { Value } from '../src/types'

const num = (value: number): Value => ({ kind: 'number', value })
const str = (value: string): Value => ({ kind: 'string', value })
const bool = (value: boolean): Value => ({ kind: 'boolean', value })

function makeWorkbook(seed = '=SEQUENCE(3)') {
  const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
  const sheet = wb.sheet('s1')!
  const read = (row: number, col: number): Value =>
    wb.store.getter(sheet.formulaCellAtom(keyFor(row, col)))
  if (seed.length > 0) wb.setCell('s1', 0, 0, seed) // A1 → A1:A3 = 1,2,3
  /** 把公式放进 C 列（离 A 列的溢出区远远的），读它的值。 */
  const evalAt = (row: number, formula: string): Value => {
    wb.setCell('s1', row, 2, formula)
    return read(row, 2)
  }
  return { wb, read, evalAt }
}

describe('spill projection — 单地址读', () => {
  test('=A2 / =A3 读到的是投影值，不是空', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=A2')).toEqual(num(2))
    expect(evalAt(1, '=A3')).toEqual(num(3))
    // 数组之外仍然是空。
    expect(evalAt(2, '=A4')).toEqual({ kind: 'blank' })
  })

  test('=A2+1 参与算术；=A2&"x" 参与拼接；ISNUMBER / ISBLANK 跟着改口', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=A2+1')).toEqual(num(3))
    expect(evalAt(1, '=A2*2')).toEqual(num(4))
    expect(evalAt(2, '=A2&"x"')).toEqual(str('2x'))
    expect(evalAt(3, '=ISNUMBER(A2)')).toEqual(bool(true))
    expect(evalAt(4, '=ISBLANK(A2)')).toEqual(bool(false))
    expect(evalAt(5, '=ISBLANK(A4)')).toEqual(bool(true))
  })

  test('锚点格自己被当作单元格引用读到 = 左上角那个标量', () => {
    const { evalAt } = makeWorkbook()
    // Excel：`=A1+1` 是 2，不是「1,2,3 各加一」广播出来的一片。
    expect(evalAt(0, '=A1+1')).toEqual(num(2))
    expect(evalAt(1, '=ROWS(A1)')).toEqual(num(1))
  })

  test('`A1#` 仍然拿得到整片 —— 折叠只发生在「读成单元格」这一侧', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=SUM(A1#)')).toEqual(num(6))
    expect(evalAt(1, '=ROWS(A1#)')).toEqual(num(3))
    expect(evalAt(2, '=INDEX(A1#,3,1)')).toEqual(num(3))
  })
})

describe('spill projection — 区域物化路径', () => {
  test('SUM / AVERAGE / MIN / MAX / COUNT / COUNTA 的区间形式', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=SUM(A1:A3)')).toEqual(num(6))
    expect(evalAt(1, '=AVERAGE(A1:A3)')).toEqual(num(2))
    expect(evalAt(2, '=MIN(A1:A3)')).toEqual(num(1))
    expect(evalAt(3, '=MAX(A1:A3)')).toEqual(num(3))
    expect(evalAt(4, '=COUNT(A1:A3)')).toEqual(num(3))
    expect(evalAt(5, '=COUNTA(A1:A3)')).toEqual(num(3))
    expect(evalAt(6, '=COUNTBLANK(A1:A5)')).toEqual(num(2))
  })

  test('criteria 族的区间形式', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=COUNTIF(A1:A3,">1")')).toEqual(num(2))
    expect(evalAt(1, '=SUMIF(A1:A3,">1")')).toEqual(num(5))
    expect(evalAt(2, '=AVERAGEIF(A1:A3,">1")')).toEqual(num(2.5))
    expect(evalAt(3, '=COUNTIFS(A1:A3,">1")')).toEqual(num(2))
    expect(evalAt(4, '=SUMIFS(A1:A3,A1:A3,">1")')).toEqual(num(5))
    expect(evalAt(5, '=AVERAGEIFS(A1:A3,A1:A3,">1")')).toEqual(num(2.5))
    expect(evalAt(6, '=MAXIFS(A1:A3,A1:A3,"<3")')).toEqual(num(2))
    expect(evalAt(7, '=MINIFS(A1:A3,A1:A3,">1")')).toEqual(num(2))
  })

  test('SUBTOTAL / AGGREGATE 的区间形式', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=SUBTOTAL(9,A1:A3)')).toEqual(num(6))
    expect(evalAt(1, '=AGGREGATE(9,0,A1:A3)')).toEqual(num(6))
  })

  test('查找 / 定位 / 文本族按位置读到投影值', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=INDEX(A1:A3,2,1)')).toEqual(num(2))
    expect(evalAt(1, '=VLOOKUP(2,A1:A3,1,FALSE)')).toEqual(num(2))
    expect(evalAt(2, '=MATCH(2,A1:A3,0)')).toEqual(num(2))
    expect(evalAt(3, '=OFFSET(A1,1,0)')).toEqual(num(2))
    expect(evalAt(4, '=SUMPRODUCT(A1:A3)')).toEqual(num(6))
    expect(evalAt(5, '=LARGE(A1:A3,1)')).toEqual(num(3))
    // 顺序也要对：投影格与锚点在物化结果里按坐标就位，不是「锚点排最后」。
    expect(evalAt(6, '=CONCAT(A1:A3)')).toEqual(str('123'))
    expect(evalAt(7, '=TEXTJOIN(",",TRUE,A1:A3)')).toEqual(str('1,2,3'))
  })

  test('二维区域：溢出只占一列，另一列仍然是空', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=SUM(A1:B3)')).toEqual(num(6))
    expect(evalAt(1, '=COUNTA(A1:B3)')).toEqual(num(3))
  })

  test('部分覆盖：只框住投影格、不含锚点', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=SUM(A2:A3)')).toEqual(num(5))
    expect(evalAt(1, '=COUNT(A2:A3)')).toEqual(num(2))
  })
})

describe('spill projection — 稀疏（整列）路径没有变成双重投影', () => {
  // 每一条都与上面的区间形式配对：同一片数组、同一个闭式答案。差一个数
  // （SUM 给 7 而不是 6、COUNTA 给 4 而不是 3）就是锚点被数了两遍。
  test('整列无条件聚合', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=SUM(A:A)')).toEqual(num(6))
    expect(evalAt(1, '=COUNT(A:A)')).toEqual(num(3))
    expect(evalAt(2, '=COUNTA(A:A)')).toEqual(num(3))
    expect(evalAt(3, '=AVERAGE(A:A)')).toEqual(num(2))
    expect(evalAt(4, '=MIN(A:A)')).toEqual(num(1))
    expect(evalAt(5, '=MAX(A:A)')).toEqual(num(3))
  })

  test('整列 criteria 族', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=COUNTIF(A:A,">1")')).toEqual(num(2))
    expect(evalAt(1, '=SUMIF(A:A,">1")')).toEqual(num(5))
    expect(evalAt(2, '=AVERAGEIF(A:A,">1")')).toEqual(num(2.5))
    expect(evalAt(3, '=COUNTIFS(A:A,">1")')).toEqual(num(2))
    expect(evalAt(4, '=SUMIFS(A:A,A:A,">1")')).toEqual(num(5))
    expect(evalAt(5, '=AVERAGEIFS(A:A,A:A,">1")')).toEqual(num(2.5))
    expect(evalAt(6, '=MAXIFS(A:A,A:A,"<3")')).toEqual(num(2))
    expect(evalAt(7, '=MINIFS(A:A,A:A,">1")')).toEqual(num(2))
  })

  test('整列 SUBTOTAL / AGGREGATE', () => {
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=SUBTOTAL(9,A:A)')).toEqual(num(6))
    expect(evalAt(1, '=AGGREGATE(9,0,A:A)')).toEqual(num(6))
  })

  test('整列里混着真字面量：投影格与字面量都只报一次', () => {
    const { wb, evalAt } = makeWorkbook()
    wb.setCell('s1', 9, 0, '10') // A10 = 10，在溢出区之外
    // 1+2+3+10；数错的两种形态：13（投影没补进来）、17（锚点被数了两遍）。
    expect(evalAt(0, '=SUM(A:A)')).toEqual(num(16))
    expect(evalAt(1, '=COUNT(A:A)')).toEqual(num(4))
    expect(evalAt(2, '=COUNTA(A:A)')).toEqual(num(4))
  })

  test('整列聚合在超过物化上限的有界区域上同样成立', () => {
    // 20 万格 > MATERIALIZED_RANGE_CELL_CAP，走的也是稀疏路径而不是物化。
    const { evalAt } = makeWorkbook()
    expect(evalAt(0, '=SUM(A1:B100000)')).toEqual(num(6))
    expect(evalAt(1, '=COUNTA(A1:B100000)')).toEqual(num(3))
  })
})

describe('spill projection — 边界', () => {
  test('自有条目遮住投影：溢出区里另有内容时整片收回，不是「一半投影一半字面量」', () => {
    const { wb, read, evalAt } = makeWorkbook()
    wb.setCell('s1', 2, 0, 'x') // A3 占住
    expect(read(0, 0)).toMatchObject({ kind: 'error', code: '#SPILL!' })
    // 锚点是错误值 → 它不再是任何一格的锚点，A2 回到空。
    expect(evalAt(0, '=A2')).toEqual({ kind: 'blank' })
    expect(evalAt(1, '=COUNTA(A1:A3)')).toEqual(num(2)) // 锚点的 #SPILL! + 'x'
  })

  test('回看上限：够不着的锚点不投影', () => {
    const { wb, read } = makeWorkbook('')
    wb.setCell('s1', 0, 0, '=SEQUENCE(400)') // A1:A400，跨过 200 这条线
    wb.setCell('s1', 0, 2, '=A100') // 距锚点 99 行 —— 认
    wb.setCell('s1', 1, 2, '=A300') // 距锚点 299 行 —— 超过 SPILL_PROJECTION_LOOKBACK
    expect(read(0, 2)).toEqual(num(100))
    expect(read(1, 2)).toEqual({ kind: 'blank' })
  })

  test('跨表：另一张表上的投影格也读得到', () => {
    const wb = createWorkbook([
      { id: 's1', name: 'Sheet1' },
      { id: 's2', name: 'Sheet2' },
    ])
    const s1 = wb.sheet('s1')!
    wb.setCell('s2', 0, 0, '=SEQUENCE(3)')
    wb.setCell('s1', 0, 0, '=Sheet2!A2')
    wb.setCell('s1', 1, 0, '=SUM(Sheet2!A1:A3)')
    wb.setCell('s1', 2, 0, '=Sheet2!A1+1')
    expect(wb.store.getter(s1.formulaCellAtom(keyFor(0, 0)))).toEqual(num(2))
    expect(wb.store.getter(s1.formulaCellAtom(keyFor(1, 0)))).toEqual(num(6))
    expect(wb.store.getter(s1.formulaCellAtom(keyFor(2, 0)))).toEqual(num(2))
  })

  test('二维数组的投影：行列都要对得上', () => {
    const { wb, read, evalAt } = makeWorkbook('=SEQUENCE(2,3)') // A1:C2 = 1..6
    expect(read(0, 0)).toMatchObject({ kind: 'array' })
    expect(evalAt(4, '=SUM(A1:C2)')).toEqual(num(21))
    const wb2 = makeWorkbook('=SEQUENCE(2,3)')
    wb2.wb.setCell('s1', 5, 0, '=B2')
    expect(wb2.read(5, 0)).toEqual(num(5))
    wb2.wb.setCell('s1', 6, 0, '=C1')
    expect(wb2.read(6, 0)).toEqual(num(3))
    void wb
  })

  test('setCellValue 直接塞进来的数组锚点同样投影', () => {
    const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
    const sheet = wb.sheet('s1')!
    wb.setCellValue('s1', 0, 0, {
      kind: 'array',
      value: [[num(7)], [num(8)]],
    })
    wb.setCell('s1', 0, 2, '=A2')
    wb.setCell('s1', 1, 2, '=SUM(A1:A2)')
    expect(wb.store.getter(sheet.formulaCellAtom(keyFor(0, 2)))).toEqual(num(8))
    expect(wb.store.getter(sheet.formulaCellAtom(keyFor(1, 2)))).toEqual(num(15))
  })
})
