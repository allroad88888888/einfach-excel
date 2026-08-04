/**
 * IFS 家族的 criteria 与错误值的两条**方向相反**的语义。
 *
 * 孪生规格：`excel/rust/excel-core/tests/criteria_error_semantics.rs`。两边同一
 * 套夹具、同一批数字，跨引擎钉子在
 * `excel/solid-excel/test/cross-engine-parity-criteria-errors.ts`。
 *
 * * **A —— 条件是「写着错误码的字符串」**：`"#N/A"` / `"<>#N/A"` 里的 `#N/A`
 *   只是文本。错误格按显示文本参与比较，于是 `"#N/A"` 数得到错误格、
 *   `"<>#N/A"` 数得到「除该错误外的一切」。Excel 的标准错误过滤配方就是这么写的。
 * * **B —— criteria 实参本身求值成错误值**：按通用实参规则原样传播，不做文本比较。
 *
 * 一句话区分：A 看的是**字符串内容**，B 看的是**值的种类**。
 *
 * 走的是 `createWorkbook` 的真实公式路径，因此打到的是 `evaluate.ts` 截走的
 * 稀疏孪生（`sparse-single-criterion.ts` / `sparse-multi-criterion.ts`），
 * 不是 `FUNCTIONS` 注册表里的同名实现 —— 这一程已经两次被「单测全绿、端到端
 * 还错」咬到，所以规格钉在端到端这一侧。
 */

import { describe, expect, test } from '@jest/globals'

import { createWorkbook } from '../src/workbook'
import { keyFor } from '../src/sheet'
import type { Value } from '../src/types'

const num = (value: number): Value => ({ kind: 'number', value })
const err = (code: '#N/A' | '#VALUE!' | '#REF!' | '#DIV/0!'): Value => ({ kind: 'error', code })

/**
 * A 列 = 条件区，10 格里塞 1 个 `#N/A` + 1 个 `#VALUE!`（Exceljet 配方的形状）。
 * B 列 = 值区，1..10，全是干净数字。
 */
