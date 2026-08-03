/**
 * 浮点溢出的出口：**`#NUM!`，不是 `Infinity`**。
 *
 * Rust 侧的孪生钉子是 `excel/rust/excel-core/tests/arithmetic_overflow.rs`，
 * **依据（Microsoft Learn 的原文引用）写在那份文件头**，这里不复述以免两处漂移。
 * 一句话摘要：溢出 → `#NUM!`；下溢 → `0`（两个方向相反，必须成对钉）；除以零
 * 仍是 `#DIV/0!`。
 *
 * # 后半段为什么要走真实公式路径
 *
 * `evaluate` 会在派发到内建函数表**之前**按名字把 SUM 截走送进
 * `eval/sparse-aggregations.ts`（见那份文件头的硬约定）。只改
 * `FUNCTIONS.SUM` 的话，直接调 `FunctionImpl` 的单测全绿、端到端仍然吐
 * `Infinity` —— 这个坑本仓已经咬过三次（COUNT / COUNTIFS / criteria）。所以
 * `SUM` 这一组同时钉两条路：一条喂标量实参（走注册表），一条喂可稀疏迭代的
 * 整列引用（走稀疏孪生）。
 */

import { describe, expect, test } from '@jest/globals'

import { evaluate, parseRefToKey, refLookupGeneric, rangeLookupGeneric } from '../src/eval/evaluate'
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

/** A1 地址 → 内部 `"row:col"` 键，稀疏扫描按后者认格子。 */
function numberCells(entries: ReadonlyArray<readonly [string, number]>): Map<CellKey, Cell> {
  const cells = new Map<CellKey, Cell>()
  for (const [a1, value] of entries) {
    const key = parseRefToKey(a1)
    if (!key) throw new Error(`bad address ${a1}`)
    cells.set(key, { input: String(value), value: { kind: 'number', value } })
  }
  return cells
}

/** `=FORMULA` → 求值结果，可选地先铺一张单元格表。 */
function run(formula: string, cells: ReadonlyMap<CellKey, Cell> = new Map()): Value {
  return evaluate(parseFormula(formula), makeCtx(cells))
}

const NUM_ERROR: Value = { kind: 'error', code: '#NUM!' }

describe('溢出 → #NUM!', () => {
  test('四个二元算术运算符各自都有闸门，不只是 `*`', () => {
    // 乘 —— 本待办的原始复现式。
    expect(run('=1E308*10')).toEqual(NUM_ERROR)
    // 加 —— 只修乘法就会漏掉的那一条。
    expect(run('=9E307+9E307')).toEqual(NUM_ERROR)
    // 减 —— 与加法对称，符号相反。
    expect(run('=-9E307-9E307')).toEqual(NUM_ERROR)
    // 除 —— 分母不为零，但商顶破了上界。
    expect(run('=1E308/1E-10')).toEqual(NUM_ERROR)
    // 幂 —— 原本就有闸门，一并钉住免得被「统一」掉。
    expect(run('=10^309')).toEqual(NUM_ERROR)
  })

  test('f64::MAX 本身允许，闸门不能提前一格', () => {
    expect(run('=1.7976931348623157E308*1')).toEqual({
      kind: 'number',
      value: Number.MAX_VALUE,
    })
    expect(run('=1.7976931348623157E308+0')).toEqual({
      kind: 'number',
      value: Number.MAX_VALUE,
    })
    // 差一点点就没有可表示的结果了。
    expect(run('=1.7976931348623157E308*1.0000001')).toEqual(NUM_ERROR)
  })

  test('溢出值照常传播，不会变回一个能参与计算的数', () => {
    expect(run('=(1E308*10)+1')).toEqual(NUM_ERROR)
    expect(run('=(1E308*10)&""')).toEqual(NUM_ERROR)
    expect(run('=ISERROR(1E308*10)')).toEqual({ kind: 'boolean', value: true })
  })
})

describe('下溢 → 0，方向与溢出相反', () => {
  test('下溢不报错', () => {
    expect(run('=1E-200*1E-200')).toEqual({ kind: 'number', value: 0 })
    expect(run('=1E-300/1E100')).toEqual({ kind: 'number', value: 0 })
  })

  test('负数下溢是 -0，数值上等于零', () => {
    const result = run('=-1E-200*1E-200')
    expect(result.kind).toBe('number')
    if (result.kind !== 'number') throw new Error('unreachable')
    // `toBe` 走 `Object.is`，会把 `-0` 和 `0` 判成两个东西 —— 这里要的是**数值
    // 相等**。Excel 没有负零，显示边界由 General 转文本收口成 `'0'`
    // （钉在 `general-text.test.ts`），值这一层保留 IEEE 的 `-0`。
    expect(result.value === 0).toBe(true)
    expect(Number.isFinite(result.value)).toBe(true)
  })
})

describe('除以零保留自己的错误码', () => {
  test('#DIV/0! 不被新闸门吞成 #NUM!', () => {
    expect(run('=1/0')).toEqual({ kind: 'error', code: '#DIV/0!' })
    expect(run('=0/0')).toEqual({ kind: 'error', code: '#DIV/0!' })
  })
})

describe('聚合的累加器同样收口', () => {
  test('SUM —— 注册表侧（标量实参，不走稀疏截流）', () => {
    expect(run('=SUM(9E307,9E307)')).toEqual(NUM_ERROR)
    // 不溢出的对照组：闸门不能把正常聚合也拦下来。
    expect(run('=SUM(1E300,1E300)')).toEqual({ kind: 'number', value: 2e300 })
  })

  test('SUM —— 稀疏孪生（整列引用，evaluate 截流后真正跑的那一份）', () => {
    const cells = numberCells([
      ['A1', 9e307],
      ['A2', 9e307],
      ['B1', 1e300],
      ['B2', 1e300],
    ])
    // 整列引用一定走 `canSparseIterate` 那条路 —— 这才是真实公式路径。
    expect(run('=SUM(A:A)', cells)).toEqual(NUM_ERROR)
    expect(run('=SUM(B:B)', cells)).toEqual({ kind: 'number', value: 2e300 })
  })

  test('PRODUCT —— 连乘比连加更容易顶破', () => {
    expect(run('=PRODUCT(1E300,1E300)')).toEqual(NUM_ERROR)
    expect(run('=PRODUCT(1E150,1E100)')).toEqual({ kind: 'number', value: 1e250 })
  })
})
