import type { Value } from '../types'

/** Shared Excel criteria parsing and scalar matching. */

export type Comparator = '=' | '<>' | '<' | '<=' | '>' | '>='

export interface ParsedCriterion {
  readonly op: Comparator
  /** Comparand as a Value — number / string / boolean / blank. */
  readonly target: Value
  /** Set when the criterion is a string whose body contains `*` or `?`. */
  readonly wildcard: boolean
}

/** Split a string criterion into (comparator, rest). Defaults to `=`. */
export function parseStringCriterion(raw: string): { op: Comparator; rest: string } {
  // Order matters — check the two-char operators first.
  if (raw.startsWith('<=')) return { op: '<=', rest: raw.slice(2) }
  if (raw.startsWith('>=')) return { op: '>=', rest: raw.slice(2) }
  if (raw.startsWith('<>')) return { op: '<>', rest: raw.slice(2) }
  if (raw.startsWith('<')) return { op: '<', rest: raw.slice(1) }
  if (raw.startsWith('>')) return { op: '>', rest: raw.slice(1) }
  if (raw.startsWith('=')) return { op: '=', rest: raw.slice(1) }
  return { op: '=', rest: raw }
}

export function parseNumericString(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(trimmed)) return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Convert a Value-shaped criterion into the parsed form. Numeric / boolean
 * / blank criteria become `op:'='` against the original Value. String
 * criteria run through the comparator prefix check; the remainder is
 * coerced to number when possible so `">5"` compares numerically.
 */
export function parseCriterion(criterion: Value): ParsedCriterion | { error: Value } {
  if (criterion.kind === 'error') return { error: criterion }

  if (criterion.kind !== 'string') {
    // Non-string criterion (number, boolean, blank, array) — direct equality
    // against the underlying scalar. Arrays collapse to top-left.
    let target: Value = criterion
    if (criterion.kind === 'array') {
      const row = criterion.value[0]
      target = row && row.length ? row[0] : { kind: 'blank' }
    }
    return { op: '=', target, wildcard: false }
  }

  const { op, rest } = parseStringCriterion(criterion.value)
  // Attempt numeric coercion on the rest. If it parses cleanly, compare
  // numerically; otherwise keep as string.
  const trimmed = rest.trim()
  if (trimmed.length > 0) {
    const n = parseNumericString(trimmed)
    if (n !== undefined) {
      return { op, target: { kind: 'number', value: n }, wildcard: false }
    }
    // "TRUE" / "FALSE" → boolean comparand.
    const u = trimmed.toUpperCase()
    if (u === 'TRUE') return { op, target: { kind: 'boolean', value: true }, wildcard: false }
    if (u === 'FALSE') return { op, target: { kind: 'boolean', value: false }, wildcard: false }
  }
  // Fall through to string comparison.
  //
  // `~` 也算「需要通配符匹配器」的标记，不只是 `*` / `?`：`~` 是转义符，
  // `"~~"` 是**一个字面量 `~`**，只有解码过才知道。原先只测 `[*?]`，于是
  // `COUNTIF(rng,"~~")` 拿 `~~` 原样去比，命中的是内容为 `~~` 的格子而不是
  // 内容为 `~` 的格子 —— 数字看着对（都是 1），命中的格子是错的。
  // 依据：`~` 置于通配符前使其降级为字面 `*` / `?`，`~~` 即字面 `~`。
  const wildcard = /[*?~]/.test(rest)
  return { op, target: { kind: 'string', value: rest }, wildcard }
}

// ---------------------------------------------------------------------------
// Wildcard matching (local copy — by mandate, do not cross-import Wave C3)
// ---------------------------------------------------------------------------

/**
 * Excel wildcard match:
 *   `*` → any run of characters (including empty)
 *   `?` → exactly one character
 *   `~*` / `~?` / `~~` → literal `*` / `?` / `~`
 *
 * Case-insensitive — Excel string comparison is.
 */
