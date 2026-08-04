/** Numeric values and spreadsheet errors used by engineering functions. */

import type { Value } from '../../../types'

export const NUM = (n: number): Value => ({ kind: 'number', value: n })
export const ERR = (
  code: '#DIV/0!' | '#N/A' | '#NUM!' | '#VALUE!',
  message?: string,
): Value => (message ? { kind: 'error', code, message } : { kind: 'error', code })
