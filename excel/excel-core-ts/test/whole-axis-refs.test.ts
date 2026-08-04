/**
 * 整轴引用（`F:F` / `1:1` / `Sheet2!A:A`）与同数据的有界形态**必须给同一个答案**。
 *
 * 修复前只有约 17 个被 `evaluate.ts` 截走送进 `sparse-*.ts` 的函数能吃整轴，其余
 * 全部拿到 `rangeLookupGeneric` 那道 10 万格闸门吐出来的 `[[#NUM!]]`：
 * `MATCH` 把它当一格没命中答 `#N/A`、`VLOOKUP` 把它当一列答 `#REF!`、
 * `SUMPRODUCT` / `LARGE` / `CORREL` 直接把 `#NUM!` 冒上去。
 *
 * 所以每条都成对写：**整轴一条、有界一条**，两条都是闭式字面量（不写「两侧
 * 相等」—— 那样两边一起错也是绿的）。全部走 `createWorkbook` 的真实公式路径，
 * 不直接调内部函数：稀疏 / 物化两条路正是靠公式路径才分得开。
 */
import { describe, expect, test } from '@jest/globals'

import { createWorkbook } from '../src/workbook'
import { keyFor } from '../src/sheet'
import type { Value, Workbook } from '../src/types'

const num = (value: number): Value => ({ kind: 'number', value })
const str = (value: string): Value => ({ kind: 'string', value })
const err = (code: string): Value => ({ kind: 'error', code } as Value)

function read(wb: Workbook, sheetId: string, row: number, col: number): Value {
  const sheet = wb.sheet(sheetId)
  if (!sheet) throw new Error(`missing sheet ${sheetId}`)
  return wb.store.getter(sheet.formulaCellAtom(keyFor(row, col)))
}

/** 把一批 `[公式, 期望值]` 写进 Z 列逐条求值。行号从 100 起，避开夹具。 */
function expectAll(wb: Workbook, cases: ReadonlyArray<readonly [string, Value]>): void {
  cases.forEach(([formula], i) => wb.setCell('s1', 100 + i, 25, formula))
  cases.forEach(([formula, want], i) => {
    expect([formula, read(wb, 's1', 100 + i, 25)]).toEqual([formula, want])
  })
}

/** Sheet1: F1:F5 = 1..5、G1:G5 = 10..50、H1:H4 = 2,2,3,4。Sheet2 同形放在 A/B。 */
function verticalWorkbook(): Workbook {
  const wb = createWorkbook([
    { id: 's1', name: 'Sheet1' },
    { id: 's2', name: 'Sheet2' },
  ])
  for (let r = 0; r < 5; r += 1) {
    wb.setCell('s1', r, 5, String(r + 1))
    wb.setCell('s1', r, 6, String((r + 1) * 10))
    wb.setCell('s2', r, 0, String(r + 1))
    wb.setCell('s2', r, 1, String((r + 1) * 10))
  }
  const dupes = [2, 2, 3, 4]
  dupes.forEach((v, r) => wb.setCell('s1', r, 7, String(v)))
  return wb
}

