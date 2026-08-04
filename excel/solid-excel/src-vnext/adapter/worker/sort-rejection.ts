// 一句话：把引擎的排序拒绝码归一到端口的联合类型。

import type { SortRangeRejectionCode } from '@einfach/spreadsheet-ui-core'

const SORT_REJECTION_CODES: readonly SortRangeRejectionCode[] = [
  'invalid-range',
  'empty-keys',
  'key-out-of-range',
  'spill-in-range',
  'invalid-payload',
  'source-too-large',
  'merge-in-range',
]

/** Guard an engine `detail.code` back onto the port's reject union. */
export function normalizeSortRejectionCode(code: unknown): SortRangeRejectionCode {
  return typeof code === 'string' && (SORT_REJECTION_CODES as readonly string[]).includes(code)
    ? (code as SortRangeRejectionCode)
    : 'invalid-payload'
}
