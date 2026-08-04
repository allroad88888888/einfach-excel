/**
 * `cross-engine-parity-omitted-args.test.ts` 的夹具、逐条期望值与它们的依据。
 *
 * 与规格分家的理由和 `cross-engine-parity-cross-sheet.ts` /
 * `cross-engine-parity-spill-order.ts` 同一个：规格那边只留「问什么问题」，
 * 这边留「答案是什么、凭什么是这个答案」。逐条注释就是这份文件的正文。
 */
import type { WorkloadCell } from './cross-engine-parity-engines'
import { a1 } from './parity-seed'

/** F1:F5 = 1..5、G1:G5 = 10..50 —— 与两个引擎的引擎侧套件同一份夹具。 */
export const FIXTURE: WorkloadCell[] = []
for (let r = 0; r < 5; r += 1) {
  FIXTURE.push({ kind: 'number', value: r + 1, row: r, col: 5 })
  FIXTURE.push({ kind: 'number', value: (r + 1) * 10, row: r, col: 6 })
}

/**
 * 标量公式一格一行装在 J 列（col 9）。溢出公式另外安置 —— 挨着写会互相撞成
 * `#SPILL!`，那是溢出闸门在说话，不是空占位的问题。
 */
export const SCALAR_CASES: ReadonlyArray<readonly [formula: string, display: string]> = [
  // 聚合与数值：空槽就是一个空值，不进分母也不当 0 参与。
  ['=SUM(1,,2)', '3'],
  ['=SUM(,)', '0'],
  ['=SUM(1,)', '1'],
  ['=COUNT(1,,3)', '2'],
  ['=MAX(1,,5)', '5'],
  ['=CONCAT(1,,2)', '12'],
  ['=ROUND(3.14159,)', '3'],
  ['=TEXTJOIN(",",,1,2)', '1,2'],
  // AGGREGATE 的 options 空 ⇒ 0（不忽略任何东西）。
  ['=AGGREGATE(9,,F1:F5)', '15'],
  // 查找家族。
  ['=VLOOKUP(3,F1:G5,2,)', '30'],
  ['=HLOOKUP(1,F1:G5,2,)', '2'],
  ['=MATCH(3,F1:F5,)', '3'],
  ['=XMATCH(3,F1:F5,)', '3'],
  ['=OFFSET(F1,1,)', '2'],
  ['=OFFSET(F1,,1)', '10'],
  ['=RANK(3,F1:F5,)', '3'],
  // 报障的这一条：省略 if_not_found 同时给 match_mode。
  ['=XLOOKUP(3,F1:F5,G1:G5,,-1)', '30'],
  ['=XLOOKUP(3,F1:F5,G1:G5,,,-1)', '30'],
  ['=XLOOKUP(3,F1:F5,G1:G5,)', '30'],
  ['=XLOOKUP(0,F1:F5,G1:G5,"nf",-1)', 'nf'],
  // 空的 if_not_found 等同「没提供」⇒ #N/A，不是把空值当兜底结果交出去。
  ['=XLOOKUP(0,F1:F5,G1:G5,,-1)', '#N/A'],
  // 结果**是**空值时保持空值。与 `=IF(TRUE,Z99,5)` 同款，属于显示层约定，
  // 不是空占位的问题（Excel 这几格显示 0，两个引擎一致地显示空）。
  ['=IF(TRUE,,5)', ''],
  ['=IF(FALSE,,5)', '5'],
  ['=IFERROR(1/0,)', ''],
  ['=CHOOSE(2,1,,3)', ''],
  ['=LEFT("abc",)', ''],
  ['=MID("abcdef",2,)', ''],
  // 数组字面量与联合区域**不接受**空槽 —— Excel 那两处也不接受，
  // 两个引擎都保持解析错误，没顺手放宽。
  ['={1,,2}', '#VALUE!'],
  ['=AREAS((F1:F5,))', '#VALUE!'],
  // ISOMITTED 问的是「**形参**有没有拿到实参」，不是「值是不是空」。
  // `(5,)` 传了一个空值进去 ⇒ 拿到了 ⇒ FALSE；`(5)` 少传 ⇒ TRUE。
  ['=LAMBDA(x,y,IF(ISOMITTED(y),100,200))(5)', '100'],
  ['=LAMBDA(x,y,IF(ISOMITTED(y),100,200))(5,)', '200'],
  ['=LAMBDA(x,y,IF(ISOMITTED(y),100,200))(5,7)', '200'],
  // LAMBDA 之外没有形参可问 ⇒ #NAME?。
  ['=ISOMITTED(123)', '#NAME?'],
  ['=LET(a,1,ISOMITTED(a))', '#NAME?'],
]

