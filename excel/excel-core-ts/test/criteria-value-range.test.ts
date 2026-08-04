/**
 * SUMIF / AVERAGEIF 的值区（第三个实参）规则：**只取左上角，行列数由条件区决定**。
 *
 * ── 这个文件真正在防的东西 ──
 *
 * 这两个函数各有两份实现：`FUNCTIONS` 注册表里的物化版（`functions/stats.ts`）
 * 和 `evaluate.ts` 派发前截走的稀疏版（`sparse-single-criterion.ts`）。走哪一份
 * 只由**条件区的几何**决定，与用户写的公式语义无关 —— 见 `canSparseIterate`：
 * 整轴、或超过 `MATERIALIZED_RANGE_CELL_CAP`（10 万格）走稀疏，否则走物化。
 *
 * 事故：物化版用 `n = min(len(range), len(sum_range))` 截断，`SUMIF(A1:A3,">1",B1)`
 * 给 0、`SUMIF(A1:A3,">1",B1:B2)` 给 200；稀疏版用 `relativeCoord` 走的是对的规则，
 * 同样输入给 500。两条路两个答案，而**没有任何测试把它们对起来**。同一条缝本仓
 * 已经咬过五次以上。
 *
 * ── 怎么让同一条断言分别走两条路 ──
 *
 * 稀疏闸门是纯几何的，同一个矩形不可能既稀疏又物化。所以把**条件区**写成三种
 * 拼法，它们在本夹具的数据下语义等价（判据 `>1` 不匹配空格；`<>x` 那一组匹配
 * 空格，但延长出来的格子在值区侧也全是空、贡献 0）：
 *
 *   | 拼法          | 闸门                    | 落到哪条路 |
 *   |---------------|-------------------------|-----------|
 *   | `A1:A3`       | 3 格                    | 物化      |
 *   | `A1:A100001`  | 100001 > 10 万          | 稀疏      |
 *   | `A:A`         | 整列哨兵                | 稀疏      |
 *
 * 「这三种拼法确实分别落在两条路上」不是假设 —— 下面第一组 test 直接对
 * `canSparseIterate` 断言。闸门若被改动，那组先红，等于告诉改动者这个文件的配对
 * 覆盖已经失效，而不是让它悄悄退化成「三条都走同一条路」。
 *
 * 期望值一律写**闭式字面量**，不写「三条相等」—— 那样三条一起错也是绿的
 * （抄 `whole-axis-refs.test.ts` 的做法）。
 */
import { describe, expect, test } from '@jest/globals'

import { createWorkbook } from '../src/workbook'
import { keyFor } from '../src/sheet'
import { canSparseIterate } from '../src/eval/runtime-ref'
import { parseRangeString } from '../src/refs'
import type { Value, Workbook } from '../src/types'

const num = (value: number): Value => ({ kind: 'number', value })
/** 只钉错误码，不钉 message —— 有些实现带诊断文本，那不是契约。 */
const err = (code: string): Value =>
  expect.objectContaining({ kind: 'error', code }) as unknown as Value

/** 条件区的三种拼法，连同它**应该**落在哪条路上。 */
const SPELLINGS = [
  { label: 'flatten 路径（有界小区域）', criteria: 'A1:A3', sparse: false },
  { label: 'sparse 路径（超 10 万格闸门）', criteria: 'A1:A100001', sparse: true },
  { label: 'sparse 路径（整列哨兵）', criteria: 'A:A', sparse: true },
] as const

/**
 * Sheet1: A1:A3 = 1,2,3；B1:B3 = 100,200,300。Sheet2: B1:B3 = 7,8,9。
 * 值区故意只在头三行有数据 —— 条件区拼法延长出来的部分在值区侧全是空格。
 */
function fixture(): Workbook {
  const wb = createWorkbook([
    { id: 's1', name: 'Sheet1' },
    { id: 's2', name: 'Sheet2' },
  ])
  ;[1, 2, 3].forEach((v, r) => wb.setCell('s1', r, 0, String(v)))
  ;[100, 200, 300].forEach((v, r) => wb.setCell('s1', r, 1, String(v)))
  ;[7, 8, 9].forEach((v, r) => wb.setCell('s2', r, 1, String(v)))
  return wb
}

function read(wb: Workbook, row: number): Value {
  const sheet = wb.sheet('s1')
  if (!sheet) throw new Error('missing sheet s1')
  return wb.store.getter(sheet.formulaCellAtom(keyFor(row, 25)))
}

/** 把一批 `[公式, 期望值]` 写进 Z 列逐条求值。行号从 200 起，避开夹具。 */
function expectAll(
  cases: ReadonlyArray<readonly [string, Value]>,
  makeWorkbook: () => Workbook = fixture,
): void {
  const wb = makeWorkbook()
  cases.forEach(([formula], i) => wb.setCell('s1', 200 + i, 25, formula))
  cases.forEach(([formula, want], i) => {
    expect([formula, read(wb, 200 + i)]).toEqual([formula, want])
  })
}