function env() {
  const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
  const crit: Value[] = [
    num(10),
    num(20),
    err('#N/A'),
    num(30),
    num(40),
    err('#VALUE!'),
    num(50),
    num(60),
    num(70),
    num(80),
  ]
  crit.forEach((v, i) => {
    wb.setCellValue('s1', i + 4, 0, v)
    wb.setCellValue('s1', i + 4, 1, num(i + 1))
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

describe('A —— 条件字符串里写错误码', () => {
  test('Exceljet 的错误过滤配方，两个数字都钉死', () => {
    const wb = env()
    // 10 格里只有 1 个 #N/A，其余 9 格（含那个 #VALUE!）都该被数到。
    expect(evalNumber(wb, '=COUNTIF(A5:A14,"<>#N/A")')).toBe(9)
    // 再排掉 #VALUE! 就剩 8 格 —— 这就是「数非错误格」的标准写法。
    expect(evalNumber(wb, '=COUNTIFS(A5:A14,"<>#N/A",A5:A14,"<>#VALUE!")')).toBe(8)
  })

  test('`"#N/A"` 当条件时数得到错误格，值区跟着走', () => {
    const wb = env()
    expect(evalNumber(wb, '=COUNTIF(A5:A14,"#N/A")')).toBe(1)
    expect(evalNumber(wb, '=COUNTIF(A5:A14,"#VALUE!")')).toBe(1)
    expect(evalNumber(wb, '=COUNTIF(A5:A14,"#DIV/0!")')).toBe(0)
    expect(evalNumber(wb, '=SUMIF(A5:A14,"#N/A",B5:B14)')).toBe(3)
    expect(evalNumber(wb, '=SUMIF(A5:A14,"#VALUE!",B5:B14)')).toBe(6)
  })

  test('8 个函数在同一条 `"<>#N/A"` 上口径一致', () => {
    const wb = env()
    // 9 行命中（排掉第 3 行），B 列 1..10 去掉 3 → 52。
    expect(evalNumber(wb, '=SUMIF(A5:A14,"<>#N/A",B5:B14)')).toBe(52)
    expect(evalNumber(wb, '=SUMIFS(B5:B14,A5:A14,"<>#N/A")')).toBe(52)
    expect(evalNumber(wb, '=COUNTIFS(A5:A14,"<>#N/A")')).toBe(9)
    expect(evalNumber(wb, '=AVERAGEIF(A5:A14,"<>#N/A",B5:B14)')).toBeCloseTo(52 / 9, 9)
    expect(evalNumber(wb, '=AVERAGEIFS(B5:B14,A5:A14,"<>#N/A")')).toBeCloseTo(52 / 9, 9)
    expect(evalNumber(wb, '=MAXIFS(B5:B14,A5:A14,"<>#N/A")')).toBe(10)
    expect(evalNumber(wb, '=MINIFS(B5:B14,A5:A14,"<>#N/A")')).toBe(1)
  })

  test('错误格仍然拿不下有序比较 —— 上一轮「条件区错误格跳过」没被带翻', () => {
    const wb = env()
    expect(evalNumber(wb, '=COUNTIF(A5:A14,">0")')).toBe(8)
    expect(evalNumber(wb, '=COUNTIF(A5:A14,"<0")')).toBe(0)
  })
})

describe('B —— criteria 实参本身求值成错误', () => {
  test('字面错误常量当 criteria：原样传播，不去做文本比较', () => {
    const wb = env()
    for (const formula of [
      '=COUNTIF(A5:A14,#REF!)',
      '=SUMIF(A5:A14,#REF!,B5:B14)',
      '=AVERAGEIF(A5:A14,#REF!,B5:B14)',
      '=COUNTIFS(A5:A14,#REF!)',
      '=SUMIFS(B5:B14,A5:A14,#REF!)',
      '=AVERAGEIFS(B5:B14,A5:A14,#REF!)',
      '=MAXIFS(B5:B14,A5:A14,#REF!)',
      '=MINIFS(B5:B14,A5:A14,#REF!)',
    ]) {
      expect(evalFormula(wb, formula)).toMatchObject(err('#REF!'))
    }
  })

  test('criteria 指向算成错误的格子：传播的是那个错误码本身', () => {
    const wb = env()
    wb.setCell('s1', 0, 3, '=1/0')
    expect(evalFormula(wb, '=COUNTIF(A5:A14,D1)')).toMatchObject(err('#DIV/0!'))
    expect(evalFormula(wb, '=COUNTIFS(A5:A14,D1)')).toMatchObject(err('#DIV/0!'))
    expect(evalFormula(wb, '=SUMIFS(B5:B14,A5:A14,D1)')).toMatchObject(err('#DIV/0!'))
  })
})

describe('A 与 B 的分界线', () => {
  test('同一个 #N/A：写成字符串是条件，求值成错误值是传播', () => {
    const wb = env()
    // A：字符串 → 数到那 1 个错误格。
    expect(evalNumber(wb, '=COUNTIF(A5:A14,"#N/A")')).toBe(1)
    // B：同一个错误码，但这次是值 → 传播。
    wb.setCell('s1', 0, 3, '=NA()')
    expect(evalFormula(wb, '=COUNTIF(A5:A14,D1)')).toMatchObject(err('#N/A'))
  })
})

describe('分档不变式：只有条件档变，值档照旧传播', () => {
  test('命中行上的值区错误照旧传播', () => {
    const wb = env()
    wb.setCellValue('s1', 7, 1, err('#DIV/0!'))
    // `"<>#N/A"` 命中 A8=30 那一行（A7 才是 #N/A），其值区 B8 是错误 → 传播。
    expect(evalFormula(wb, '=SUMIF(A5:A14,"<>#N/A",B5:B14)')).toMatchObject(err('#DIV/0!'))
    expect(evalFormula(wb, '=SUMIFS(B5:B14,A5:A14,"<>#N/A")')).toMatchObject(err('#DIV/0!'))
    expect(evalFormula(wb, '=AVERAGEIFS(B5:B14,A5:A14,"<>#N/A")')).toMatchObject(err('#DIV/0!'))
  })
})