export const SCALAR_ADDRS = SCALAR_CASES.map((_, i) => a1(i, 9))
export const EXPECTED_SCALAR_DISPLAYS = SCALAR_CASES.map(([, display]) => display)

/**
 * 溢出公式：锚点列与读回的投影地址。列距 4 是给最宽的 `TEXTSPLIT`（3 列）
 * 留位置。
 */
export const SPILL_CASES: ReadonlyArray<{
  readonly formula: string
  readonly col: number
  readonly cells: ReadonlyArray<readonly [row: number, col: number]>
  readonly displays: readonly string[]
}> = [
  {
    // `=SORT(区域,,-1)` 是 Excel 里最常见的降序写法。sort_index 空 ⇒ 1，
    // 强转 0 会撞上「必须 ≥ 1」的校验判成 `#VALUE!` —— 这一条是本类的
    // 主证据，两侧的修法都必须是「取默认值」而不是「强转」。
    formula: '=SORT(F1:F5,,-1)',
    col: 12,
    cells: [
      [0, 12],
      [1, 12],
      [2, 12],
      [3, 12],
      [4, 12],
    ],
    displays: ['5', '4', '3', '2', '1'],
  },
  {
    formula: '=SEQUENCE(2,,)',
    col: 16,
    cells: [
      [0, 16],
      [1, 16],
    ],
    displays: ['1', '2'],
  },
  {
    formula: '=FILTER(F1:F5,F1:F5>3,)',
    col: 20,
    cells: [
      [0, 20],
      [1, 20],
    ],
    displays: ['4', '5'],
  },
  {
    // ignore_empty 空 ⇒ FALSE（空片段保留）。中间那格是空串而不是消失。
    formula: '=TEXTSPLIT("a,,b",",",,)',
    col: 24,
    cells: [
      [0, 24],
      [0, 25],
      [0, 26],
    ],
    displays: ['a', '', 'b'],
  },
]

export const SPILL_ADDRS = SPILL_CASES.flatMap((c) => c.cells.map(([r, col]) => a1(r, col)))
export const EXPECTED_SPILL_DISPLAYS = SPILL_CASES.flatMap((c) => c.displays)

/**
 * 两个引擎目前答得**不一样**的格子。每条都注明了根因与反证 —— 没有一条是
 * 空占位造成的，所以修空占位不该动它们。
 */
