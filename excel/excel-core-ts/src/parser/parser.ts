/**
 * Pratt parser — consumes the `Token[]` from `./tokenizer.ts` and produces
 * an `Expr` tree matching the discriminated union in `../types.ts` §5.
 *
 * Operator precedence (Excel, high → low):
 *   1. unary `+` / `-`             (prefix)
 *   2. postfix `%`
 *   3. `^`                         (right-assoc)
 *   4. `*` / `/`
 *   5. `+` / `-`                   (binary)
 *   6. `&`
 *   7. `=` / `<>` / `<` / `<=` / `>` / `>=`
 *
 * The Pratt loop encodes precedence by binding-power: a left-hand side
 * stops absorbing operators when the next op's left-binding-power is less
 * than or equal to the current "min bp". Right-associative ops (`^`) advance
 * with a slightly lower right-bp so the left side keeps absorbing.
 *
 * The parser is **total** — every internal failure is encoded as a thrown
 * `ParseError`; the wrapper in `./index.ts` catches and surfaces an
 * `ErrorLiteral` AST node so the public `parseFormula` never throws.
 */

import type {
  Expr,
  DynamicRangeExpr,
  SpillReferenceExpr,
  RangeExpr,
  ReferenceExpr,
  CallExpr,
  CrossSheetExpr,
  LambdaCallExpr,
  MultiAreaExpr,
  ArrayLiteralExpr,
  BinaryOp,
} from '../types'
import type { OpLexeme, Token } from './tokenizer'

/** Internal exception used to abort parsing on a structural error. */
export class ParseError extends Error {
  constructor(message: string, public pos: number) {
    super(message)
    this.name = 'ParseError'
  }
}

class TokenCursor {
  constructor(public tokens: Token[], public i = 0) {}

  peek(offset = 0): Token {
    return this.tokens[this.i + offset] ?? { kind: 'eof', pos: -1 }
  }

  next(): Token {
    const t = this.tokens[this.i] ?? { kind: 'eof', pos: -1 }
    if (this.tokens[this.i]) this.i += 1
    return t
  }

  consume(kind: Token['kind']): Token {
    const t = this.peek()
    if (t.kind !== kind) {
      throw new ParseError(`expected ${kind}, got ${t.kind}`, t.pos)
    }
    return this.next()
  }

  eof(): boolean {
    return this.peek().kind === 'eof'
  }
}

// ---- binding powers ----

/** left-bp, right-bp; left-bp 0 means "stop here". */
function infixBindingPower(op: OpLexeme): [number, number] {
  switch (op) {
    case '=':
    case '<>':
    case '<':
    case '<=':
    case '>':
    case '>=':
      return [10, 11]
    case '&':
      return [20, 21]
    case '+':
    case '-':
      return [30, 31]
    case '*':
    case '/':
      return [40, 41]
    case '^':
      return [60, 59] // right-assoc: right-bp < left-bp
  }
}

// The three bands above `^` (left-bp 60), ordered exactly as Excel's operator
// table does: reference operators > unary `-` > `%` > `^`. Both of the
// non-reference ones USED to sit below 60 (50 / 55), which cost two defects:
// `=-2^2` parsed as `-(2^2)` = -4 where Excel and the Rust engine say
// `(-2)^2` = 4, and `=2^2%` left the `%` unconsumed (→ `unexpected trailing
// token percent` → `#VALUE!`) where both say `2^(2%)` = 2^0.02.
const POSTFIX_BP = 62 // `%` — above `^`, below unary
const PREFIX_BP = 64 // unary `+`/`-` — above `%`, below the reference operators
const RANGE_BP = 65 // reference range operator binds tighter than scalar infix ops
const CALL_BP = 70 // expression-level LAMBDA calls bind tighter than all infix ops
const SPILL_BP = 75 // spill references are syntactic anchors, not scalar arithmetic

// ---- entry ----