describe('整轴引用 —— 定位与查找', () => {
  test('MATCH / XMATCH：整轴与有界同答案', () => {
    expectAll(verticalWorkbook(), [
      ['=MATCH(3,F:F,0)', num(3)],
      ['=MATCH(3,F1:F5,0)', num(3)],
      ['=MATCH(3,F:F,1)', num(3)],
      ['=MATCH(3,F1:F5,1)', num(3)],
      ['=MATCH(3,F:F)', num(3)],
      ['=MATCH(3,F1:F5)', num(3)],
      ['=MATCH(6,F:F,0)', err('#N/A')],
      ['=MATCH(6,F1:F5,0)', err('#N/A')],
      ['=XMATCH(3,F:F)', num(3)],
      ['=XMATCH(3,F1:F5)', num(3)],
      ['=XMATCH(3.5,F:F,1)', num(4)],
      ['=XMATCH(3.5,F1:F5,1)', num(4)],
      // 位置是**矩形内的绝对位置**：整轴从第 1 行起，夹取只砍尾巴不动头。
      ['=MATCH(30,G:G,0)', num(3)],
      ['=MATCH(30,G1:G5,0)', num(3)],
    ])
  })

  test('LOOKUP / VLOOKUP / XLOOKUP：整轴与有界同答案', () => {
    expectAll(verticalWorkbook(), [
      ['=LOOKUP(3,F:F,G:G)', num(30)],
      ['=LOOKUP(3,F1:F5,G1:G5)', num(30)],
      ['=LOOKUP(3,F:G)', num(30)],
      ['=LOOKUP(3,F1:G5)', num(30)],
      ['=VLOOKUP(3,F:G,2,FALSE)', num(30)],
      ['=VLOOKUP(3,F1:G5,2,FALSE)', num(30)],
      ['=VLOOKUP(3,F:G,2,TRUE)', num(30)],
      ['=VLOOKUP(3,F1:G5,2,TRUE)', num(30)],
      ['=XLOOKUP(3,F:F,G:G)', num(30)],
      ['=XLOOKUP(3,F1:F5,G1:G5)', num(30)],
      ['=XLOOKUP(3.5,F:F,G:G,"nf",-1)', num(30)],
      ['=XLOOKUP(3.5,F1:F5,G1:G5,"nf",-1)', num(30)],
      ['=XLOOKUP(99,F:F,G:G,"nf")', str('nf')],
      ['=XLOOKUP(99,F1:F5,G1:G5,"nf")', str('nf')],
    ])
  })

  test('INDEX / OFFSET / INDIRECT：整轴此前就好，别回潮', () => {
    expectAll(verticalWorkbook(), [
      ['=INDEX(F:F,3)', num(3)],
      ['=INDEX(F1:F5,3)', num(3)],
      ['=INDEX(F:G,3,2)', num(30)],
      ['=INDEX(F1:G5,3,2)', num(30)],
      ['=SUM(OFFSET(F:F,0,0,3,1))', num(6)],
      ['=SUM(OFFSET(F1:F5,0,0,3,1))', num(6)],
      ['=MATCH(3,INDIRECT("F:F"),0)', num(3)],
      ['=MATCH(3,INDIRECT("F1:F5"),0)', num(3)],
    ])
  })
})

