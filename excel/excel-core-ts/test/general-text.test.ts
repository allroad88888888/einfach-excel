/**
 * Excel「General」转文本规格的 TS 侧钉子。
 *
 * 期望值一律写字面量，且与 Rust 侧 `excel/rust/excel-core/tests/
 * general_text_parity.rs` **逐行对应** —— 两侧断言同一张表，才能证明它们不是
 * 「一起错得一样」。表的来源见 Rust 侧文件头（Apache POI 从 Excel 实测抄回的
 * 对照表）。
 *
 * 后半段用真实的 parse + evaluate 证明 `&` / `LEN` / `T` / `CONCAT` 确实都落在
 * `coerce.toString` 这一个点上 —— 单点是这条规格的前提，散开写就会退化成
 * 「两份实现必须同判」。
 */

import { describe, expect, test } from '@jest/globals'

import { excelGeneralToText } from '../src/eval/general-text'
import { toString as valueToString } from '../src/eval/coerce'
import { evaluate, refLookupGeneric, rangeLookupGeneric } from '../src/eval/evaluate'
import { parseFormula } from '../src/parser'
import type { Cell, CellKey, EvalContext, Value } from '../src/types'

function makeCtx(cells: ReadonlyMap<CellKey, Cell>): EvalContext {
  const ctx: EvalContext = {
    cells,
    currentlyEvaluating: new Set(),
    refLookup: (a1) => refLookupGeneric(a1, cells, ctx),
    rangeLookup: (start, end) => rangeLookupGeneric(start, end, cells, ctx),
    crossSheetCells: () => undefined,
    callCustom: () => undefined,
    resolveName: () => undefined,
  }
  return ctx
}

/** `=FORMULA` → 求值结果。 */
function run(formula: string): Value {
  return evaluate(parseFormula(formula), makeCtx(new Map()))
}

/**
 * 从 Excel 实测抄回的对照行：`[输入, Excel 给的文本]`。与 Rust 侧
 * `EXCEL_OBSERVED` 同表同序。每一行钉的分歧点见 Rust 侧注释。
 */
const EXCEL_OBSERVED: ReadonlyArray<readonly [input: number, expected: string]> = [
  [1.2345678901234567e7, '12345678.9012346'],
  [1.2345678901234568e13, '12345678901234.6'],
  [1.2345678901234567e14, '123456789012346'],
  [1.2345678901234568e15, '1234567890123460'],
  [1.2345678901234567e19, '12345678901234600000'],
  [1.2345678901234568e20, '1.23456789012346E+20'],
  [9.999999999999999e20, '1E+21'],
  [2.0e50, '2E+50'],
  [1.2345678901234577e99, '1.2345678901235E+99'],
  [1.2345678901234576e100, '1.2345678901235E+100'],
  [1.2345678901234567e-4, '0.000123456789012346'],
  [1.2345678901234568e-5, '1.23456789012346E-05'],
  [5.67890123456e-8, '5.67890123456E-08'],
]

describe('excelGeneralToText — Excel 实测对照', () => {
  test.each(EXCEL_OBSERVED)('%p → %p', (input, expected) => {
    expect(excelGeneralToText(input)).toBe(expected)
  })
})

describe('excelGeneralToText — 门槛的确切位置', () => {
  // 整十次幂最能暴露门槛：有效位恒为 1，长度完全由指数决定。
  test('大数：指数 19 仍是普通写法（正好 20 字符），20 才转科学计数', () => {
    expect(excelGeneralToText(1e14)).toBe('100000000000000')
    expect(excelGeneralToText(1e15)).toBe('1000000000000000')
    expect(excelGeneralToText(1e19)).toBe('10000000000000000000')
    expect(excelGeneralToText(1e20)).toBe('1E+20')
    expect(excelGeneralToText(1e21)).toBe('1E+21')
  })

  test('小数：普通写法到 1e-18 正好 20 字符，1e-19 才越预算', () => {
    expect(excelGeneralToText(1e-4)).toBe('0.0001')
    expect(excelGeneralToText(1e-7)).toBe('0.0000001')
    expect(excelGeneralToText(1e-18)).toBe('0.000000000000000001')
    expect(excelGeneralToText(1e-19)).toBe('1E-19')
  })
})

/**
 * 18 位有效数字，f64 存不下（实际落在 `123456789012345680`）。**这里的精度丢失
 * 正是被测对象**，不是笔误：Excel 只保留 15 位，所以它渲染成 `123456789012346000`。
 * 不能改写成 `1.23456789012346e17` 之类「不丢精度」的等价写法 —— 那个字面量本身
 * 就已经是 15 位的结果，用例会退化成同义反复，再也证明不了截断发生过。
 */