export function parseTokens(tokens: Token[]): Expr {
  // Surface tokenizer errors as parse errors so the wrapper turns them
  // into an ErrorLiteral.
  for (const tok of tokens) {
    if (tok.kind === 'tokenizer-error') {
      throw new ParseError(tok.message, tok.pos)
    }
  }
  const cur = new TokenCursor(tokens)
  const expr = parseExpr(cur, 0)
  if (!cur.eof()) {
    const stray = cur.peek()
    throw new ParseError(`unexpected trailing token ${stray.kind}`, stray.pos)
  }
  return expr
}

function parseExpr(cur: TokenCursor, minBp: number): Expr {
  let lhs = parsePrefix(cur)

  lhs = parsePostfix(cur, lhs, minBp)

  // Infix loop.
  while (true) {
    const t = cur.peek()
    if (t.kind === 'colon') {
      if (RANGE_BP < minBp) break
      const colon = cur.next()
      const rhs = parseExpr(cur, RANGE_BP + 1)
      lhs = makeRange(lhs, rhs, colon.pos)
      continue
    }
    if (t.kind === 'op') {
      const [lbp, rbp] = infixBindingPower(t.value)
      if (lbp < minBp) break
      cur.next()
      const rhs = parseExpr(cur, rbp)
      lhs = { kind: 'binary', op: t.value as BinaryOp, left: lhs, right: rhs }
      // Deliberately NOT re-entering the postfix loop: a trailing `%` was
      // already claimed by the recursive `parseExpr(rbp)` above, because
      // POSTFIX_BP outranks every infix right-bp. Re-entering would let
      // `=1+2%` parse as `(1+2)%` = 0.03; Excel parses `1 + 2%` = 1.02.
      continue
    }
    break
  }

  return lhs
}

function parsePostfix(cur: TokenCursor, lhs: Expr, minBp: number): Expr {
  let out = lhs
  while (true) {
    const t = cur.peek()
    if (t.kind === 'lparen' && CALL_BP >= minBp) {
      cur.next()
      const args = parseArgList(cur)
      cur.consume('rparen')
      out = { kind: 'lambdaCall', callee: out, args } satisfies LambdaCallExpr
      continue
    }
    if (t.kind === 'percent' && POSTFIX_BP >= minBp) {
      cur.next()
      out = { kind: 'percent', operand: out }
      continue
    }
    if (t.kind === 'spill' && SPILL_BP >= minBp) {
      cur.next()
      out = makeSpillRef(out, t.pos)
      continue
    }
    return out
  }
}

function parsePrefix(cur: TokenCursor): Expr {
  const t = cur.peek()

  if (t.kind === 'op' && (t.value === '+' || t.value === '-')) {
    cur.next()
    const operand = parseExpr(cur, PREFIX_BP)
    if (t.value === '+') {
      // Unary `+` on a number is a no-op; emit a UnaryExpr regardless so
      // downstream consumers see the user's intent.
      return { kind: 'unary', op: '+', operand }
    }
    return { kind: 'unary', op: '-', operand }
  }

  return parseAtom(cur)
}

