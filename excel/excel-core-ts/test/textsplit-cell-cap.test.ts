/**
 * `TEXTSPLIT` 的**格数闸门** —— 动态数组家族点名单上最后一个漏网。
 *
 * `functions/array.ts` 的那一族（SEQUENCE / EXPAND / WRAPROWS / …）本来就有闸门，
 * TEXTSPLIT 住在 `functions/text/split.ts`，从来没过 `tooLarge()`。Rust 引擎同样
 * 没有，所以两侧同批落 —— 单修一边只会把「都漏」换成「跨引擎分歧」。
 *
 * 为什么它能爆：输出是**两轴分隔符个数之积**，对长度 L 的文本最坏 (L/2)²。
 * 实测 2200 字符（1100 个 `;` + 1100 个 `,`）→ 1101 × 1101 = 1,212,201 格。
 * 注意**输入是线性的**：`rows` 里的片段总数 ≤ L + 行数，二次爆炸只发生在按
 * `maxCols` 补 pad 那一步，所以闸门钉在 `rows.map` 之前就够。
 *
 * **1×N 分支（`row_delim` 缺席）刻意不设闸门**：格数 = 片段数 ≤ L + 1，线性。
 * 本文件把这条也钉住，免得后来人「顺手补全」而与 Rust 侧岔开。
 *
 * **没有用 `array.ts` 的 `tooLarge()`**：那个 helper 还捎带「行/列越网格」两条，
 * 会把 Rust 照收的形状判成错（见下面 `1 × 20001` 那条用例），等于新造分歧；
 * 而「超网格给 `#NUM!` 还是 `#VALUE!`」是两边登记在案的未决分歧，不在这里统一。
 *
 * 与 Rust 侧 `excel/rust/excel-core/tests/textsplit_cell_cap.rs` **同一组输入、
 * 同一组期望**（两个文件的用例一一对应）。TEXTSPLIT 没进
 * `excel/solid-excel/test/cross-engine-parity-*` 那张网 —— 那张网是
 * ~230 格的常开冒烟盘，而钉住「正好 CAP 格必须放行」需要真的物化 1024 × 1024
 * 个溢出格，会把它撑成第二个 scale suite（文件头明令禁止）。对称就靠这对文件。
 */

import { describe, expect, test } from '@jest/globals'

import { FUNCTIONS as TEXT_FUNCTIONS } from '../src/eval/functions/text'
import { FUNCTIONS as ARRAY_FUNCTIONS } from '../src/eval/functions/array'
import { ARRAY_CELL_CAP } from '../src/eval/evaluate'
import type { EvalContext, Value } from '../src/types'

const STR = (value: string): Value => ({ kind: 'string', value })
const NUM = (value: number): Value => ({ kind: 'number', value })
const ERR_VALUE: Value = { kind: 'error', code: '#VALUE!' }

// TEXTSPLIT 不读 ctx；任何读取都是回归。
const ctx: EvalContext = new Proxy(
  {},
  {
    get(_, prop) {
      throw new Error(`TEXTSPLIT unexpectedly read ctx.${String(prop)}`)
    },
  },
) as unknown as EvalContext

const textsplit = (args: Value[]): Value => TEXT_FUNCTIONS.TEXTSPLIT!(args, ctx)

/** 把 `n` 个 `;` 接 `m` 个 `,`：n 个行分隔符切出 n+1 行，末行的 m 个逗号切出 m+1 列。 */
const twoAxis = (rowDelims: number, colDelims: number): Value =>
  STR(';'.repeat(rowDelims) + ','.repeat(colDelims))

/** 结果的「行 × 列」；不是数组就抛，免得错误值被当成形状。 */
function shapeOf(v: Value): readonly [number, number] {
  if (v.kind !== 'array') throw new Error(`expected array, got ${JSON.stringify(v)}`)
  return [v.value.length, v.value[0]?.length ?? 0]
}

/** 错误码，丢掉 message —— 断言只钉码，不钉措辞。 */
function codeOf(v: Value): string {
  return v.kind === 'error' ? v.code : `NOT-AN-ERROR:${v.kind}`
}

const CAP = 1_048_576

