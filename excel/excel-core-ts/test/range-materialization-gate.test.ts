/**
 * 一件事：**区域物化闸门**（`src/eval/range-gate.ts`）—— 多大的矩形会被拒绝，
 * 以及被拒绝时下游看到的是什么。
 *
 * 与 `whole-axis-refs.test.ts` 分开：那份问「整轴与有界给不给同一个答案」，
 * 这份问「闸门本身对不对」。同一个夹具在两份里会得到不同的失败提问。
 *
 * # 两条被钉住的事实
 *
 * 1. **上限是一整列（1,048,576 格），不是 10 万。** 老上限抄自
 *    `spreadsheet-ui-core` 的 `GO_TO_SCAN_MAX_CELLS`，一条 UI 扫描约定，
 *    从来没按求值器的预算量过。后果是：只有约 17 个有稀疏孪生的函数
 *    （SUM / COUNTIF / …）能吃大区域，**其余几百个**在 10 万格以上一律吃
 *    `#NUM!` —— 而 Rust 侧根本没有这道闸门，于是两个引擎在大区域上必然分岔。
 *
 * 2. **拒绝是外带信号，不是数据。** 老写法 `return [[ERR('#NUM!')]]` 把一次
 *    结构性失败编码成一片 1×1 的数组，下游各自误读：`MATCH` 答 `#N/A`
 *    （用户看到「没找到」，其实是撞了闸门）、`VLOOKUP` 答 `#REF!`、
 *    `SORT` / `TRANSPOSE` 溢出一片 1×1 的 `#NUM!`。现在一律是同一个**标量**
 *    `#NUM!`，因为它在表达式层就被折回错误，走每个函数既有的 `propagateError`。
 *
 * 断言全写闭式字面量、全走 `createWorkbook` 的真实公式路径 —— 稀疏孪生与
 * 物化两条路只有从公式路径才分得开（直接调 `FUNCTIONS.X` 会测到不跑的那条）。
 */
import { describe, expect, test } from '@jest/globals'

import { createWorkbook } from '../src/workbook'
import { keyFor } from '../src/sheet'
import type { Value, Workbook } from '../src/types'

const num = (value: number): Value => ({ kind: 'number', value })

function read(wb: Workbook, row: number): Value {
  const sheet = wb.sheet('s1')
  if (!sheet) throw new Error('missing sheet s1')
  return wb.store.getter(sheet.formulaCellAtom(keyFor(row, 25)))
}

/** 逐条求值 `[公式, 期望值]`。行号从 700_000 起，避开所有夹具。 */
function expectAll(wb: Workbook, cases: ReadonlyArray<readonly [string, Value]>): void {
  cases.forEach(([formula], i) => wb.setCell('s1', 700_000 + i, 25, formula))
  cases.forEach(([formula, want], i) => {
    expect([formula, read(wb, 700_000 + i)]).toEqual([formula, want])
  })
}

/**
 * 错误码（丢掉 message）。闸门的 message 带具体格数，钉死它会让夹具尺寸和
 * 断言耦合；这里要问的是「是哪个错误码」。
 */
function codeOf(value: Value): string {
  return value.kind === 'error' ? value.code : `<not an error: ${JSON.stringify(value)}>`
}

function expectAllCodes(wb: Workbook, formulas: readonly string[], want: string): void {
  formulas.forEach((f, i) => wb.setCell('s1', 700_000 + i, 25, f))
  expect(formulas.map((f, i) => `${f} → ${codeOf(read(wb, 700_000 + i))}`)).toEqual(
    formulas.map((f) => `${f} → ${want}`),
  )
}

describe('闸门上限 —— 10 万格以上不再是「算不出来」', () => {
  /** F1:F5 = 1..5，外加 F100001 = 9 把已用区域顶到 10 万行开外。 */
  function pastOldCapWorkbook(): Workbook {
    const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
    for (let r = 0; r < 5; r += 1) wb.setCell('s1', r, 5, String(r + 1))
    wb.setCell('s1', 100_000, 5, '9')
    return wb
  }

  test('有界大区域（100,001 格）：非稀疏函数拿到真答案，不再是 #NUM! / #N/A', () => {
    // 有界矩形不走整轴夹取（那是用户明写的矩形），修前 100001 > 100000 直接
    // 撞闸门 —— 每条的修前答案写在注释里，都是**不同的**症状。
    expectAll(pastOldCapWorkbook(), [
      ['=MATCH(3,F1:F100001,0)', num(3)], // 修前 #N/A
      ['=MATCH(9,F1:F100001,0)', num(100_001)], // 修前 #N/A
      ['=VLOOKUP(3,F1:F100001,1,FALSE)', num(3)], // 修前 #REF!
      ['=XLOOKUP(9,F1:F100001,F1:F100001)', num(9)], // 修前 #N/A
      ['=LARGE(F1:F100001,1)', num(9)], // 修前 #NUM!
      ['=SUMPRODUCT(F1:F100001,F1:F100001)', num(136)], // 修前 #NUM!
      ['=CORREL(F1:F100001,F1:F100001)', num(1)], // 修前 #NUM!
    ])
  })

  test('整轴形态（夹到 100,201 格）给同一批答案', () => {
    expectAll(pastOldCapWorkbook(), [
      ['=MATCH(3,F:F,0)', num(3)],
      ['=MATCH(9,F:F,0)', num(100_001)],
      ['=LARGE(F:F,1)', num(9)],
      ['=SUMPRODUCT(F:F,F:F)', num(136)],
      // 稀疏孪生走的是另一条路，两条必须收敛到同一个答案。
      ['=SUM(F:F)', num(24)],
      ['=COUNTA(F:F)', num(6)],
    ])
  })
})