function parseAtom(cur: TokenCursor): Expr {
  const t = cur.peek()

  switch (t.kind) {
    case 'number': {
      cur.next()
      return { kind: 'number', value: t.value }
    }
    case 'string': {
      cur.next()
      return { kind: 'string', value: t.value }
    }
    case 'boolean': {
      cur.next()
      return { kind: 'boolean', value: t.value }
    }
    case 'error-literal': {
      cur.next()
      return { kind: 'error', code: t.code }
    }
    case 'lparen': {
      cur.next()
      const inner = parseExpr(cur, 0)
      if (cur.peek().kind === 'comma') {
        const areas: Array<ReferenceExpr | RangeExpr | CrossSheetExpr> = [
          requireArea(inner, t.pos),
        ]
        while (cur.peek().kind === 'comma') {
          cur.next()
          areas.push(requireArea(parseExpr(cur, 0), t.pos))
        }
        cur.consume('rparen')
        return { kind: 'multiArea', areas } satisfies MultiAreaExpr
      }
      cur.consume('rparen')
      return inner
    }
    case 'lbrace': {
      return parseArrayLiteral(cur)
    }
    case 'ref': {
      return parseRefOrRange(cur)
    }
    case 'whole-col':
    case 'whole-row': {
      return parseWholeAxisRange(cur)
    }
    case 'sheet-prefix': {
      return parseCrossSheet(cur)
    }
    case 'name': {
      // Either a name reference, or a function call (`SUM(...)`), or a
      // boolean spelled out (handled in tokenizer).
      const name = t.value
      cur.next()
      if (cur.peek().kind === 'lparen') {
        cur.next()
        const args = parseArgList(cur)
        cur.consume('rparen')
        return { kind: 'call', name, args } satisfies CallExpr
      }
      return { kind: 'name', name }
    }
    default:
      throw new ParseError(`unexpected token ${t.kind}`, t.pos)
  }
}

function requireArea(expr: Expr, pos: number): ReferenceExpr | RangeExpr | CrossSheetExpr {
  if (expr.kind === 'ref' || expr.kind === 'range' || expr.kind === 'crossSheet') {
    return expr
  }
  throw new ParseError('multi-area references must contain refs or ranges', pos)
}

function makeSpillRef(expr: Expr, pos: number): SpillReferenceExpr {
  if (expr.kind === 'ref') return { kind: 'spillRef', anchor: expr }
  if (expr.kind === 'crossSheet' && expr.inner.kind === 'ref') {
    return { kind: 'spillRef', anchor: expr }
  }
  throw new ParseError('spill references require a single-cell anchor', pos)
}

function isRangeExpr(expr: Expr): boolean {
  return (
    expr.kind === 'range' ||
    expr.kind === 'dynamicRange' ||
    (expr.kind === 'crossSheet' && expr.inner.kind === 'range')
  )
}

function makeRange(start: Expr, end: Expr, pos = 0): RangeExpr | DynamicRangeExpr {
  if (isRangeExpr(start) || isRangeExpr(end)) {
    throw new ParseError('range operator endpoints must be single references', pos)
  }
  if (start.kind === 'ref' && end.kind === 'ref') {
    return { kind: 'range', start: start.a1, end: end.a1 }
  }
  return { kind: 'dynamicRange', start, end } satisfies DynamicRangeExpr
}

function makeRefExpr(t: Extract<Token, { kind: 'ref' }>): ReferenceExpr {
  return {
    kind: 'ref',
    a1: t.a1,
    absCol: t.absCol,
    absRow: t.absRow,
  }
}

function parseRefOrRange(cur: TokenCursor): Expr {
  const t = cur.peek()
  if (t.kind !== 'ref') {
    throw new ParseError(`expected ref, got ${t.kind}`, t.pos)
  }
  cur.next()
  const start = makeRefExpr(t)
  if (cur.peek().kind === 'colon') {
    const colon = cur.next()
    const endTok = cur.peek()
    if (endTok.kind === 'ref') {
      cur.next()
      return makeRange(start, makeRefExpr(endTok), colon.pos)
    }
    const end = parseExpr(cur, RANGE_BP + 1)
    return makeRange(start, end, colon.pos)
  }
  return start
}

function parseWholeAxisRange(cur: TokenCursor): Expr {
  const a = cur.peek()
  if (a.kind === 'whole-col') {
    cur.next()
    cur.consume('colon')
    const b = cur.peek()
    if (b.kind !== 'whole-col') {
      throw new ParseError(`expected whole-column after ':', got ${b.kind}`, b.pos)
    }
    cur.next()
    return { kind: 'range', start: a.col, end: b.col }
  }
  if (a.kind === 'whole-row') {
    cur.next()
    cur.consume('colon')
    const b = cur.peek()
    if (b.kind !== 'whole-row') {
      throw new ParseError(`expected whole-row after ':', got ${b.kind}`, b.pos)
    }
    cur.next()
    return { kind: 'range', start: String(a.row), end: String(b.row) }
  }
  throw new ParseError(`expected whole-col or whole-row, got ${a.kind}`, a.pos)
}

