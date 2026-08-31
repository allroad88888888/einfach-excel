import type { EvalOrigin, StructuredRefResolver } from '../static-formula-eval'
import { parseCellRef, parseRangeRef } from './references'
import type { RangeRef } from './types'
export type Token =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'cell'; ref: { row: number; col: number } }
  | { kind: 'range'; ref: RangeRef }
  | { kind: 'func'; name: string }
  | { kind: 'op'; op: string }
  | { kind: 'cmp'; op: '=' | '<>' | '<' | '<=' | '>' | '>=' }
  | { kind: 'error'; code: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' }

const FUNCTION_NAMES = new Set([
  'SUM',
  'AVERAGE',
  'COUNT',
  'MIN',
  'MAX',
  'IF',
  'SUMIF',
  'COUNTIF',
  'ABS',
  'ROUND',
  'CONCAT',
  'AND',
  'OR',
  'NOT',
  'LEN',
  'LOWER',
  'UPPER',
  'TRIM',
  'SQRT',
  'MOD',
  'VLOOKUP',
  'SUBTOTAL',
])

/** Bare-name literals (no parens) — Excel parity for TRUE/FALSE. */
const BARE_LITERALS: Record<string, number> = {
  TRUE: 1,
  FALSE: 0,
}

/**
 * Error literal tokens — 13 codes aligned with `excel/rust/wasm`
 * `error_token_to_value_error`.
 *
 * A PARSE table, so it is the inverse of the internal vocabulary, not of
 * `errorDisplayToken`. `#TYPE!` and `#ARGS!` stay parse-only aliases: dropping
 * either would stop stored formula text from round-tripping (the engine writes
 * error codes back into formula source on every structural edit), even though
 * nothing ever shows them back to the user.
 */
const ERROR_LITERAL_RE = /^#(NULL!|DIV\/0!|N\/A|REF!|VALUE!|NAME\?|NUM!|CYCLE!|TYPE!|ARGS!|SPILL!|CALC!|BUSY!)/

/**
 * Scan a balanced `[...]` structured-reference suffix starting at
 * `bracketIndex` (which must point at the opening `[`). Handles one level of
 * nesting (`[[ColA]:[ColB]]`). Returns the table name preceding the bracket,
 * the raw inner text, and the index just past the closing `]`; `null` on an
 * unbalanced suffix.
 */
export function scanStructuredRef(
  input: string,
  identStart: number,
  bracketIndex: number,
): { tableName: string; inner: string; endIndex: number } | null {
  let depth = 0
  let j = bracketIndex
  for (; j < input.length; j += 1) {
    const c = input[j]
    if (c === '[') depth += 1
    else if (c === ']') {
      depth -= 1
      if (depth === 0) {
        j += 1
        break
      }
    }
  }
  if (depth !== 0) return null
  return {
    tableName: input.slice(identStart, bracketIndex),
    inner: input.slice(bracketIndex + 1, j - 1),
    endIndex: j,
  }
}

function tokenize(
  input: string,
  resolveStructuredRef?: StructuredRefResolver,
  origin?: EvalOrigin,
): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  /** Push the outcome of one structured reference, or fail the tokenizer. */
  const pushStructured = (tableName: string | null, inner: string): boolean => {
    if (!resolveStructuredRef) return false
    const resolution = resolveStructuredRef(tableName, inner, origin ?? null)
    if (!resolution) return false
    if (resolution.kind === 'range') tokens.push({ kind: 'range', ref: resolution.ref })
    else tokens.push({ kind: 'error', code: resolution.code })
    return true
  }
  while (i < input.length) {
    const ch = input[i]
    if (ch === ' ' || ch === '\t') {
      i += 1
      continue
    }
    // Table-less structured reference written inside a Table's own cells:
    // `[Col]` (whole data column) / `[@Col]` (this row). `[` has no other
    // lexical role here, so a leading `[` is unambiguous — engine parity with
    // the `'[' => parse_table_ref_body(None)` primary arm.
    if (ch === '[') {
      const scanned = scanStructuredRef(input, i, i)
      if (!scanned) return null
      if (!pushStructured(null, scanned.inner)) return null
      i = scanned.endIndex
      continue
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' })
      i += 1
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' })
      i += 1
      continue
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' })
      i += 1
      continue
    }
    if (ch === '"') {
      // String literal — scan until the next unescaped `"`. Excel uses a
      // doubled `""` inside a string to represent a literal quote, which
      // is rarely needed at this scope — we don't support it. A second
      // `"` always closes.
      const start = i + 1
      i += 1
      while (i < input.length && input[i] !== '"') i += 1
      if (input[i] !== '"') return null
      tokens.push({ kind: 'string', value: input.slice(start, i) })
      i += 1
      continue
    }
    // Comparison operators must be matched BEFORE single-char + - * / ^
    // because `>=`, `<=`, `<>` are two-char.
    if (ch === '<') {
      if (input[i + 1] === '=') {
        tokens.push({ kind: 'cmp', op: '<=' })
        i += 2
        continue
      }
      if (input[i + 1] === '>') {
        tokens.push({ kind: 'cmp', op: '<>' })
        i += 2
        continue
      }
      tokens.push({ kind: 'cmp', op: '<' })
      i += 1
      continue
    }
    if (ch === '>') {
      if (input[i + 1] === '=') {
        tokens.push({ kind: 'cmp', op: '>=' })
        i += 2
        continue
      }
      tokens.push({ kind: 'cmp', op: '>' })
      i += 1
      continue
    }
    if (ch === '=') {
      tokens.push({ kind: 'cmp', op: '=' })
      i += 1
      continue
    }
    // `%` rides in the same class as the arithmetic operators even though it
    // is POSTFIX — `parsePercent` is what gives it its Excel binding power.
    if ('+-*/^%'.includes(ch)) {
      tokens.push({ kind: 'op', op: ch })
      i += 1
      continue
    }
    if (ch >= '0' && ch <= '9') {
      const start = i
      while (i < input.length && /[0-9.]/.test(input[i])) i += 1
      const value = Number(input.slice(start, i))
      if (!Number.isFinite(value)) return null
      tokens.push({ kind: 'number', value })
      continue
    }
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '$') {
      const start = i
      while (i < input.length && /[A-Za-z0-9$]/.test(input[i])) i += 1
      // Range syntax requires a colon after the first ref segment.
      if (input[i] === ':') {
        i += 1
        while (i < input.length && /[A-Za-z0-9$]/.test(input[i])) i += 1
        const range = parseRangeRef(input.slice(start, i))
        if (!range) return null
        tokens.push({ kind: 'range', ref: range })
        continue
      }
      // Structured reference: IDENT '[' ... ']' (Excel Table, #32). Combined
      // qualifiers (`[[#Data],[Col]]`) and cross-sheet Table refs are not
      // resolvable in the single-sheet static evaluator — they fall through to
      // an honest `#ERROR!` (via `null`) instead of a faked value.
      if (input[i] === '[') {
        const scanned = scanStructuredRef(input, start, i)
        if (!scanned) return null
        if (!pushStructured(scanned.tableName, scanned.inner)) return null
        i = scanned.endIndex
        continue
      }
      const text = input.slice(start, i).toUpperCase()
      // Function name (followed by '(').
      if (FUNCTION_NAMES.has(text) && input[i] === '(') {
        tokens.push({ kind: 'func', name: text })
        continue
      }
      // Bare TRUE/FALSE → numeric literal (Excel parity).
      if (BARE_LITERALS[text] !== undefined) {
        tokens.push({ kind: 'number', value: BARE_LITERALS[text] })
        continue
      }
      const cell = parseCellRef(text)
      if (cell) {
        tokens.push({ kind: 'cell', ref: cell })
        continue
      }
      return null
    }
    // Error literal — 13 Excel error tokens aligned with excel/rust/wasm.
    if (ch === '#') {
      const match = ERROR_LITERAL_RE.exec(input.slice(i))
      if (match) {
        tokens.push({ kind: 'error', code: match[0] })
        i += match[0].length
        continue
      }
      return null
    }
    return null
  }
  return tokens
}

export { tokenize }
