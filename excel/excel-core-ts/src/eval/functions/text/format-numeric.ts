/**
 * 以 Excel 的"半远离零"舍入把数值渲染成记数字符串（定点、千分位、科学计数、分数）。
 */

export function insertCommas(digits: string, separator = ','): string {
  if (separator === '') return digits
  // We replace the implicit comma with the locale separator on the
  // already-built string so the regex (which expects digit boundaries
  // only) keeps working regardless of separator width.
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
}

// Type alias used by the TEXT format engine to pipe locale separators
// through without sprawling the helper signatures.
export type NumberSeparators = { readonly thousand: string; readonly decimal: string }

/**
 * Render fixed decimals with Excel-style half-away-from-zero rounding. We
 * never apply grouping here — the `#,##0` / `#,##0.00` cases above thread
 * grouping through `formatThousands` instead.
 */
export function formatFixedDecimal(n: number, decimals: number, decimalSep: string): string {
  const sign = n < 0 ? '-' : ''
  const raw = `${sign}${formatAbsFixedDecimal(Math.abs(n), decimals)}`
  if (decimalSep === '.') return raw
  return raw.replace('.', decimalSep)
}

export function roundHalfAwayFromZero(n: number): number {
  return n < 0 ? -Math.round(Math.abs(n)) : Math.round(n)
}

function roundScaledHalfAwayFromZero(abs: number, decimals: number): number {
  const factor = 10 ** decimals
  const scaled = abs * factor
  if (!Number.isFinite(scaled) || Math.abs(scaled) > Number.MAX_SAFE_INTEGER) {
    return Math.round(scaled)
  }
  const lower = Math.floor(scaled)
  const half = lower + 0.5
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4
  const adjusted = Math.abs(scaled - half) <= tolerance ? half : scaled
  return Math.round(adjusted)
}

export function formatAbsFixedDecimal(abs: number, decimals: number): string {
  const rounded = roundScaledHalfAwayFromZero(abs, decimals)
  const factor = 10 ** decimals
  if (!Number.isSafeInteger(rounded) || !Number.isSafeInteger(factor)) {
    return (rounded / factor).toFixed(decimals)
  }
  if (decimals === 0) return String(rounded)
  const whole = Math.floor(rounded / factor)
  const frac = String(rounded % factor).padStart(decimals, '0')
  return `${whole}.${frac}`
}

function roundDecimalHalfAwayFromZero(n: number, decimals: number): number {
  const sign = n < 0 ? -1 : 1
  return sign * roundScaledHalfAwayFromZero(Math.abs(n), decimals) / 10 ** decimals
}

export function formatTextScientific(n: number, format: string): string | undefined {
  const match = /^(0)(?:\.(0+))?([Ee])\+(0+)$/.exec(format)
  if (!match) return undefined
  if (!Number.isFinite(n)) return undefined
  const decimals = match[2]?.length ?? 0
  const exponentChar = match[3]
  const exponentWidth = match[4].length
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs === 0) {
    const mantissa = decimals > 0 ? `0.${'0'.repeat(decimals)}` : '0'
    return `${mantissa}${exponentChar}+${'0'.repeat(exponentWidth)}`
  }
  let exponentValue = Math.floor(Math.log10(abs))
  let mantissaValue = abs / 10 ** exponentValue
  mantissaValue = roundDecimalHalfAwayFromZero(mantissaValue, decimals)
  if (mantissaValue >= 10) {
    mantissaValue /= 10
    exponentValue += 1
  }
  const mantissa = formatAbsFixedDecimal(mantissaValue, decimals)
  const exponentSign = exponentValue < 0 ? '-' : '+'
  const exponent = String(Math.abs(exponentValue)).padStart(exponentWidth, '0')
  return `${sign}${mantissa}${exponentChar}${exponentSign}${exponent}`
}

export function formatTextFraction(n: number, format: string): string | undefined {
  const match = /^# (\?+)\/(\?+)$/.exec(format)
  if (!match) return undefined
  if (!Number.isFinite(n)) return undefined
  const numeratorWidth = match[1].length
  const denominatorWidth = match[2].length
  if (numeratorWidth !== denominatorWidth) return undefined

  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  let whole = Math.floor(abs)
  const frac = abs - whole
  if (frac === 0) return `${sign}${whole}`

  const maxDenominator = 10 ** denominatorWidth - 1
  const approx = approximateFraction(frac, maxDenominator)
  if (approx.numerator === 0) return `${sign}${whole}`
  if (approx.numerator === approx.denominator) {
    whole += 1
    return `${sign}${whole}`
  }

  const numerator = approx.numerator.toString().padStart(numeratorWidth, ' ')
  const denominator = approx.denominator.toString().padStart(denominatorWidth, ' ')
  if (whole === 0) return `${sign} ${numerator}/${denominator}`
  return `${sign}${whole} ${numerator}/${denominator}`
}

function approximateFraction(value: number, maxDenominator: number): {
  readonly numerator: number
  readonly denominator: number
} {
  let bestNumerator = 0
  let bestDenominator = 1
  let bestError = Math.abs(value)
  for (let denominator = 1; denominator <= maxDenominator; denominator += 1) {
    const numerator = Math.round(value * denominator)
    const error = Math.abs(value - numerator / denominator)
    if (error < bestError - 1e-12) {
      bestError = error
      bestNumerator = numerator
      bestDenominator = denominator
    }
  }
  return { numerator: bestNumerator, denominator: bestDenominator }
}

/**
 * Format a number with thousands separators and a fixed decimal count.
 *
 * Optional `separators` lets TEXT swap the en-US `, .` defaults for the
 * active workbook locale. The format string the user supplied (e.g.
 * `#,##0.00`) is parsed as Excel literals — the comma/dot in the format
 * are *placeholder markers*, not the output characters — so we always
 * substitute the locale's actual separators on the way out.
 */
export function formatThousands(
  n: number,
  decimals: number,
  separators: { readonly thousand: string; readonly decimal: string } = { thousand: ',', decimal: '.' },
): string {
  const negative = n < 0
  const abs = Math.abs(n)
  const rounded = formatAbsFixedDecimal(abs, decimals)
  const [intPart, decPart] = rounded.split('.')
  // Insert commas every 3 digits from the right, then map them to the
  // locale's actual group separator.
  const withCommas = insertCommas(intPart, separators.thousand)
  const body = decPart !== undefined ? `${withCommas}${separators.decimal}${decPart}` : withCommas
  return negative ? `-${body}` : body
}
