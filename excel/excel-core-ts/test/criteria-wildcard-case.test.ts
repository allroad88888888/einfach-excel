/**
 * criteria 的**文本比较**这一层：大小写，以及通配符判据「只匹配文本」。
 *
 * 孪生规格：`excel/rust/excel-core/tests/criteria_wildcard_case.rs`（同一套夹具、
 * 同一批数字）。跨引擎钉子在
 * `excel/solid-excel/test/cross-engine-parity-criteria-wildcard.ts`。
 *
 * 两条规则，Excel 依据分别是：
 *
 * * **不区分大小写** —— MS 官方 COUNTIF 文档原话：“Criteria aren't case sensitive.
 *   In other words, the string "apples" and the string "APPLES" will match the
 *   same cells.” 别和 `EXACT()` 混为一谈，那个函数**区分**大小写，正是 criteria
 *   做不到大小写敏感时的标准替代写法。
 * * **通配符判据只匹配文本格** —— Exceljet「Count cells that contain text」
 *   （`=COUNTIF(data,"*")`）原话：“Empty cells and cells that contain numeric
 *   values or errors should not be included in the count.” 同页给出互补的
 *   `=COUNTIF(data,"<>*")`，在同一个 11 格区域上一个回 4、另一个回 7 —— 两者
 *   **严格互补**，所以数字格 / 错误格 / 空格全部落在 `"<>*"` 那一侧。
 *
 * 本文件此前钉住的缺陷（改前的实测值）：
 *
 * | 探针 | Excel | TS 改前 |
 * |---|---|---|
 * | `COUNTIF(A1:A8,"<>*")` | 3 | 2 —— 错误格被写死成「`=` 和 `<>` 都不命中」 |
 * | `COUNTIF(A1:A8,"~~")` | 1（命中 `~`） | 0 —— `~` 不算通配符，转义没被解码 |
 *
 * 走的是 `createWorkbook` 的真实公式路径，因此打到的是 `evaluate.ts` 截走的稀疏
 * 孪生（`sparse-single-criterion.ts` / `sparse-multi-criterion.ts`），不是
 * `FUNCTIONS` 注册表里的同名实现 —— 这一程已经三次被「单测全绿、端到端还错」咬到。
 */

import { describe, expect, test } from '@jest/globals'

import { createWorkbook } from '../src/workbook'
import { keyFor } from '../src/sheet'
import type { Value } from '../src/types'

/**
 * A 列 = 条件区，8 格覆盖 criteria 会遇到的全部值种类；**故意不留空格**，好让
 * 「区域枚举跳不跳空格」这条正交分歧不污染本文件的断言。
 * B 列 = 值区，1..8 全是干净数字。
 *
 * 行号与含义（下面所有闭式数字都从这张表算出来）：
 * 1 `apple`(文本) 2 `APPLE`(文本) 3 `5`(数字) 4 `TRUE`(布尔)
 * 5 `#N/A`(错误) 6 `a*b`(文本) 7 `~`(文本) 8 `"5"`(文本型数字)
 *
 * 于是：**文本格 5 个**（1/2/6/7/8），**非文本格 3 个**（3/4/5）。
 */
function env() {
  const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
  const crit: Value[] = [
    { kind: 'string', value: 'apple' },
    { kind: 'string', value: 'APPLE' },
    { kind: 'number', value: 5 },
    { kind: 'boolean', value: true },
    { kind: 'error', code: '#N/A' },
    { kind: 'string', value: 'a*b' },
    { kind: 'string', value: '~' },
    { kind: 'string', value: '5' },
  ]
  crit.forEach((v, i) => {
    wb.setCellValue('s1', i, 0, v)
    wb.setCellValue('s1', i, 1, { kind: 'number', value: i + 1 })
  })
  return wb
}

type Wb = ReturnType<typeof createWorkbook>

let probeRow = 0

function evalFormula(wb: Wb, formula: string): Value {
  probeRow += 1
  const row = 100 + probeRow
  wb.setCell('s1', row, 7, formula)
  return wb.store.getter(wb.sheet('s1')!.formulaCellAtom(keyFor(row, 7)))
}

