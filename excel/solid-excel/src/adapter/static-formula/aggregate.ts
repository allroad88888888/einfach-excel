import type { RangeRef } from './types'
import type { Value } from './value'
import { isErr } from './value'
function aggregateNumeric(
  name: string,
  args: Array<Value | RangeRef>,
  resolve: (row: number, col: number) => Value,
): Value {
  const numbers: number[] = []
  for (const arg of args) {
    if (typeof arg === 'object') {
      for (let row = arg.rowStart; row <= arg.rowEnd; row += 1) {
        for (let col = arg.colStart; col <= arg.colEnd; col += 1) {
          const v = resolve(row, col)
          if (typeof v === 'string') {
            if (name === 'COUNT') continue
            if (isErr(v)) return v
            continue
          }
          numbers.push(v)
        }
      }
      continue
    }
    // COUNT 对错误值的态度只有一条：它不是数字，跳过 —— 区域里的格子（上面
    // 那个 `name === 'COUNT'` 分支）如此，直接写进参数表的也如此。这两处必须
    // 对称，否则 `=COUNT(A1:A3)` 与 `=COUNT(#REF!)` 会给出互相矛盾的答案。
    // 依据见 MS 文档 COUNT § Remarks 与 Rust 引擎的 `"COUNT"` 臂（零短路）。
    if (isErr(arg)) {
      if (name === 'COUNT') continue
      return arg
    }
    if (typeof arg === 'number') numbers.push(arg)
  }
  switch (name) {
    case 'SUM':
      return numbers.reduce((a, b) => a + b, 0)
    case 'AVERAGE':
      if (numbers.length === 0) return '#DIV/0!'
      return numbers.reduce((a, b) => a + b, 0) / numbers.length
    case 'COUNT':
      return numbers.length
    case 'MIN':
      return numbers.length === 0 ? 0 : Math.min(...numbers)
    case 'MAX':
      return numbers.length === 0 ? 0 : Math.max(...numbers)
    default:
      return '#ERROR!'
  }
}

export { aggregateNumeric }