describe('整轴引用 —— 统计与多区域', () => {
  test('位次 / 分位：LARGE SMALL RANK PERCENTRANK PERCENTILE QUARTILE MEDIAN MODE', () => {
    expectAll(verticalWorkbook(), [
      ['=LARGE(F:F,2)', num(4)],
      ['=LARGE(F1:F5,2)', num(4)],
      ['=SMALL(F:F,2)', num(2)],
      ['=SMALL(F1:F5,2)', num(2)],
      ['=RANK(3,F:F)', num(3)],
      ['=RANK(3,F1:F5)', num(3)],
      ['=RANK.EQ(3,F:F)', num(3)],
      ['=RANK.EQ(3,F1:F5)', num(3)],
      ['=RANK.AVG(3,F:F)', num(3)],
      ['=RANK.AVG(3,F1:F5)', num(3)],
      ['=PERCENTRANK(F:F,3)', num(0.5)],
      ['=PERCENTRANK(F1:F5,3)', num(0.5)],
      ['=PERCENTILE(F:F,0.5)', num(3)],
      ['=PERCENTILE(F1:F5,0.5)', num(3)],
      ['=QUARTILE(F:F,2)', num(3)],
      ['=QUARTILE(F1:F5,2)', num(3)],
      ['=MEDIAN(F:F)', num(3)],
      ['=MEDIAN(F1:F5)', num(3)],
      ['=MODE(H:H)', num(2)],
      ['=MODE(H1:H4)', num(2)],
    ])
  })

  test('多区域：SUMPRODUCT / FREQUENCY / CORREL 一族', () => {
    expectAll(verticalWorkbook(), [
      ['=SUMPRODUCT(F:F,G:G)', num(550)],
      ['=SUMPRODUCT(F1:F5,G1:G5)', num(550)],
      ['=SUMPRODUCT(F:F)', num(15)],
      ['=SUMPRODUCT(F1:F5)', num(15)],
      ['=SUM(FREQUENCY(F:F,G:G))', num(5)],
      ['=SUM(FREQUENCY(F1:F5,G1:G5))', num(5)],
      ['=CORREL(F:F,G:G)', num(1)],
      ['=CORREL(F1:F5,G1:G5)', num(1)],
      ['=COVAR(F:F,G:G)', num(20)],
      ['=COVAR(F1:F5,G1:G5)', num(20)],
      ['=SLOPE(G:G,F:F)', num(10)],
      ['=SLOPE(G1:G5,F1:F5)', num(10)],
      ['=INTERCEPT(G:G,F:F)', num(0)],
      ['=INTERCEPT(G1:G5,F1:F5)', num(0)],
      ['=RSQ(G:G,F:F)', num(1)],
      ['=RSQ(G1:G5,F1:F5)', num(1)],
      ['=SUMX2MY2(F:F,G:G)', num(-5445)],
      ['=SUMX2MY2(F1:F5,G1:G5)', num(-5445)],
      ['=SUMXMY2(F:F,G:G)', num(4455)],
      ['=SUMXMY2(F1:F5,G1:G5)', num(4455)],
      ['=SUMX2PY2(F:F,G:G)', num(5555)],
      ['=SUMX2PY2(F1:F5,G1:G5)', num(5555)],
    ])
  })

  test('数组与文本：SORT UNIQUE TRANSPOSE TEXTJOIN CONCAT CHOOSE', () => {
    expectAll(verticalWorkbook(), [
      ['=SUM(SORT(F:F))', num(15)],
      ['=SUM(SORT(F1:F5))', num(15)],
      ['=SUM(UNIQUE(F:F))', num(15)],
      ['=SUM(UNIQUE(F1:F5))', num(15)],
      ['=SUM(TRANSPOSE(F:F))', num(15)],
      ['=SUM(TRANSPOSE(F1:F5))', num(15)],
      ['=TEXTJOIN(",",TRUE,F:F)', str('1,2,3,4,5')],
      ['=TEXTJOIN(",",TRUE,F1:F5)', str('1,2,3,4,5')],
      ['=CONCAT(F:F)', str('12345')],
      ['=CONCAT(F1:F5)', str('12345')],
      ['=SUM(CHOOSE(2,F:F,G:G))', num(150)],
      ['=SUM(CHOOSE(2,F1:F5,G1:G5))', num(150)],
    ])
  })

  test('跨表整轴与同表整轴同一条口径', () => {
    expectAll(verticalWorkbook(), [
      ['=MATCH(3,Sheet2!A:A,0)', num(3)],
      ['=MATCH(3,Sheet2!A1:A5,0)', num(3)],
      ['=LOOKUP(3,Sheet2!A:A,Sheet2!B:B)', num(30)],
      ['=LOOKUP(3,Sheet2!A1:A5,Sheet2!B1:B5)', num(30)],
      ['=SUMPRODUCT(Sheet2!A:A,Sheet2!B:B)', num(550)],
      ['=SUMPRODUCT(Sheet2!A1:A5,Sheet2!B1:B5)', num(550)],
      ['=LARGE(Sheet2!A:A,2)', num(4)],
      ['=LARGE(Sheet2!A1:A5,2)', num(4)],
    ])
  })
})