function evalNumber(wb: Wb, formula: string): number {
  const v = evalFormula(wb, formula)
  if (v.kind !== 'number') throw new Error(`${formula} → ${JSON.stringify(v)}，期望一个数字`)
  return v.value
}

describe('criteria 的文本比较不区分大小写', () => {
  test('三种大小写写法给同一个答案，`<>` 是它的补集', () => {
    const wb = env()
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"apple")')).toBe(2)
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"APPLE")')).toBe(2)
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"ApPlE")')).toBe(2)
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"<>APPLE")')).toBe(6)
  })

  test('布尔格也一样不区分大小写', () => {
    const wb = env()
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"TRUE")')).toBe(1)
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"true")')).toBe(1)
  })
})

describe('通配符判据只匹配文本格', () => {
  test('`"*"` 数文本格，`"<>*"` 是它在整个区域上的严格补集', () => {
    const wb = env()
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"*")')).toBe(5)
    // `"?*"`（至少一个字符）在这张表上与 `"*"` 同解 —— 没有零长文本格。
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"?*")')).toBe(5)
    // 非文本格 = 数字 + 布尔 + 错误 = 3。错误格必须落在这一侧，不能两侧都不算。
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"<>*")')).toBe(3)
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"*")') + evalNumber(wb, '=COUNTIF(A1:A8,"<>*")')).toBe(8)
  })

  test('数字格：带通配符吃不到，不带通配符照旧强转', () => {
    const wb = env()
    // `"?"` = 恰好一个字符的**文本**格：`~` 与文本 `"5"`。数字 5 不算。
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"?")')).toBe(2)
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"5*")')).toBe(1)
    // 数值强转那一档没被带翻：数字 5 与文本 `"5"` 都命中。
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"5")')).toBe(2)
  })

  test('错误格与布尔格都不参与通配符匹配', () => {
    const wb = env()
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"*N*")')).toBe(0)
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"T*")')).toBe(0)
  })
})

/**
 * 与上一轮修好的「A —— 条件字符串里写错误码」的分界线。
 *
 * 同一个错误格：**不带**通配符时按显示文本比（`"#N/A"` 命中它），**带**通配符时
 * 它根本不参与（`"*N*"` 命中不了）。两条写在同一个 test 里 —— 把通配符那条改成
 * 「错误格也按显示文本比一下」就会连带把这条一起弄红。
 */
test('通配符档与错误码字符串档不互相污染', () => {
  const wb = env()
  expect(evalNumber(wb, '=COUNTIF(A1:A8,"#N/A")')).toBe(1)
  expect(evalNumber(wb, '=COUNTIF(A1:A8,"*N*")')).toBe(0)
  // `"<>#N/A"` 是「除那一格以外的全部」= 7；`"<>*"` 是完全不同的 3。
  expect(evalNumber(wb, '=COUNTIF(A1:A8,"<>#N/A")')).toBe(7)
  expect(evalNumber(wb, '=COUNTIF(A1:A8,"<>*")')).toBe(3)
})

describe('`~` 转义', () => {
  test('`~*` 把通配符降级成字面量', () => {
    const wb = env()
    // 不转义时是「a 开头 b 结尾」的模式，这张表里只有 `a*b` 那格自己合。
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"a*b")')).toBe(1)
    // 转义后是字面量三字符串 `a*b`，仍然只有那一格 —— 但走的是完全不同的路。
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"a~*b")')).toBe(1)
    // 大小写在通配符路径上同样不敏感。
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"A~*B")')).toBe(1)
  })

  test('`~~` 是字面量 `~`，命中的是内容为 `~` 的那一格', () => {
    const wb = env()
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"~~")')).toBe(1)
    // 定位到具体是哪一格 —— 只断言总数的话，一个「拿 `~~` 原样去比」的引擎
    // 会在别处凑出同一个 1。
    expect(evalNumber(wb, '=COUNTIF(A7:A7,"~~")')).toBe(1)
    expect(evalNumber(wb, '=COUNTIF(A1:A6,"~~")')).toBe(0)
  })
})

