/** Registry of engineering spreadsheet functions. */

import type { FunctionImpl } from '../../../types'
import { FUNCTIONS as baseConversions } from './base-conversions'
import { FUNCTIONS as bitwise } from './bitwise'
import { FUNCTIONS as besselJy } from './bessel-jy'
import { FUNCTIONS as besselIk } from './bessel-ik'
import { FUNCTIONS as erf } from './erf'
import { FUNCTIONS as units } from './units'
import { FUNCTIONS as complexOperations } from './complex-operations'
import { FUNCTIONS as complexTrigonometry } from './complex-trigonometry'

// Public function-level compatibility exports.
export { DEC2BIN, DEC2OCT, DEC2HEX, BIN2DEC, OCT2DEC, HEX2DEC, BIN2HEX, BIN2OCT, HEX2BIN, HEX2OCT, OCT2BIN, OCT2HEX } from './base-conversions'
export { BESSELI, BESSELK } from './bessel-ik'
export { BESSELJ, BESSELY } from './bessel-jy'
export { BITAND, BITOR, BITXOR, BITLSHIFT, BITRSHIFT, DELTA, GESTEP } from './bitwise'
export { COMPLEX, IMABS, IMAGINARY, IMREAL, IMARGUMENT, IMCONJUGATE, IMSUM, IMSUB, IMPRODUCT, IMDIV, IMEXP, IMLN, IMLOG10, IMLOG2, IMSQRT, IMPOWER } from './complex-operations'
export { IMCOS, IMCOSH, IMSIN, IMSINH, IMTAN, IMSEC, IMCSC, IMCOT, IMSECH, IMCSCH } from './complex-trigonometry'
export { ERF, ERF_PRECISE, ERFC, ERFC_PRECISE } from './erf'
export { CONVERT } from './units'

export const FUNCTIONS: Record<string, FunctionImpl> = {
  ...baseConversions,
  ...bitwise,
  ...besselJy,
  ...besselIk,
  ...erf,
  ...units,
  ...complexOperations,
  ...complexTrigonometry,
}
