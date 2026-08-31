type Value = number | string

function isErr(v: Value): boolean {
  return typeof v === 'string' && v.startsWith('#')
}

/**
 * Excel's ARITHMETIC operand coercion — the static twin of the two real
 * engines' rule (`coerce_text_to_number` in excel/rust/excel-core/src/eval.rs,
 * `toNumber` in excel/excel-core-ts/src/eval/coerce.ts). Returns a number, or
 * the error code the operator must answer with.
 *
 * Order matters: the empty-string guard runs BEFORE `Number()`, because
 * `Number('')` is `0` — without it `=1+""` answers `1` where Excel and both
 * engines answer `#VALUE!`.
 *
 * Only ARITHMETIC coerces. `combineCompare` deliberately does not: Excel
 * orders text above numbers rather than parsing it, so `="5"=5` stays false.
 */
function coerceNumber(v: Value): number | string {
  if (typeof v === 'number') return v
  if (isErr(v)) return v
  const trimmed = v.trim()
  if (trimmed.length === 0) return '#VALUE!'
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : '#VALUE!'
}

function isTruthy(v: Value): boolean {
  if (isErr(v)) return false
  if (typeof v === 'number') return v !== 0
  // After number narrowing, v is string. Non-error strings are truthy if
  // non-empty and not literally "false" (case-insensitive).
  const str = v as string
  return str.length > 0 && str.toLowerCase() !== 'false'
}

export { coerceNumber, isErr, isTruthy }
export type { Value }