/**
 * 同族自洽：八个名字在**同一条**判据上必须给同一套命中行。
 *
 * 命中行由 A 列决定，闭式值从 B 列（1..8）算：
 * `"*"` → 文本行 1/2/6/7/8 → 和 24、均值 4.8、极值 8 / 1；
 * `"APPLE"` → 行 1/2 → 和 3、均值 1.5、极值 2 / 1。
 */
describe('八个函数在同一条判据上口径一致', () => {
  test('通配符判据 `"*"`', () => {
    const wb = env()
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"*")')).toBe(5)
    expect(evalNumber(wb, '=COUNTIFS(A1:A8,"*")')).toBe(5)
    expect(evalNumber(wb, '=SUMIF(A1:A8,"*",B1:B8)')).toBe(24)
    expect(evalNumber(wb, '=SUMIFS(B1:B8,A1:A8,"*")')).toBe(24)
    expect(evalNumber(wb, '=AVERAGEIF(A1:A8,"*",B1:B8)')).toBeCloseTo(4.8, 9)
    expect(evalNumber(wb, '=AVERAGEIFS(B1:B8,A1:A8,"*")')).toBeCloseTo(4.8, 9)
    expect(evalNumber(wb, '=MAXIFS(B1:B8,A1:A8,"*")')).toBe(8)
    expect(evalNumber(wb, '=MINIFS(B1:B8,A1:A8,"*")')).toBe(1)
  })

  test('大小写判据 `"APPLE"`', () => {
    const wb = env()
    expect(evalNumber(wb, '=COUNTIF(A1:A8,"APPLE")')).toBe(2)
    expect(evalNumber(wb, '=COUNTIFS(A1:A8,"APPLE")')).toBe(2)
    expect(evalNumber(wb, '=SUMIF(A1:A8,"APPLE",B1:B8)')).toBe(3)
    expect(evalNumber(wb, '=SUMIFS(B1:B8,A1:A8,"APPLE")')).toBe(3)
    expect(evalNumber(wb, '=AVERAGEIF(A1:A8,"APPLE",B1:B8)')).toBeCloseTo(1.5, 9)
    expect(evalNumber(wb, '=AVERAGEIFS(B1:B8,A1:A8,"APPLE")')).toBeCloseTo(1.5, 9)
    expect(evalNumber(wb, '=MAXIFS(B1:B8,A1:A8,"APPLE")')).toBe(2)
    expect(evalNumber(wb, '=MINIFS(B1:B8,A1:A8,"APPLE")')).toBe(1)
  })
})

/**
 * 跨引擎夹具只能用公式播种（`WorkloadCell` 没有 text / boolean 两种 kind），
 * 所以那边的布尔格写成 `=(1=1)`、文本格写成 `="apple"`。这一条证明这两种写法
 * 真的产出布尔 / 文本，免得跨引擎那张表在一个**播种就错了**的夹具上通过。
 *
 * 布尔格用 `=(1=1)` 而不是 `=TRUE()`：后者在**本引擎**上回
 * `#VALUE! expected LAMBDA`（一条与本次无关的、单独的分歧 —— Rust 侧
 * `=TRUE()` 正常回 `TRUE`），拿它当夹具会让跨引擎那张表红在播种上而不是红在
 * 语义上。纯运算符写法两个引擎都认。
 */
test('公式播种的布尔格 / 文本格与字面量同判', () => {
  const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
  wb.setCell('s1', 0, 3, '=(1=1)')
  wb.setCell('s1', 1, 3, '="apple"')
  expect(wb.store.getter(wb.sheet('s1')!.formulaCellAtom(keyFor(0, 3)))).toMatchObject({
    kind: 'boolean',
    value: true,
  })
  expect(wb.store.getter(wb.sheet('s1')!.formulaCellAtom(keyFor(1, 3)))).toMatchObject({
    kind: 'string',
    value: 'apple',
  })
  expect(evalNumber(wb, '=COUNTIF(D1:D2,"*")')).toBe(1)
  expect(evalNumber(wb, '=COUNTIF(D1:D2,"true")')).toBe(1)
})
