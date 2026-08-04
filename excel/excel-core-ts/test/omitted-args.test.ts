/**
 * 实参列表里的**空占位**（`=XLOOKUP(3,F1:F5,G1:G5,,-1)` 里那个 `,,`）。
 *
 * ── 根因在解析层 ──
 *
 * 修之前 `parseArgList` 直接把每个槽位丢给 `parseExpr`，空槽位没有 token，
 * `parseAtom` 拿 `comma` / `rparen` 撞 default 分支抛 `unexpected token`，整条
 * 公式变 `#VALUE!`。所以这**不是** XLOOKUP 的问题 —— `=SUM(1,,2)`、
 * `=IF(TRUE,,5)`、`=AGGREGATE(9,,F1:F5)` 一起全灭，与整轴 / 有界无关。
 *
 * 现在空槽位解析成 `OmittedExpr`，求值成 `BLANK` —— Excel 的语义就是「传了个
 * 空值」，不是「这个参数不存在」，各函数对空值原有的处理照旧生效。
 *
 * ── 这里钉什么 ──
 *
 * 每条都写闭式期望值。分三组：
 *  1. 解析层：能不能算出来（这是本次修的东西）；
 *  2. 语义层：空占位取到的确实是默认值 / 空值；
 *  3. 仍与 Excel 有出入的残留（另有根因，注明，别当成本文件的契约）。
 */
import { describe, expect, test } from '@jest/globals'

import { createWorkbook } from '../src/workbook'
import { keyFor } from '../src/sheet'
import { parseFormula } from '../src/parser'
import type { Value, Workbook } from '../src/types'

const num = (value: number): Value => ({ kind: 'number', value })
const str = (value: string): Value => ({ kind: 'string', value })
const err = (code: string): Value =>
  expect.objectContaining({ kind: 'error', code }) as unknown as Value
const arr = (value: Value[][]): Value => ({ kind: 'array', value })

/** F1:F5 = 1..5、G1:G5 = 10..50。 */
function fixture(): Workbook {
  const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
  for (let r = 0; r < 5; r += 1) {
    wb.setCell('s1', r, 5, String(r + 1))
    wb.setCell('s1', r, 6, String((r + 1) * 10))
  }
  return wb
}

function read(wb: Workbook, row: number): Value {
  const sheet = wb.sheet('s1')
  if (!sheet) throw new Error('missing sheet s1')
  return wb.store.getter(sheet.formulaCellAtom(keyFor(row, 25)))
}

/**
 * 逐条求值。行距 20 是给会溢出的数组结果留位置 —— 挨着写会互相撞成 `#SPILL!`，
 * 那是溢出闸门在说话，不是空占位的问题。
 */
function expectAll(cases: ReadonlyArray<readonly [string, Value]>): void {
  const wb = fixture()
  cases.forEach(([formula], i) => wb.setCell('s1', 100 + i * 20, 25, formula))
  cases.forEach(([formula, want], i) => {
    expect([formula, read(wb, 100 + i * 20)]).toEqual([formula, want])
  })
}

describe('空占位实参：解析层', () => {
  test('空槽位解析成 omitted，不是解析错误', () => {
    const ast = parseFormula('=XLOOKUP(3,F1:F5,G1:G5,,-1)')
    expect(ast.kind).toBe('call')
    if (ast.kind !== 'call') throw new Error('unreachable')
    expect(ast.args.map((a) => a.kind)).toEqual(['number', 'range', 'range', 'omitted', 'unary'])
  })

  test('末尾空占位同样成立', () => {
    const ast = parseFormula('=SUM(1,)')
    if (ast.kind !== 'call') throw new Error('unreachable')
    expect(ast.args.map((a) => a.kind)).toEqual(['number', 'omitted'])
  })

  test('数组字面量与多区域里不接受空槽 —— 与 Excel 一致', () => {
    // `parseFormula` 把解析错误折成 `#VALUE!` 字面量，不抛。
    expect(parseFormula('={1,,2}')).toEqual({ kind: 'error', code: '#VALUE!' })
    expect(parseFormula('=AREAS((F1:F5,))')).toEqual({ kind: 'error', code: '#VALUE!' })
  })
})