export function wildcardMatch(text: string, pattern: string): boolean {
  // Translate to a RegExp. Build the source piece-by-piece so escaping is
  // unambiguous.
  let src = '^'
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '~' && i + 1 < pattern.length) {
      const next = pattern[i + 1]
      if (next === '*' || next === '?' || next === '~') {
        src += escapeRegex(next)
        i++
        continue
      }
      src += escapeRegex(ch)
      continue
    }
    if (ch === '*') {
      src += '.*'
    } else if (ch === '?') {
      src += '.'
    } else {
      src += escapeRegex(ch)
    }
  }
  src += '$'
  return new RegExp(src, 'i').test(text)
}

export function escapeRegex(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Single-value match against a parsed criterion
// ---------------------------------------------------------------------------

/**
 * Test whether `value` satisfies `parsed`. Excel rules:
 *
 *  - Blank cells match `=""`, do **not** match other numeric/string criteria.
 *  - Type mismatches under `=` / `<>` are false / true respectively (a
 *    number cell never equals a string criterion).
 *  - Comparison operators (`<`, `<=`, `>`, `>=`) only work between
 *    numerically-coercible values; otherwise no match.
 *  - String equality is case-insensitive (Excel-compat).
 *
 * 错误格分两档，**取决于判据带不带通配符**，别把两档合并：
 *
 *  - **不带**通配符（`"#N/A"` / `"<>#N/A"`）→ 按**显示文本**参与比较，于是
 *    `"#N/A"` 命中错误格，Excel 的标准错误过滤配方靠的就是这个。
 *  - **带**通配符（`"*"` / `"*N*"`）→ 错误格是**非文本格**，完全不参与匹配，
 *    因此 `"*"` 不命中它、`"<>*"` 命中它。
 *
 * 再往外还有第三档：criteria 实参**本身**求值成错误值 → 在 `parseCriterion`
 * 里原样传播，根本走不到这里。
 */
export function matchesCriterion(cell: Value, parsed: ParsedCriterion): boolean {
  const { op, target, wildcard } = parsed

  // Wildcards only apply with = / <>, only when target is a string.
  if (wildcard && target.kind === 'string' && (op === '=' || op === '<>')) {
    // 通配符判据**只匹配文本格**，非文本格（数字 / 布尔 / 错误 / 空格）一律
    // 不命中，于是 `"*"` 数的正是文本格个数、`"<>*"` 是它的严格补集。
    // 依据：Exceljet「Count cells that contain text」原话 “Empty cells and
    // cells that contain numeric values or errors should not be included in
    // the count.”，同页 `=COUNTIF(data,"<>*")` 在同一个 11 格区域上回 7、
    // `"*"` 回 4 —— 两者严格互补，所以**错误格必须落在 `<>` 那一侧**。
    //
    // 这里曾经写死 `if (cell.kind === 'error') return false`，让错误格 `=` 和
    // `<>` **两侧都不算**，`"*"` 与 `"<>*"` 加起来凑不满整个区域。当时注明
    // 「没有可靠的 Excel 依据」，现在有了，所以那道特判去掉 —— 错误格就是一个
    // 普通的非文本格，和数字、布尔走同一条路。
    if (cell.kind !== 'string') {
      // Wildcard never matches a non-string cell with `=`; the negation of
      // "no match" is "true" under `<>`.
      return op === '<>'
    }
    const hit = wildcardMatch(cell.value, target.value)
    return op === '=' ? hit : !hit
  }

  // 非通配符档：错误格按显示文本参与比较。Excel 里 `COUNTIF(rng,"#DIV/0!")`
  // 数得到错误格，`COUNTIF(rng,"<>#N/A")` 这条标准错误过滤配方也正是靠它成立。
  // 注意与「criteria 实参**本身**求值成错误」区分 —— 那一档在 `parseCriterion`
  // 里就原样传播掉了，根本走不到这里。一个看字符串内容，一个看值的种类。
  const value: Value = cell.kind === 'error' ? { kind: 'string', value: cell.code } : cell

  if (op === '=' || op === '<>') {
    const eq = scalarEquals(value, target)
    return op === '=' ? eq : !eq
  }

  // Ordered comparison — numeric only.
  const vNum = numericComparable(value)
  const tNum = numericComparable(target)
  if (vNum === undefined || tNum === undefined) return false
  switch (op) {
    case '<':
      return vNum < tNum
    case '<=':
      return vNum <= tNum
    case '>':
      return vNum > tNum
    case '>=':
      return vNum >= tNum
  }
}

export function makeCriterionMatcher(
  criterion: Value,
):
  | {
      readonly ok: true
      readonly matches: (value: Value) => boolean
      readonly matchesBlank: boolean
    }
  | {
      readonly ok: false
      readonly error: Value
    } {
  const parsed = parseCriterion(criterion)
  if ('error' in parsed) return { ok: false, error: parsed.error }
  return {
    ok: true,
    // 错误格不再被无条件挡掉 —— 由 `matchesCriterion` 按显示文本判定，于是
    // `"#DIV/0!"` 命中、`">3"` 仍然不命中。
    matches: (value) => matchesCriterion(value, parsed),
    matchesBlank: matchesCriterion({ kind: 'blank' }, parsed),
  }
}

/**
 * AVERAGEIF / AVERAGEIFS 的**值区取数口径**：只认真正的数字。
 *
 * 与 SUMIF 的 `toNumber` 是两档，别合并 —— 求和把空格当 0 加进去无害，平均
 * 却要靠它决定**分母**。Excel 的措辞是 "If a cell in average_range is an
 * empty cell, AVERAGEIF ignores it" 与 "Cells in range that contain TRUE or
 * FALSE are ignored"，等价于「只有 number 格进分子分母」，与裸 `AVERAGE`
 * （`forEachNumericArg`，见 `functions/math.ts`）同一条规则。
 *
 * 事故留痕：这里曾经是 `toNumber`，于是空格 → 0、`TRUE` → 1、文本 `"5"` → 5
 * 全都进了分母。`AVERAGEIF(A1:A3,"")` 因此在 A2 空、B2 空时答 **0**
 * （命中一格、值 0），而 Excel 与本仓 Rust 引擎都是 `#DIV/0!` —— 这两条
 * 看着是两个 bug，其实是同一处口径错误的两个症状。
 *
 * Rust 孪生：`excel/rust/excel-core/src/eval_criteria_blank.rs::number_only`。
 * 稀疏孪生：`sparse-single-criterion.ts` / `sparse-multi-criterion.ts` 的
 * AVERAGEIF(S) 分支 —— 三处必须同改。
 */
export function averageTierNumber(v: Value): number | undefined {
  return v.kind === 'number' ? v.value : undefined
}

/** Coerce to a number for ordered comparison; return undefined if no clean coercion. */
export function numericComparable(v: Value): number | undefined {
  if (v.kind === 'number') return v.value
  if (v.kind === 'boolean') return v.value ? 1 : 0
  if (v.kind === 'string') return parseNumericString(v.value)
  // Blanks / arrays / errors are not ordered against numbers in Excel's
  // criteria semantics.
  return undefined
}

/**
 * Scalar equality used by `=` / `<>`. Numeric criteria coerce numeric
 * strings from cells, matching Excel/Rust COUNTIF-family behavior.
 */
export function scalarEquals(a: Value, b: Value): boolean {
  if (a.kind === 'error' || b.kind === 'error') return false
  if (a.kind === 'blank' && b.kind === 'blank') return true
  if (a.kind === 'blank' && b.kind === 'string' && b.value === '') return true
  if (b.kind === 'blank' && a.kind === 'string' && a.value === '') return true
  if (a.kind === 'blank' || b.kind === 'blank') return false
  if (a.kind === 'number' && b.kind === 'string') return parseNumericString(b.value) === a.value
  if (a.kind === 'string' && b.kind === 'number') return parseNumericString(a.value) === b.value
  if (a.kind !== b.kind) return false
  if (a.kind === 'number' && b.kind === 'number') return a.value === b.value
  if (a.kind === 'boolean' && b.kind === 'boolean') return a.value === b.value
  if (a.kind === 'string' && b.kind === 'string') {
    return a.value.toLowerCase() === b.value.toLowerCase()
  }
  return false
}