// eslint-disable-next-line @typescript-eslint/no-loss-of-precision
const EIGHTEEN_SIGNIFICANT_DIGITS = 123456789012345678

describe('excelGeneralToText — 形状', () => {
  test('15 位有效数字是硬上限，超出的位收掉再补零', () => {
    expect(excelGeneralToText(EIGHTEEN_SIGNIFICANT_DIGITS)).toBe('123456789012346000')
    expect(excelGeneralToText(EIGHTEEN_SIGNIFICANT_DIGITS)).toHaveLength(18)
    expect(excelGeneralToText(1 / 3)).toBe('0.333333333333333')
    expect(excelGeneralToText(2 / 3)).toBe('0.666666666666667')
  })

  test('收位顺带抹掉二进制噪声，尾随零先剪再计位数', () => {
    expect(excelGeneralToText(0.1 + 0.2)).toBe('0.3')
    expect(excelGeneralToText(1.005 * 100)).toBe('100.5')
    expect(excelGeneralToText(0.5)).toBe('0.5')
  })

  test('指数带符号且至少两位；零、负零、负数', () => {
    expect(excelGeneralToText(-1e21)).toBe('-1E+21')
    expect(excelGeneralToText(-1.5e-20)).toBe('-1.5E-20')
    expect(excelGeneralToText(1e-100)).toBe('1E-100')
    expect(excelGeneralToText(0)).toBe('0')
    expect(excelGeneralToText(-0)).toBe('0')
    expect(excelGeneralToText(-1)).toBe('-1')
    expect(excelGeneralToText(1234.5)).toBe('1234.5')
  })

  test('全 9 进位把数量级抬上去，而不是留下 10.000…', () => {
    expect(excelGeneralToText(0.9999999999999999)).toBe('1')
    expect(excelGeneralToText(9.999999999999999e20)).toBe('1E+21')
  })

  /**
   * 第 16 位恰好是「5 且后面没有了」的精确平局。这里必须是 half-up：JS 的
   * `toExponential(14)` 恰好也是 half-up，但 Rust 的 `{:.14e}` 是 half-even，
   * 会收成 `1234567890123440`。两侧都不走定点格式化、各自实现 half-up，才让
   * 这一行在两个引擎上是同一个答案。
   */
  test('第 16 位的精确平局按 half-up 收', () => {
    expect(excelGeneralToText(1234567890123445)).toBe('1234567890123450')
    // 对照：15 位有效数字但 16 个字符，小数点不占有效位。
    expect(excelGeneralToText(12345678901234.5)).toBe('12345678901234.5')
  })
})

describe('这条规格只有一个调用点', () => {
  test('coerce.toString 走的是 General 规格，不是 String(n)', () => {
    expect(valueToString({ kind: 'number', value: 1e21 })).toEqual({ ok: true, value: '1E+21' })
    expect(valueToString({ kind: 'number', value: 1e-7 })).toEqual({
      ok: true,
      value: '0.0000001',
    })
    // 非数字分支不受影响。
    expect(valueToString({ kind: 'string', value: '1e+21' })).toEqual({
      ok: true,
      value: '1e+21',
    })
    expect(valueToString({ kind: 'blank' })).toEqual({ ok: true, value: '' })
    expect(valueToString({ kind: 'boolean', value: true })).toEqual({ ok: true, value: 'TRUE' })
  })

  test('& / LEN / T / CONCAT 全部复用同一条规格', () => {
    expect(run('=10^21&""')).toEqual({ kind: 'string', value: '1E+21' })
    expect(run('=LEN(10^21)')).toEqual({ kind: 'number', value: 5 })
    // 前一轮排查猜的是 5（`"1E-07"`）—— Excel 其实给的是普通写法，共 9 个字符。
    expect(run('=10^-7&""')).toEqual({ kind: 'string', value: '0.0000001' })
    expect(run('=LEN(10^-7)')).toEqual({ kind: 'number', value: 9 })
    expect(run('=LEN(123456789012345678)')).toEqual({ kind: 'number', value: 18 })
    expect(run('=T(1e21&"")')).toEqual({ kind: 'string', value: '1E+21' })
    expect(run('=CONCAT(0.1+0.2,"|",1e20)')).toEqual({ kind: 'string', value: '0.3|1E+20' })
    expect(run('=0.5&""')).toEqual({ kind: 'string', value: '0.5' })
  })
})