describe('TEXTSPLIT 格数闸门 / 二维分支', () => {
  test('上限本身没有漂移', () => {
    // `split.ts` 的 `TEXTSPLIT_CELL_CAP` 抄的就是这个值 —— 环形导入让它导不进来
    // （`split.ts → evaluate.ts → functions/index.ts → text/index.ts` 会炸
    // `Cannot access 'FUNCTIONS' before initialization`），所以拿这条断言兜底。
    // 这条红了 = 有人改了 `ARRAY_CELL_CAP` 而没同步 `split.ts`。
    expect(ARRAY_CELL_CAP).toBe(CAP)
    expect(CAP).toBe(1024 * 1024)
  })

  test('复现用例：2200 字符 → 1101 × 1101 = 1,212,201 格，必须 #VALUE!', () => {
    expect(codeOf(textsplit([twoAxis(1100, 1100), STR(','), STR(';')]))).toBe('#VALUE!')
  })

  test('上限两侧各一步：1024 × 1024 放行，1025 × 1024 拦下', () => {
    expect(shapeOf(textsplit([twoAxis(1023, 1023), STR(','), STR(';')]))).toEqual([1024, 1024])
    expect(codeOf(textsplit([twoAxis(1024, 1023), STR(','), STR(';')]))).toBe('#VALUE!')
  })

  test('与 SEQUENCE 同码 —— 复用同一条上限的证据', () => {
    // 对照 `SEQUENCE(2000,2000)` 而不是 `SEQUENCE(CAP+1)`：后者行数越网格，会踩到
    // 那条未决分歧（本引擎对越网格给 `#NUM!`），对照就不成立了。2000 × 2000 两轴
    // 都在网格内、只有乘积越界，两个引擎都只能走纯格数那条路。
    const sequence = ARRAY_FUNCTIONS.SEQUENCE!([NUM(2000), NUM(2000)], ctx)
    expect(codeOf(sequence)).toBe('#VALUE!')
    expect(codeOf(textsplit([twoAxis(1100, 1100), STR(','), STR(';')]))).toBe(codeOf(sequence))
  })

  test('公式能造出的最坏情形：32766 字符 → 16384 × 16384 = 268,435,456 格', () => {
    // 32767 是 REPT / CONCAT / TEXTJOIN 的硬上限，两轴对半分就是这条。闸门在任何
    // 大分配之前，所以这条应当秒回；跑得慢或者 OOM 就说明闸门位置错了。
    expect(codeOf(textsplit([twoAxis(16383, 16383), STR(','), STR(';')]))).toBe('#VALUE!')
  })

  test('只有乘积越界、两轴各自都在网格内 —— 闸门不依赖网格边界判断', () => {
    // 1101 行 / 1101 列都远小于 1048576 / 16384。
    expect(codeOf(textsplit([twoAxis(1100, 1100), STR(','), STR(';')]))).toBe('#VALUE!')
  })

  test('列数越网格但格数没越：照收，不判错', () => {
    // `row_delim` 一次都没匹配上 → 走的是二维分支，出来却是 1 × 20001。
    // 20001 > 16384（网格列数），但只有 20001 格，远在上限之下。
    // 用 `array.ts` 的 `tooLarge()` 这里会变成错误，而 Rust 侧照收 —— 这条用例
    // 就是「为什么不复用那个 helper」的可执行理由。
    expect(shapeOf(textsplit([STR(','.repeat(20000)), STR(','), STR(';')]))).toEqual([1, 20001])
  })
})

describe('TEXTSPLIT 格数闸门 / 1×N 分支刻意没有闸门', () => {
  test('32767 个逗号 → 1 × 32768，放行', () => {
    expect(shapeOf(textsplit([STR(','.repeat(32767)), STR(',')]))).toEqual([1, 32768])
  })

  test('宿主塞进来的超长文本也只换来线性格数 → 300001 × 1，放行', () => {
    // 顺带钉住 `maxCols` 不能用 `Math.max(1, ...rows.map(...))`：展开成实参的数组
    // 一长就是 `RangeError: Maximum call stack size exceeded`（30 万行即触发），
    // 那是**抛异常**不是错误值，而且发生在闸门之前 —— 闸门就白装了。
    expect(shapeOf(textsplit([STR(';'.repeat(300_000)), STR(','), STR(';')]))).toEqual([300_001, 1])
  })
})

describe('TEXTSPLIT 回归护栏', () => {
  test('闸门不误伤正常用法', () => {
    expect(textsplit([STR('a,b;c,d'), STR(','), STR(';')])).toEqual({
      kind: 'array',
      value: [
        [STR('a'), STR('b')],
        [STR('c'), STR('d')],
      ],
    })
  })

  test('参差行补 pad（默认 #N/A）—— 补齐正是闸门要数的那一步', () => {
    expect(textsplit([STR('a;b,c'), STR(','), STR(';')])).toEqual({
      kind: 'array',
      value: [
        [STR('a'), { kind: 'error', code: '#N/A' }],
        [STR('b'), STR('c')],
      ],
    })
  })

  test('col_delim 必填：1 个实参给 #VALUE!，不是崩溃', () => {
    // Rust 侧修复前这里是 `index out of bounds` panic（WASM 没有 unwinding
    // = 一条公式打死 worker）；本引擎一直是对的，这条钉住它别退化。
    expect(codeOf(textsplit([STR('a')]))).toBe(codeOf(ERR_VALUE))
  })
})
