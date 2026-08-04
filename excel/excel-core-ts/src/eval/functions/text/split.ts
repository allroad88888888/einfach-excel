/**
 * 按分隔符切开文本：TEXTSPLIT / TEXTBEFORE / TEXTAFTER。
 */

import { propagateError } from '../../coerce'
import type { FunctionImpl, Value } from '../../../types'
import {
  coerceText,
  errValue,
  flattenForConcat,
  readBoolean,
  readInteger,
  ERR_NA,
  ERR_VALUE,
} from './read-args'

/**
 * TEXTSPLIT 二维结果的格数上限。
 *
 * **不是又抄一个魔数，是抄不动**：这条上限的既有声明点有两个 —— `evaluate.ts`
 * 的 `ARRAY_CELL_CAP`（导出）和 `functions/array.ts` 的 `MAX_ARRAY_CELLS`
 * （模块私有）。前者导不进来：`split.ts → evaluate.ts → functions/index.ts →
 * text/index.ts` 是一条真的会炸的环 —— `text/index.ts` 在模块顶层建 `FUNCTIONS`
 * 注册表，而 `evaluate.ts` 也在顶层读 `TEXT_FUNCTIONS`，任何先加载
 * `functions/text` 的入口（`phase8-text.test.ts` 就是）当场
 * `ReferenceError: Cannot access 'FUNCTIONS' before initialization`（试过）。
 * 后者没导出，且 `array.ts` 不归本次改动动。
 *
 * 防漂移不靠注释靠测试：`textsplit-cell-cap.test.ts` 断言这个值 === 从
 * `evaluate.ts` 导入的 `ARRAY_CELL_CAP`，改一边不改另一边就红。
 */
const TEXTSPLIT_CELL_CAP = 1_048_576

function collectTextDelimiters(
  v: Value,
  includeEmpty = false,
): { ok: true; value: string[] } | { ok: false; error: Value } {
  const out: string[] = []
  for (const scalar of flattenForConcat(v)) {
    if (scalar.kind === 'error') return { ok: false, error: scalar }
    if (scalar.kind === 'blank') {
      if (includeEmpty) out.push('')
      continue
    }
    const r = coerceText(scalar)
    if (!r.ok) return r
    if (r.value !== '' || includeEmpty) out.push(r.value)
  }
  return { ok: true, value: out }
}

interface TextDelimiterMatch {
  readonly start: number
  readonly end: number
}

function indexOfCaseInsensitive(text: string, needle: string, start: number): number {
  const lowerNeedle = needle.toLowerCase()
  for (let i = start; i <= text.length - needle.length; i += 1) {
    if (text.slice(i, i + needle.length).toLowerCase() === lowerNeedle) return i
  }
  return -1
}

function findFirstTextDelimiter(
  text: string,
  delims: readonly string[],
  start: number,
  matchMode: number,
): TextDelimiterMatch | null {
  if (delims.length === 0 || start > text.length) return null
  const caseInsensitive = matchMode === 1
  let best: TextDelimiterMatch | null = null

  for (const delim of delims) {
    if (delim === '') continue
    const pos = caseInsensitive
      ? indexOfCaseInsensitive(text, delim, start)
      : text.indexOf(delim, start)
    if (pos < 0) continue
    if (best === null || pos < best.start) {
      best = { start: pos, end: pos + delim.length }
    }
  }

  return best
}

function textsplitOneAxis(
  text: string,
  delims: readonly string[],
  ignoreEmpty: boolean,
  matchMode: number,
): string[] {
  if (delims.length === 0) return [text]
  const out: string[] = []
  let pos = 0
  while (pos <= text.length) {
    const match = findFirstTextDelimiter(text, delims, pos, matchMode)
    if (match) {
      const frag = text.slice(pos, match.start)
      if (!(ignoreEmpty && frag === '')) out.push(frag)
      pos = match.end
      if (pos > text.length) break
      continue
    }
    const frag = text.slice(pos)
    if (!(ignoreEmpty && frag === '')) out.push(frag)
    break
  }
  if (out.length === 0 && !ignoreEmpty) out.push('')
  return out
}