/**
 * 值区写法 → 期望值。`{C}` 占位符换成三种条件区拼法之一，三次都必须给同一个
 * 闭式答案 —— 这就是「稀疏路径与 flatten 路径同答案」那条断言。
 */
const PAIRED_CASES: ReadonlyArray<readonly [string, Value]> = [
  // 值区写成一格：Excel 从 B1 起、按条件区形状铺开成 B1:B3 ⇒ 200+300。
  ['=SUMIF({C},">1",B1)', num(500)],
  // 值区比条件区短：短的那一头不截断条件区，照样铺到 B3。
  ['=SUMIF({C},">1",B1:B2)', num(500)],
  // 值区比条件区长：多出来的行不参与。
  ['=SUMIF({C},">1",B1:B10)', num(500)],
  // 值区本来就同形：三条路都不该动它。
  ['=SUMIF({C},">1",B1:B3)', num(500)],
  // 左上角不在第一行：B2 起 ⇒ B2:B4，命中 A2→B3=300、A3→B4=空。
  ['=SUMIF({C},">1",B2)', num(300)],
  // 值区整列：左上角仍是 B1，形状仍由条件区定。
  ['=SUMIF({C},">1",B:B)', num(500)],
  // 跨表值区：矩形落在 Sheet2 上 ⇒ Sheet2!B2+B3。
  ['=SUMIF({C},">1",Sheet2!B1)', num(17)],
  // 判据匹配空格 —— 走的是两条路各自的 blank 分支（`sumBlankMatchedTargets`
  // vs 物化遍历），延长出来的空条件格在值区侧也是空、贡献 0。
  ['=SUMIF({C},"<>x",B1)', num(600)],
  // 矩形越过网格下边界 ⇒ #REF!（稀疏侧由 `relativeCoord` 判、物化侧由
  // `criteriaValueRect` 判，同一口径）。
  ['=SUMIF({C},">1",B1048575)', err('#REF!')],
  // AVERAGEIF 的 average_range 是同一条规则，不是「形状必须相同」。
  ['=AVERAGEIF({C},">1",B1)', num(250)],
  ['=AVERAGEIF({C},">1",B1:B2)', num(250)],
  ['=AVERAGEIF({C},">1",Sheet2!B1)', num(8.5)],
  // 几何（B2 起 ⇒ B2:B4，命中 B3=300 与 B4=空）与**分母口径**在同一行上验：
  // Excel 的 average_range 忽略空格，B4 那一格不进分母 ⇒ 300/1。这一行曾经是
  // `num(150)`（空格当 0 计进分母），根因是累加器用了 SUMIF 那档 `toNumber`，
  // 现在走 `averageTierNumber`（只认数字）。任务 #103(b)。
  ['=AVERAGEIF({C},">1",B2)', num(300)],
]

describe('SUMIF / AVERAGEIF 值区：稀疏与物化两条路必须同答案', () => {
  test.each(SPELLINGS)('闸门前置断言：$criteria 落在预期的那条路上', ({ criteria, sparse }) => {
    const range = parseRangeString(criteria)
    expect([criteria, range]).not.toEqual([criteria, null])
    expect([criteria, canSparseIterate({ range: range! })]).toEqual([criteria, sparse])
  })

  describe.each(SPELLINGS)('$label：条件区写作 $criteria', ({ criteria }) => {
    test('值区一律「左上角 + 条件区形状」', () => {
      expectAll(PAIRED_CASES.map(([tpl, want]) => [tpl.replace('{C}', criteria), want] as const))
    })
  })
})

/**
 * 洞在中间的夹具：`A1=1 / A2 空 / A3=3`、`B1=10 / B2 空 / B3=30`，
 * 外加一组「条件区无洞、值区有洞」的 C/D 列（`C1:C3=1,2,3`、`D1=10 / D2 空 /
 * D3=30`）—— 两个洞的位置不同，是**两条不同的规则**：
 *
 *  - A/B：洞在**条件区**，判据认空格时命中它，取到的值区那一格也是空 ⇒ 分子
 *    分母都不动。这是 `AVERAGEIF(区域,"")` 那一条。
 *  - C/D：洞只在**值区**，条件区照常命中 ⇒ 该位置不进分母。
 *
 * 只留一个洞覆盖不了另一条：C/D 那组在「空格当 0」的实现下也照样能给出错误的
 * 13.33，而 A/B 那组会给 0 —— 症状不同，根因是同一处。
 */
function blankFixture(): Workbook {
  const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
  wb.setCell('s1', 0, 0, '1')
  wb.setCell('s1', 2, 0, '3')
  wb.setCell('s1', 0, 1, '10')
  wb.setCell('s1', 2, 1, '30')
  ;[1, 2, 3].forEach((v, r) => wb.setCell('s1', r, 2, String(v)))
  wb.setCell('s1', 0, 3, '10')
  wb.setCell('s1', 2, 3, '30')
  return wb
}