function parseCrossSheet(cur: TokenCursor): Expr {
  const head = cur.peek()
  if (head.kind !== 'sheet-prefix') {
    throw new ParseError(`expected sheet-prefix, got ${head.kind}`, head.pos)
  }
  cur.next()
  cur.consume('bang')
  const next = cur.peek()
  // Cross-sheet inner must be a ref or range.
  if (next.kind === 'ref') {
    cur.next()
    const start = makeRefExpr(next)
    const endTok = cur.peek(1)
    if (cur.peek().kind === 'colon' && endTok.kind === 'ref') {
      cur.next()
      cur.next()
      return {
        kind: 'crossSheet',
        sheetName: head.name,
        inner: { kind: 'range', start: start.a1, end: endTok.a1 },
      }
    }
    return { kind: 'crossSheet', sheetName: head.name, inner: start }
  }
  if (next.kind === 'whole-col' || next.kind === 'whole-row') {
    const inner = parseWholeAxisRange(cur)
    if (inner.kind !== 'range') {
      throw new ParseError('cross-sheet inner must be ref or range', head.pos)
    }
    return { kind: 'crossSheet', sheetName: head.name, inner }
  }
  throw new ParseError(`expected ref or range after '!', got ${next.kind}`, next.pos)
}

function parseArrayLiteral(cur: TokenCursor): ArrayLiteralExpr {
  cur.consume('lbrace')
  const rows: Expr[][] = []
  // Empty `{}` is invalid in Excel — require at least one element.
  if (cur.peek().kind === 'rbrace') {
    throw new ParseError('empty array literal', cur.peek().pos)
  }
  let row: Expr[] = []
  row.push(parseExpr(cur, 0))
  while (true) {
    const t = cur.peek()
    if (t.kind === 'comma') {
      cur.next()
      row.push(parseExpr(cur, 0))
      continue
    }
    if (t.kind === 'semicolon') {
      cur.next()
      rows.push(row)
      row = []
      row.push(parseExpr(cur, 0))
      continue
    }
    break
  }
  rows.push(row)
  cur.consume('rbrace')
  // Excel arrays are rectangular — every row must have the same length.
  const cols = rows[0].length
  for (const r of rows) {
    if (r.length !== cols) {
      throw new ParseError('array literal rows must be the same length', cur.peek().pos)
    }
  }
  return { kind: 'arrayLiteral', rows }
}

/**
 * 空占位实参：Excel 允许中间 / 末尾的实参留空取默认值
 * （`=XLOOKUP(3,F1:F5,G1:G5,,-1)`）。留空的槽位在 `,` 或 `)` 之前**没有任何
 * token**，所以在调 `parseExpr` 之前先看一眼 —— 否则 `parseAtom` 会拿 `comma`
 * / `rparen` 去撞 default 分支抛 `unexpected token`，整条公式变 `#VALUE!`。
 *
 * 只在实参列表里成立。数组字面量 `{1,,2}` 与多区域 `(A1:A3,)` 不走这条路，
 * 照旧是解析错误 —— Excel 那两处也不接受空槽。
 */
const OMITTED: Expr = { kind: 'omitted' }

function parseArgOrOmitted(cur: TokenCursor): Expr {
  const kind = cur.peek().kind
  if (kind === 'comma' || kind === 'rparen') return OMITTED
  return parseExpr(cur, 0)
}

function parseArgList(cur: TokenCursor): Expr[] {
  const args: Expr[] = []
  if (cur.peek().kind === 'rparen') return args
  args.push(parseArgOrOmitted(cur))
  while (cur.peek().kind === 'comma') {
    cur.next()
    args.push(parseArgOrOmitted(cur))
  }
  return args
}
