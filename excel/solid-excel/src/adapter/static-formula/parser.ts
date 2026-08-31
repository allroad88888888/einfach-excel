import { applyFunction } from './functions'
import type { RangeRef } from './types'
import type { Token } from './tokenizer'
import { coerceNumber, isErr } from './value'
import type { Value } from './value'

export class Parser {
  private pos = 0

  constructor(
    private readonly tokens: Token[],
    private readonly resolve: (row: number, col: number) => Value,
    /**
     * Is the cell truly empty? `resolve` folds a blank to `0`, which is right
     * for SUM but wrong for the SUBTOTAL family (the engine sees `Value::Null`
     * and skips it, so a blank must not sink MIN or inflate COUNT).
     */
    private readonly isBlank: (row: number, col: number) => boolean = () => false,
    /** MANUALLY hidden rows — consumed by SUBTOTAL 101-111 only. */
    private readonly hiddenRows: ReadonlySet<number> | undefined = undefined,
    /** FILTER-hidden rows — consumed by SUBTOTAL 1-11 AND 101-111. */
    private readonly filterHiddenRows: ReadonlySet<number> | undefined = undefined,
  ) {}

  parse(): Value {
    const value = this.parseComparison()
    if (this.pos < this.tokens.length) return '#ERROR!'
    return value
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private parseComparison(): Value {
    let left = this.parseAdditive()
    while (this.peek()?.kind === 'cmp') {
      const op = (this.tokens[this.pos] as { op: string }).op
      this.pos += 1
      const right = this.parseAdditive()
      left = this.combineCompare(op, left, right)
    }
    return left
  }

  private parseAdditive(): Value {
    let left = this.parseMultiplicative()
    while (this.peek()?.kind === 'op' && '+-'.includes((this.peek() as { op: string }).op)) {
      const op = (this.tokens[this.pos] as { op: string }).op
      this.pos += 1
      const right = this.parseMultiplicative()
      left = this.combine(op, left, right)
    }
    return left
  }

  private parseMultiplicative(): Value {
    let left = this.parseExponent()
    while (this.peek()?.kind === 'op' && '*/'.includes((this.peek() as { op: string }).op)) {
      const op = (this.tokens[this.pos] as { op: string }).op
      this.pos += 1
      const right = this.parseExponent()
      left = this.combine(op, left, right)
    }
    return left
  }

  /**
   * exponent = percent ('^' exponent)? —— **右结合**。
   *
   * `=2^3^2` 是 `2^(3^2)` = 512，不是 `(2^3)^2` = 64。这里曾经用 `while` 循环
   * （左结合）算出 64，而两个真引擎都是右结合：TS 的 `infixBindingPower` 对 `^`
   * 返回 `[60, 59]`（right-bp 比 left-bp 小 ⇒ 右结合，`parser.test.ts` 有断言），
   * Rust 的 `parse_pow` 尾部递归调自己。
   */
  private parseExponent(): Value {
    const left = this.parsePercent()
    if (this.peek()?.kind === 'op' && (this.peek() as { op: string }).op === '^') {
      this.pos += 1
      const right = this.parseExponent()
      return this.combine('^', left, right)
    }
    return left
  }

  /**
   * percent = unary '%'* — postfix and stackable.
   *
   * Excel's operator table (high → low) reads: reference operators >
   * unary `-` > `%` > `^` > `*` `/` > `+` `-` > `&` > comparison, so this
   * level sits exactly between `parseExponent` and `parseUnary` — the same
   * slot `Parser::parse_percent` occupies in
   * excel/rust/excel-core/src/formula/operators.rs.
   * Consequences worth naming: `=2^2%` is `2^(2%)` = 2^0.02 (NOT `(2^2)%`),
   * `=-50%` is -0.5, `=50%%` is 0.005, `=1+2%` is 1.02.
   *
   * `%` is NOT modulo — Excel has no modulo operator (that is `MOD()`), so
   * `=10%3` leaves a stray `3` and fails the trailing-token check in
   * `parse()` rather than quietly answering 1.
   */
  private parsePercent(): Value {
    let value = this.parseUnary()
    while (this.peek()?.kind === 'op' && (this.peek() as { op: string }).op === '%') {
      this.pos += 1
      const n = coerceNumber(value)
      if (typeof n === 'string') return n
      value = n / 100
    }
    return value
  }

  private parseUnary(): Value {
    const tok = this.peek()
    if (tok?.kind === 'op' && (tok.op === '-' || tok.op === '+')) {
      this.pos += 1
      const inner = this.parseUnary()
      // Coerce, never pass through. Returning a non-number verbatim silently
      // DROPPED the operator: `=-"5"` used to display 5.
      const n = coerceNumber(inner)
      if (typeof n === 'string') return n
      return tok.op === '-' ? -n : n
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Value {
    const tok = this.tokens[this.pos]
    if (!tok) return '#ERROR!'
    if (tok.kind === 'number') {
      this.pos += 1
      return tok.value
    }
    if (tok.kind === 'string') {
      this.pos += 1
      return tok.value
    }
    if (tok.kind === 'error') {
      // A resolvable structured reference that evaluates to an Excel error
      // (`#NAME?` unknown table, `#REF!` unknown column / missing totals row)
      // — or an error literal (#REF!, #N/A, etc.).
      this.pos += 1
      return tok.code
    }
    if (tok.kind === 'lparen') {
      this.pos += 1
      const value = this.parseComparison()
      if (this.tokens[this.pos]?.kind !== 'rparen') return '#ERROR!'
      this.pos += 1
      return value
    }
    if (tok.kind === 'cell') {
      this.pos += 1
      return this.resolve(tok.ref.row, tok.ref.col)
    }
    if (tok.kind === 'range') {
      // Value context. A 1×1 range collapses to its single cell — that is the
      // whole point of `=[@Price]*[@Qty]` inside a Table row. A WIDER range
      // would need spill (or Excel's implicit intersection), neither of which
      // the static evaluator models, so it stays an honest `#ERROR!` rather
      // than silently picking a corner value.
      const { rowStart, rowEnd, colStart, colEnd } = tok.ref
      if (rowStart !== rowEnd || colStart !== colEnd) return '#ERROR!'
      this.pos += 1
      return this.resolve(rowStart, colStart)
    }
    if (tok.kind === 'func') {
      this.pos += 1
      if (this.tokens[this.pos]?.kind !== 'lparen') return '#ERROR!'
      this.pos += 1
      const args = this.parseArgList()
      if (this.tokens[this.pos]?.kind !== 'rparen') return '#ERROR!'
      this.pos += 1
      return applyFunction(
        tok.name,
        args,
        this.resolve,
        this.isBlank,
        this.hiddenRows,
        this.filterHiddenRows,
      )
    }
    return '#ERROR!'
  }

  private parseArgList(): Array<Value | RangeRef> {
    const args: Array<Value | RangeRef> = []
    if (this.peek()?.kind === 'rparen') return args
    while (true) {
      const tok = this.peek()
      if (tok?.kind === 'range') {
        this.pos += 1
        args.push(tok.ref)
      } else {
        args.push(this.parseComparison())
      }
      if (this.peek()?.kind !== 'comma') break
      this.pos += 1
    }
    return args
  }

  private combine(op: string, left: Value, right: Value): Value {
    if (isErr(left)) return left
    if (isErr(right)) return right
    // Excel coerces a numeric-LOOKING operand rather than rejecting every
    // string: `=1+"5"` is 6, `=1+"x"` is #VALUE!. Left first, so the leftmost
    // non-coercible operand is the one that names the failure.
    const a = coerceNumber(left)
    if (typeof a === 'string') return a
    const b = coerceNumber(right)
    if (typeof b === 'string') return b
    switch (op) {
      case '+':
        return a + b
      case '-':
        return a - b
      case '*':
        return a * b
      case '/':
        if (b === 0) return '#DIV/0!'
        return a / b
      case '^':
        return Math.pow(a, b)
      default:
        return '#ERROR!'
    }
  }

  private combineCompare(op: string, left: Value, right: Value): Value {
    if (isErr(left)) return left
    if (isErr(right)) return right
    // Excel compares mixed string + number with strings always greater than
    // numbers; we keep it simple: same-kind comparison only.
    if (typeof left !== typeof right) return 0
    let result = false
    switch (op) {
      case '=':
        result = left === right
        break
      case '<>':
        result = left !== right
        break
      case '<':
        result = left < right
        break
      case '<=':
        result = left <= right
        break
      case '>':
        result = left > right
        break
      case '>=':
        result = left >= right
        break
      default:
        return '#ERROR!'
    }
    return result ? 1 : 0
  }


}