export const DIVERGENT_CASES: ReadonlyArray<{
  readonly formula: string
  readonly ts: string
  readonly wasm: string
  readonly why: string
}> = [
  // ── 空值该不该参与计算：TS 把它当 0 算进去了，Rust 与 Excel 都跳过 ──
  //
  // 反证：`=AVERAGE(1,Z99,3)`（Z99 是空格，一个空占位都没有）在 TS 侧同样
  // 是 1.333…。所以根因是 TS 聚合函数对**空值**的处理，不是空占位的解析。
  // Excel 的答案是 Rust 这一列：空格不进 AVERAGE 的分母、不当 PRODUCT 的
  // 因子、不当 MIN 的候选。修的时候要动的是 TS 侧的聚合口径。
  { formula: '=AVERAGE(1,,3)', ts: '1.33333333333333', wasm: '2', why: 'TS 把空值计入分母' },
  { formula: '=PRODUCT(2,,3)', ts: '0', wasm: '6', why: 'TS 把空值当 0 乘进去' },
  { formula: '=MIN(1,,5)', ts: '0', wasm: '1', why: 'TS 把空值当 0 参与取最小' },
  // ── 「取默认值」按语法判还是按值判：指向空格的引用算不算「没提供」 ──
  //
  // 空占位 `,,` 两侧一致（上面两组已钉）。分歧只出现在**指向空格的引用**
  // 上：TS 按**值**判（`value.kind === 'blank'` 就当没提供），Rust 按
  // **语法**判（只有 `Expr::Omitted` 才算）。
  //
  // Rust 这一侧与 Excel 一致：空格引用是提供了一个值，数值语境下强转 0。
  // 按值判还会让**不含 `,,` 的公式**改行为 —— Rust 侧试过一版，
  // `excel/rust/excel-core/tests/golden_replay.rs` 的漂移哨兵当场抓到
  // （seed 11 第 853 行的 `=SEQUENCE(3,1,F11)`：0/1/2 变成了 1/2/3）。
  {
    formula: '=XLOOKUP(0,F1:F5,G1:G5,Z99,-1)',
    ts: '#N/A',
    wasm: '',
    why: 'if_not_found 指向空格：TS 当「没提供」给 #N/A，Rust 原样交出空值',
  },
  {
    formula: '=SEQUENCE(3,1,Z99)',
    ts: '1',
    wasm: '0',
    why: 'start 指向空格：TS 取默认 1，Rust 与 Excel 一样强转 0',
  },
  {
    formula: '=XLOOKUP(3,F:F,G:G,,-1)',
    ts: '30',
    wasm: '#VALUE!',
    // 反证：`=XLOOKUP(3,F:F,G:G)`（一个空占位都没有）在 Rust 侧同样
    // `#VALUE!`，而 `=SUM(F:F)` 是对的 —— 整轴引用喂给 XLOOKUP 这条路
    // 本身就断，与空占位无关。
    why: 'Rust 侧整轴引用 + XLOOKUP 的既有缺陷，不写空占位也一样',
  },
  {
    formula: '=INDEX(F1:G5,2,)',
    ts: '2',
    wasm: '2',
    // 这一行两列相同**是刻意的**：分歧在溢出宽度上（TS 溢出 {2,20} 两格，
    // Rust 只给一格），而这里读的是锚点格，两侧都是 2。留在这一组是为了钉住
    // 「Rust 至少解析得出来」，真正的宽度分歧读不到。反证：`=INDEX(F1:G5,2,0)`
    // 在 Rust 侧同样只给一格，所以根因是 INDEX 的整行返回未实现，不是空占位。
    why: 'Rust 侧 INDEX 的整行返回未实现（col=0 也一样）；锚点格相同，宽度分歧此处读不到',
  },
  {
    formula: '=WEEKDAY(45000,)',
    ts: '#NUM!',
    wasm: '#VALUE!',
    // 两侧都与 Excel 不符（Excel: 2，return_type 空 ⇒ 默认 1），而且错得
    // 不一样。要修得两侧一起修，单边修只会把分歧换个形状。
    why: '两侧都把空的 return_type 当 0，Excel 是「取默认值 1」；错法还不同',
  },
  {
    formula: '=SUMPRODUCT(F1:F5,)',
    ts: '0',
    wasm: '#VALUE!',
    why: '空实参当成 0 标量还是形状不匹配，两侧口径不同；与 Excel 的答案另需核对',
  },
]

/**
 * 行距 4：这一组里有会**溢出**的公式（`=SEQUENCE(3,1,Z99)` 占 3 行），挨着
 * 写会撞成 `#SPILL!` —— 那时候读到的是溢出闸门在说话，不是这一条要钉的分歧。
 */
export const DIVERGENT_ADDRS = DIVERGENT_CASES.map((_, i) => a1(i * 4, 30))