export const TEXTSPLIT: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 6)
    return errValue('#VALUE!', 'TEXTSPLIT takes 2 to 6 arguments')
  const err = propagateError(args)
  if (err) return err

  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  const colR = collectTextDelimiters(args[1])
  if (!colR.ok) return colR.error
  let rowDelims: string[] = []
  if (args.length >= 3) {
    const rowR = collectTextDelimiters(args[2])
    if (!rowR.ok) return rowR.error
    rowDelims = rowR.value
  }

  let ignoreEmpty = false
  if (args.length >= 4) {
    const r = readBoolean(args[3])
    if (!r.ok) return r.error
    ignoreEmpty = r.value
  }

  let matchMode = 0
  if (args.length >= 5) {
    const r = readInteger(args[4])
    if (!r.ok) return r.error
    matchMode = r.value
  }
  if (matchMode !== 0 && matchMode !== 1) return ERR_VALUE

  const pad = args.length === 6 ? args[5] : ERR_NA
  if (textR.value === '') return { kind: 'array', value: [[{ kind: 'string', value: '' }]] }

  if (rowDelims.length === 0) {
    const fragments = textsplitOneAxis(textR.value, colR.value, ignoreEmpty, matchMode)
    const row: Value[] = (fragments.length === 0 ? [''] : fragments).map((value) => ({
      kind: 'string',
      value,
    }))
    return { kind: 'array', value: [row] }
  }

  const rowTexts = textsplitOneAxis(textR.value, rowDelims, ignoreEmpty, matchMode)
  const rows = (rowTexts.length === 0 ? [''] : rowTexts).map((row) =>
    textsplitOneAxis(row, colR.value, ignoreEmpty, matchMode),
  )
  // 逐个比而不是 `Math.max(1, ...rows.map(...))`：展开成实参的数组一长就是
  // `RangeError: Maximum call stack size exceeded`（实测 30 万个行分隔符即触发），
  // 那是**抛异常**而不是错误值，且发生在下面的格数闸门之前 —— 闸门就白装了。
  let maxCols = 1
  for (const row of rows) {
    if (row.length > maxCols) maxCols = row.length
  }
  // 格数闸门。TEXTSPLIT 的输出是**两轴分隔符个数之积**，对长度 L 的文本最坏
  // (L/2)²；到这里为止都还是线性的（`rows` 里的片段总数 ≤ L + 行数），二次爆炸
  // 只发生在下面按 `maxCols` 补 pad 的那一步，所以闸门必须钉在 `rows.map` 之前。
  // 实测 2200 字符（1100 个 ';' + 1100 个 ','）= 1101 × 1101 = 1,212,201 格。
  //
  // 只数格数，**不用 `array.ts` 的 `tooLarge()`**：那个 helper 还捎带「行 > 网格
  // 行数 / 列 > 网格列数」两条，会把 Rust 引擎照收的形状（例如 row_delim 一次都
  // 没匹配上时的 1 × 20001）判成错，等于新造一条跨引擎分歧；而「超网格给 `#NUM!`
  // 还是 `#VALUE!`」正是两边登记在案的未决分歧，不在这里顺手统一。
  // `#VALUE!` 与 Rust 的 `checked_array_len` 同码。
  if (rows.length * maxCols > TEXTSPLIT_CELL_CAP) {
    return errValue('#VALUE!', `TEXTSPLIT result too large (${rows.length}x${maxCols})`)
  }
  const out = rows.map((row) => {
    const cells: Value[] = []
    for (let i = 0; i < maxCols; i++) {
      cells.push(i < row.length ? { kind: 'string', value: row[i] ?? '' } : pad)
    }
    return cells
  })
  return { kind: 'array', value: out }
}

function textBeforeAfter(args: Value[], before: boolean): Value {
  if (args.length < 2 || args.length > 6)
    return errValue('#VALUE!', `${before ? 'TEXTBEFORE' : 'TEXTAFTER'} takes 2 to 6 arguments`)
  const err = propagateError(args)
  if (err) return err

  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  const delimR = collectTextDelimiters(args[1], true)
  if (!delimR.ok) return delimR.error

  let instance = 1
  if (args.length >= 3) {
    const r = readInteger(args[2])
    if (!r.ok) return r.error
    instance = r.value
  }
  if (instance === 0) return ERR_VALUE

  let matchMode = 0
  if (args.length >= 4) {
    const r = readInteger(args[3])
    if (!r.ok) return r.error
    matchMode = r.value
  }
  if (matchMode !== 0 && matchMode !== 1) return ERR_VALUE

  let matchEnd = 0
  if (args.length >= 5) {
    const r = readInteger(args[4])
    if (!r.ok) return r.error
    matchEnd = r.value
  }
  if (matchEnd !== 0 && matchEnd !== 1) return ERR_VALUE

  const notFound = args.length === 6 ? args[5] : ERR_NA
  if (delimR.value.length === 0) return notFound

  const text = textR.value
  if (delimR.value.includes('')) {
    if (instance > 0) {
      if (instance !== 1) return notFound
      return { kind: 'string', value: before ? '' : text }
    }
    if (instance !== -1) return notFound
    return { kind: 'string', value: before ? text : '' }
  }

  const matches: TextDelimiterMatch[] = []
  let pos = 0
  while (pos <= text.length) {
    const match = findFirstTextDelimiter(text, delimR.value, pos, matchMode)
    if (!match) break
    matches.push(match)
    pos = match.end > match.start ? match.end : match.start + 1
  }
  if (matchEnd === 1) matches.push({ start: text.length, end: text.length })

  const index = instance > 0 ? instance - 1 : matches.length + instance
  const match = matches[index]
  if (match === undefined) return notFound
  return { kind: 'string', value: before ? text.slice(0, match.start) : text.slice(match.end) }
}

export const TEXTBEFORE: FunctionImpl = (args) => textBeforeAfter(args, true)
export const TEXTAFTER: FunctionImpl = (args) => textBeforeAfter(args, false)
