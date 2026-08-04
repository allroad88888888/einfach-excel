/** Shared Value constructors for math functions. */

import type { Value } from '../../../types'

export const ERR = (code: '#DIV/0!' | '#N/A' | '#NUM!' | '#VALUE!', message?: string): Value =>
  message === undefined ? { kind: 'error', code } : { kind: 'error', code, message }

export const NUM = (value: number): Value => ({ kind: 'number', value })