describe('闸门仍然拦得住 —— 超过一整列就拒绝', () => {
  /** 只写两格，但第二格在第 60 万行：夹取把 `F:G` 撑到 1,200,402 格。 */
  function pastNewCapWorkbook(): Workbook {
    const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
    wb.setCell('s1', 600_000, 5, '3')
    wb.setCell('s1', 600_000, 6, '30')
    return wb
  }

  test('拒绝一律是标量 #NUM! —— 五种消费形态不再各自误读一遍', () => {
    // 修前这一列分别是：#N/A / #REF! / #N/A / #NUM! / #NUM! / 一片 1×1 的
    // #NUM! / 一片 1×1 的 #NUM!。同一个原因，五种症状，从来没人把它们
    // 联系成同一个问题 —— 这条断言就是防这个回潮的。
    expectAllCodes(
      pastNewCapWorkbook(),
      [
        '=MATCH(3,F:G,0)',
        '=VLOOKUP(3,F:G,2,FALSE)',
        '=XLOOKUP(3,F:G,F:G)',
        '=SUMPRODUCT(F:G)',
        '=LARGE(F:G,1)',
        '=SORT(F:G)',
        '=TRANSPOSE(F:G)',
        '=SUMPRODUCT(A:XFD)',
      ],
      '#NUM!',
    )
  })

  test('跨表口同一条口径 —— 拒绝照样是标量，不是一片 1×1', () => {
    // `foreign-sheet.ts` 是第三条物化口（另两条是递归口与蹦床口）。它此前
    // 自带一份重复的闸门代码与重复的错误串，三份各自演化正是这道闸门在
    // `a827bac` 之前只被修好两处的原因。
    const wb = createWorkbook([
      { id: 's1', name: 'Sheet1' },
      { id: 's2', name: 'Sheet2' },
    ])
    wb.setCell('s2', 600_000, 5, '3')
    wb.setCell('s2', 600_000, 6, '30')
    expectAllCodes(
      wb,
      ['=MATCH(3,Sheet2!F:G,0)', '=VLOOKUP(3,Sheet2!F:G,2,FALSE)', '=SUMPRODUCT(Sheet2!F:G)'],
      '#NUM!',
    )
    expectAll(wb, [['=MATCH(3,Sheet2!F:F,0)', num(600_001)]])
  })

  test('同一张表上装得下的形态照常算 —— 拒绝是关于尺寸的，不是关于「大表」的', () => {
    // `F:F` 夹成 600,201 格 ≤ 一整列 → 物化；`F:G` 是它的两倍 → 拒绝。
    expectAll(pastNewCapWorkbook(), [
      ['=MATCH(3,F:F,0)', num(600_001)],
      ['=SUM(F:F)', num(3)],
      ['=COUNTA(F:F)', num(1)],
    ])
  })
})

describe('闸门标记不误伤真数据', () => {
  test('一个真的装着 #NUM! 的单格区域仍然是数据', () => {
    const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
    wb.setCell('s1', 0, 0, '=SQRT(-1)')
    expectAll(wb, [
      // 拒绝值靠**身份**识别（WeakSet），不靠「1×1 且装着 #NUM!」的形状 ——
      // 后者会把这一格也认成拒绝，把 #NUM! 冒上去。
      //
      // 这里答 #N/A 而不是 #NUM! 是**刻意保留**的：数组内部的错误对 MATCH 是
      // 数据，Rust 侧的 `values_equal` 同样不传播（见 eval.rs "MATCH")。改成
      // 传播会凭空造出一条新的跨引擎分歧 —— 闸门那条已经在上面被单独修好了。
      ['=MATCH(3,A1:A1,0)', { kind: 'error', code: '#N/A' } as Value],
      ['=MATCH(3,{1,2,3},0)', num(3)],
    ])
  })
})
