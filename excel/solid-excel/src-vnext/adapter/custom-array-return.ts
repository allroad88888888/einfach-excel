/**
 * 自定义公式**返回二维数组**时的形状闸门（TS 参考引擎侧）。
 *
 * 只做一件事：判定宿主回调交回来的那个 JS 数组能不能当成一个二维、矩形、
 * 尺寸合法的动态数组。判定通过之后交回**原始行**，元素怎么变成引擎的
 * `Value` 由调用方（`worker-runtime-ts.ts` 的 `wrapCustomResult`）负责 ——
 * 那样元素映射只有一套，与标量回程完全共用。
 *
 * 规格是 `excel/rust/excel-core/src/CUSTOM_FORMULAS.md` § "Array returns"，
 * 权威实现是 Rust 侧的 `js_array_to_value`（`excel/rust/wasm/src/lib.rs`）。
 * 本文件是它在 TS 参考引擎上的孪生：**四条规则逐条对齐**，因为一个引擎能
 * 溢出而另一个报错，是跨引擎 parity 里最难查的那种分歧。
 *
 * | 返回 | 结果 |
 * | --- | --- |
 * | `[[1,2],[3,4]]` | 2×2 |
 * | `[[5]]` | 1×1（`=SEQUENCE(1,1)` 同形） |
 * | `[1,2,3]` 一维 | `#VALUE!` —— 不猜行还是列 |
 * | `[[1,2],[3]]` 参差 | `#VALUE!` —— 绝不静默补空 |
 * | `[]` / `[[]]` | `#CALC!` —— 与 FILTER 空结果同一个答案 |
 * | `[[[1]]]` 三维 | `#VALUE!` —— 单元格只能装标量 |
 * | > 1_048_576 格 | `#VALUE!` |
 *
 * 与 Rust 的唯一差别是**诊断通道**：那边单元格只承载一个 token，细节只能
 * 走 `console.warn`；这边引擎的错误 `Value` 自带 `message` 字段（`{ kind:
 * 'error', code, message }`，与回调 throw 的处理同一个写法），所以理由直接
 * 挂在值上，不再往 worker 控制台里塞东西。单元格显示的 token 两侧一致。
 */

import { EXCEL_MAX_ROW } from '@einfach/excel-core-ts'

/**
 * 数组回程的格数上限。
 *
 * 复用引擎自己的口径而不是自创常数：Rust 侧用 `DYNAMIC_ARRAY_CELL_CAP`
 * （`SEQUENCE` / `MAKEARRAY` / `MAP` / `MMULT` 共用的那一个）。TS 引擎里
 * 数值相同的那两个常数（`eval/evaluate.ts` 的 `ARRAY_CELL_CAP`、
 * `eval/functions/array.ts` 的 `MAX_ARRAY_CELLS`）都是模块私有、没有从
 * `@einfach/excel-core-ts` 导出，所以这里从**已导出**的 `EXCEL_MAX_ROW`
 * 推出同一个数（Excel 最大行数 1_048_576 = `EXCEL_MAX_ROW` + 1，正是那两个
 * 私有常数各自的来历），而不是再写死第三份字面量。
 */
export const CUSTOM_ARRAY_CELL_CAP = EXCEL_MAX_ROW + 1

/** 闸门放行：交回原始行，元素映射留给调用方。 */
export interface CustomArrayAccepted {
  readonly ok: true
  readonly rows: readonly unknown[][]
}

/** 闸门拒绝：`code` 是单元格要显示的 token，`message` 是给宿主的理由。 */
export interface CustomArrayRejected {
  readonly ok: false
  readonly code: '#VALUE!' | '#CALC!'
  readonly message: string
}

export type CustomArrayGateResult = CustomArrayAccepted | CustomArrayRejected

const reject = (code: '#VALUE!' | '#CALC!', message: string): CustomArrayRejected => ({
  ok: false,
  code,
  message,
})

/**
 * 判定一个自定义公式返回的 JS 数组。
 *
 * 闸门顺序是刻意的：**先读 length 判尺寸，再遍历行**。宿主可以返回一个
 * 只有 length 很大的稀疏数组（`const a = [[1]]; a.length = 2_000_000`），
 * 若先遍历再判尺寸，一次拼错的返回值就能让 worker 白走两百万轮。
 */
export function gateCustomArrayReturn(outer: readonly unknown[]): CustomArrayGateResult {
  const rows = outer.length
  if (rows === 0) {
    return reject('#CALC!', 'custom formula returned an empty array')
  }

  // 列数以第 0 行为准。第 0 行不是数组 = 宿主交回了一维数组：不替它猜行
  // 还是列 —— 入参方向（`unwrapForCustom`）从不产生一维，猜就是第二套映射，
  // 而且猜错要到渲染时才看得出来。
  const first = outer[0]
  if (!Array.isArray(first)) {
    return reject(
      '#VALUE!',
      'custom formula returned a 1-D array; wrap it as [[a,b,c]] for a row or [[a],[b],[c]] for a column',
    )
  }
  const cols = first.length
  if (cols === 0) {
    return reject('#CALC!', 'custom formula returned an empty array')
  }

  if (rows * cols > CUSTOM_ARRAY_CELL_CAP) {
    return reject(
      '#VALUE!',
      `custom formula returned a ${rows}x${cols} array (${rows * cols} cells) exceeding the ${CUSTOM_ARRAY_CELL_CAP} cell cap`,
    )
  }

  const accepted: unknown[][] = []
  for (let r = 0; r < rows; r++) {
    const row = outer[r]
    if (!Array.isArray(row)) {
      return reject('#VALUE!', `custom formula returned a ragged array: row ${r} is not an array`)
    }
    if (row.length !== cols) {
      return reject(
        '#VALUE!',
        `custom formula returned a ragged array: row ${r} has ${row.length} cells, expected ${cols}`,
      )
    }
    for (let c = 0; c < cols; c++) {
      // 深度：元素本身又是数组说明嵌套超过二维。单元格只能装标量。
      if (Array.isArray(row[c])) {
        return reject(
          '#VALUE!',
          `custom formula returned a nested array at (${r},${c}); cells must be scalars`,
        )
      }
    }
    accepted.push(row)
  }
  return { ok: true, rows: accepted }
}
