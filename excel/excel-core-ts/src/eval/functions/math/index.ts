/** Math function registry assembled from cohesive families. */

import type { FunctionImpl } from '../../../types'
import { FUNCTIONS as AGGREGATION_FUNCTIONS } from './aggregation'
import { FUNCTIONS as ROUNDING_FUNCTIONS } from './rounding'
import { FUNCTIONS as ARITHMETIC_FUNCTIONS } from './arithmetic'
import { FUNCTIONS as TRIGONOMETRY_FUNCTIONS } from './trigonometry'
import { FUNCTIONS as ADVANCED_ROUNDING_FUNCTIONS } from './advanced-rounding'
import { FUNCTIONS as COMBINATORICS_FUNCTIONS } from './combinatorics'
import { FUNCTIONS as RADIX_PAIR_FUNCTIONS } from './radix-and-pairs'
import { FUNCTIONS as MATRIX_FUNCTIONS } from './matrix'
import { FUNCTIONS as INTEGER_SERIES_FUNCTIONS } from './integer-series'
import { FUNCTIONS as SUBTOTAL_FUNCTIONS } from './subtotal'

export type { SubtotalErrorMode } from './subtotal'

// Public function-level compatibility exports.
export { MROUND, QUOTIENT, EVEN, ODD, FLOOR_MATH, CEILING_MATH, FLOOR_PRECISE, CEILING_PRECISE, ISO_CEILING } from './advanced-rounding'
export { SUM, AVERAGE, COUNT, COUNTA, MIN, MAX } from './aggregation'
export { CEILING, FLOOR, TRUNC, SUMPRODUCT, PRODUCT } from './arithmetic'
export { FACT, FACTDOUBLE, COMBIN, PERMUT, COMBINA, PERMUTATIONA, MULTINOMIAL } from './combinatorics'
export { GCD, LCM, COUNTBLANK, SUMSQ, SERIESSUM } from './integer-series'
export { MUNIT, MMULT, MDETERM, MINVERSE } from './matrix'
export { BASE, DECIMAL, SUMX2MY2, SUMX2PY2, SUMXMY2 } from './radix-and-pairs'
export { ROUND, ROUNDUP, ROUNDDOWN, INT, MOD, ABS, POWER, SQRT, SIGN } from './rounding'
export { SUBTOTAL, AGGREGATE, SQRTPI } from './subtotal'
export { SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2, SINH, COSH, TANH, ASINH, ACOSH, ATANH, CSC, SEC, COT, CSCH, SECH, COTH, ACSC, ASEC, ACOT, ACOTH, RADIANS, DEGREES, EXP, LN, LOG10, LOG, PI, RAND, RANDBETWEEN } from './trigonometry'

export const FUNCTIONS: Record<string, FunctionImpl> = {
  ...AGGREGATION_FUNCTIONS,
  ...ROUNDING_FUNCTIONS,
  ...ARITHMETIC_FUNCTIONS,
  ...TRIGONOMETRY_FUNCTIONS,
  ...ADVANCED_ROUNDING_FUNCTIONS,
  ...COMBINATORICS_FUNCTIONS,
  ...RADIX_PAIR_FUNCTIONS,
  ...MATRIX_FUNCTIONS,
  ...INTEGER_SERIES_FUNCTIONS,
  ...SUBTOTAL_FUNCTIONS,
}