describe('空占位实参：报的这一条', () => {
  test('XLOOKUP 省略 if_not_found 同时给 match_mode', () => {
    expectAll([
      ['=XLOOKUP(3,F1:F5,G1:G5,,-1)', num(30)],
      // 有界形态与整轴形态同答案 —— 这条缺陷与稀疏 / 物化无关。
      ['=XLOOKUP(3,F:F,G:G,,-1)', num(30)],
      ['=XLOOKUP(3,F1:F5,G1:G5,,,-1)', num(30)],
      ['=XLOOKUP(3,F1:F5,G1:G5,)', num(30)],
      // 空的 if_not_found 等同「没提供」⇒ 找不到给 #N/A，不是空值。
      ['=XLOOKUP(0,F1:F5,G1:G5,,-1)', err('#N/A')],
      ['=XLOOKUP(0,F1:F5,G1:G5,"nf",-1)', str('nf')],
    ])
  })
})

describe('空占位实参：取到的是默认值 / 空值', () => {
  test('聚合与数值函数', () => {
    expectAll([
      ['=SUM(1,,2)', num(3)],
      ['=SUM(,)', num(0)],
      ['=CONCAT(1,,2)', str('12')],
      ['=TEXTJOIN(",",,1,2)', str('1,2')],
      ['=ROUND(3.14159,)', num(3)],
      // AGGREGATE 的 options 空 ⇒ 0（不忽略任何东西）。
      ['=AGGREGATE(9,,F1:F5)', num(15)],
      // 空占位是 1×1 空值；SUMPRODUCT 不会把它广播到 5 行。
      ['=SUMPRODUCT(F1:F5,)', err('#VALUE!')],
      // WEEKDAY 的空 return_type 在数值语境下是 0，落入非法取值域。
      ['=WEEKDAY(45000,)', err('#NUM!')],
    ])
  })

  test('查找家族', () => {
    expectAll([
      ['=VLOOKUP(3,F1:G5,2,)', num(30)],
      ['=HLOOKUP(1,F1:G5,2,)', num(2)],
      ['=MATCH(3,F1:F5,)', num(3)],
      ['=XMATCH(3,F1:F5,)', num(3)],
      ['=OFFSET(F1,1,)', num(2)],
      ['=OFFSET(F1,,1)', num(10)],
    ])
  })

  test('动态数组家族：省略中间参数取默认值，不是强转 0', () => {
    expectAll([
      // `SORT(区域,,-1)` 是 Excel 里最常见的降序写法：sort_index 空 ⇒ 1。
      // 强转 0 会撞上「必须 ≥ 1」的校验判成 #VALUE!。
      ['=SORT(F1:F5,,-1)', arr([[num(5)], [num(4)], [num(3)], [num(2)], [num(1)]])],
      ['=SEQUENCE(2,,)', arr([[num(1)], [num(2)]])],
      ['=FILTER(F1:F5,F1:F5>3,)', arr([[num(4)], [num(5)]])],
      // INDEX 的空 column_num 强转 0，返回该行的整个区域。
      ['=INDEX(F1:G5,2,)', arr([[num(2), num(20)]])],
      // TEXTSPLIT 的 ignore_empty 空 ⇒ FALSE（空片段保留）。
      ['=TEXTSPLIT("a,,b",",",,)', arr([[str('a'), str(''), str('b')]])],
      ['=TEXTSPLIT("a,,b",",",,TRUE)', arr([[str('a'), str('b')]])],
    ])
  })
})

describe('空占位实参：数值聚合跳过空值', () => {
  test('空槽位与空单元格引用都不参与 AVERAGE、PRODUCT、MIN', () => {
    expectAll([
      ['=AVERAGE(1,,3)', num(2)],
      ['=AVERAGE(1,Z99,3)', num(2)],
      ['=PRODUCT(2,,3)', num(6)],
      ['=PRODUCT(2,Z99,3)', num(6)],
      ['=MIN(1,,5)', num(1)],
      ['=MIN(1,Z99,5)', num(1)],
    ])
  })
})

describe('空占位实参：残留分歧（另有根因，此处只钉现状）', () => {
  /**
   * Excel 里 `=IF(TRUE,,5)` 显示 0。本引擎给 `blank`。
   *
   * 这不是空占位的问题：`=IF(TRUE,Z99,5)`（Z99 是空格）在本引擎里同样给 blank，
   * 而 Excel 同样显示 0 —— 根因是「公式结果为空值时按 0 呈现」这条**显示层**
   * 约定，改它要动的是显示口径而不是解析或求值。
   */
  test('结果为空值时不折成 0', () => {
    expectAll([
      ['=IF(TRUE,,5)', { kind: 'blank' }],
      ['=IFERROR(1/0,)', { kind: 'blank' }],
      ['=CHOOSE(2,1,,3)', { kind: 'blank' }],
    ])
  })
})