describe('整轴引用 —— 整行形态', () => {
  test('整行与有界同答案（含超过 10 万格的多行整轴）', () => {
    // A1:E1 = 1..5、A2:E2 = 10..50。
    const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
    for (let c = 0; c < 5; c += 1) {
      wb.setCell('s1', 0, c, String(c + 1))
      wb.setCell('s1', 1, c, String((c + 1) * 10))
    }
    expectAll(wb, [
      ['=MATCH(3,1:1,0)', num(3)],
      ['=MATCH(3,A1:E1,0)', num(3)],
      ['=HLOOKUP(3,1:2,2,FALSE)', num(30)],
      ['=HLOOKUP(3,A1:E2,2,FALSE)', num(30)],
      ['=LOOKUP(3,1:1,2:2)', num(30)],
      ['=LOOKUP(3,A1:E1,A2:E2)', num(30)],
      // `1:8` 是 8 × 16384 = 131072 格 —— 修复前撞闸门。
      ['=SUMPRODUCT(1:8,1:8)', num(5555)],
      ['=SUMPRODUCT(A1:E8,A1:E8)', num(5555)],
    ])
  })
})

describe('整轴引用 —— 夹取不许越界的那几条', () => {
  test('矩形基数仍是 Excel 网格尺寸，不是夹取后的尺寸', () => {
    expectAll(verticalWorkbook(), [
      ['=ROWS(F:F)', num(1048576)],
      ['=COLUMNS(F:F)', num(1)],
      ['=ROWS(1:1)', num(1)],
      ['=COLUMNS(1:1)', num(16384)],
      ['=COUNTBLANK(F:F)', num(1048571)],
      ['=COUNTA(F:F)', num(5)],
      ['=SUM(F:F)', num(15)],
    ])
  })

  test('溢出投影不被夹掉 —— 锚点是列里唯一有自有条目的格子', () => {
    const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
    wb.setCell('s1', 0, 5, '=SEQUENCE(20)')
    expectAll(wb, [
      ['=MATCH(17,F:F,0)', num(17)],
      ['=MATCH(17,F1:F20,0)', num(17)],
      ['=LARGE(F:F,1)', num(20)],
      ['=LARGE(F1:F20,1)', num(20)],
      ['=SUMPRODUCT(F:F)', num(210)],
      ['=SUMPRODUCT(F1:F20)', num(210)],
    ])
  })

  test('空表整轴不炸', () => {
    expectAll(createWorkbook([{ id: 's1', name: 'Sheet1' }]), [
      ['=MATCH(3,F:F,0)', err('#N/A')],
      ['=SUMPRODUCT(F:F,G:G)', num(0)],
      ['=SUM(F:F)', num(0)],
    ])
  })

  // 「夹完仍越界 → 闸门照旧拦下」搬去了 `range-materialization-gate.test.ts`：
  // 那问的是闸门本身（多大拒绝、拒绝长什么样），不是「整轴与有界同答案」。
})

describe('有序查找里空格不参与排序', () => {
  test('尾部空格 —— 有界形态此前就错（与整轴无关）', () => {
    const wb = verticalWorkbook()
    expectAll(wb, [
      // 修复前 `LOOKUP` 取「最后一个 ≤ 3 的位置」，空格按 0 参与比较 → 落在
      // F6:F10 的空尾巴上，答空。
      ['=LOOKUP(3,F1:F10,G1:G10)', num(30)],
      ['=LOOKUP(3,F1:F5,G1:G5)', num(30)],
      ['=VLOOKUP(3,F1:G10,2,TRUE)', num(30)],
      ['=VLOOKUP(3,F1:G5,2,TRUE)', num(30)],
      ['=MATCH(3,F1:F10,1)', num(3)],
      ['=MATCH(3,F1:F5,1)', num(3)],
      // 空格被压掉之后二分与线性看到同一个向量：档位方向与数据方向不符时
      // 两条路也不会再分叉（`match_type=-1` 喂升序数据）。
      ['=MATCH(3,F1:F10,-1)', num(5)],
      ['=MATCH(3,F1:F5,-1)', num(5)],
      ['=MATCH(3,F:F,-1)', num(5)],
    ])
  })
})