/**
 * 值区的**空格贡献什么** —— 与上面的「值区覆盖哪个矩形」是两条正交的规则，
 * 但同样有稀疏 / 物化两份实现，所以用同一套三拼法跑。
 *
 * 事故留痕（任务 #103）：`AVERAGEIF(A1:A3,"")` 在物化路径上答 **0**、在稀疏路径
 * 上答 `#DIV/0!` —— **两条路当场就是岔的**，而跨引擎那张网也没覆盖这一格。根因
 * 是物化路径用 SUMIF 那档 `toNumber` 取值（空格 → 0），于是「唯一命中的是空格」
 * 变成了「命中一格、值 0」；稀疏路径压根不枚举空格才碰巧对。Rust 引擎与 Excel
 * 都是 `#DIV/0!`（微软文档：average_range 里的空格被忽略；没有格子满足条件则
 * `#DIV/0!`）。
 */
const BLANK_TIER_CASES: ReadonlyArray<readonly [string, Value]> = [
  // 唯一命中的位置在值区侧是空格 ⇒ 一个数都没有 ⇒ #DIV/0!，不是 0。
  ['=AVERAGEIF({C},"")', err('#DIV/0!')],
  ['=AVERAGEIF({C},"",B1:B3)', err('#DIV/0!')],
  // 判据认空格且**另有**数字命中：空格那一格不进分母 ⇒ (10+30)/2。
  ['=AVERAGEIF({C},"<>x",B1:B3)', num(20)],
  // 洞只在值区（条件区 C 列无洞）：命中三格、只有两个数 ⇒ 20，不是 13.33。
  ['=AVERAGEIF(C1:C3,">0",D1:D3)', num(20)],
  ['=AVERAGEIFS(D1:D3,C1:C3,">0")', num(20)],
  // 反向围栏：SUMIF 那一档**不**跟着改，空格照旧当 0 加（对和无害）。
  ['=SUMIF({C},"<>x",B1:B3)', num(40)],
  ['=SUMIF({C},"")', num(0)],
]

describe('AVERAGEIF 值区的空格：不进分母（稀疏与物化两条路必须同答案）', () => {
  describe.each(SPELLINGS)('$label：条件区写作 $criteria', ({ criteria }) => {
    test('空格不进分母，一个数都没有就是 #DIV/0!', () => {
      expectAll(
        BLANK_TIER_CASES.map(([tpl, want]) => [tpl.replace('{C}', criteria), want] as const),
        blankFixture,
      )
    })
  })
})

describe('SUMIF / AVERAGEIF 值区：边界', () => {
  test('值区实参本身是错误 → 传播', () => {
    expectAll([
      ['=SUMIF(A1:A3,">1",#REF!)', err('#REF!')],
      ['=AVERAGEIF(A1:A3,">1",#REF!)', err('#REF!')],
    ])
  })

  test('两参形态不受影响：值区就是条件区', () => {
    expectAll([
      ['=SUMIF(A1:A3,">1")', num(5)],
      ['=SUMIF(A:A,">1")', num(5)],
      ['=AVERAGEIF(A1:A3,">1")', num(2.5)],
      ['=AVERAGEIF(A:A,">1")', num(2.5)],
    ])
  })

  /**
   * *IFS 家族**不**走这条规则：Excel 要求各区形状严格相同，否则 #VALUE!。
   * 放在这里当护栏 —— 别人照着上面的宽容规则「顺手统一」时会先撞红这条。
   */
  test('*IFS 家族仍然是「形状必须相同，否则 #VALUE!」', () => {
    expectAll([
      ['=SUMIFS(B1,A1:A3,">1")', err('#VALUE!')],
      ['=SUMIFS(B1:B2,A1:A3,">1")', err('#VALUE!')],
      ['=AVERAGEIFS(B1,A1:A3,">1")', err('#VALUE!')],
      ['=MAXIFS(B1,A1:A3,">1")', err('#VALUE!')],
      ['=MINIFS(B1,A1:A3,">1")', err('#VALUE!')],
      ['=COUNTIFS(A1:A3,">1",B1,">0")', err('#VALUE!')],
    ])
  })
})

describe('SUMIF / AVERAGEIF 值区：依赖图跟着矩形走', () => {
  /**
   * 公式读到 B3 就必须依赖 B3。静态实参只写了 `B1`，若依赖图照实参登记，B3 改了
   * 不会触发重算 —— 值是对的但会陈。这条覆盖两条路（条件区两种拼法）。
   */
  test.each(SPELLINGS)('$criteria：改动矩形里的格子会触发重算', ({ criteria }) => {
    const wb = fixture()
    wb.setCell('s1', 300, 25, `=SUMIF(${criteria},">1",B1)`)
    expect(read(wb, 300)).toEqual(num(500))
    wb.setCell('s1', 2, 1, '999') // B3
    expect(read(wb, 300)).toEqual(num(1199))
  })
})
