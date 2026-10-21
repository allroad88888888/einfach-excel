/** 输入辅助的词法定位，不求值，也不改写已保存公式。 */
const NAME_HEAD = /[A-Za-z_]/
const NAME_REST = /[A-Za-z0-9_.]/
type Call = { name: string; openParen: number; activeArgIndex: number }
export type FormulaCallContext = Call & {
  argumentCount: number
  closed: boolean
  firstArgument: string
}

/** 向前扫描才能识别未闭合字符串；引号、数组里的逗号不属于参数分隔符。 */
function contextAtCaret(draft: string, caret: number) {
  let quote: string | null = null
  let arrayDepth = 0
  let referenceDepth = 0
  const calls: Call[] = []
  for (let i = 0; i < caret; i++) {
    const ch = draft[i]
    if (quote) {
      if (ch === quote) {
        if (draft[i + 1] === quote && i + 1 < caret) i++
        else quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '{') {
      arrayDepth++
      continue
    }
    if (ch === '}') {
      arrayDepth = Math.max(0, arrayDepth - 1)
      continue
    }
    if (arrayDepth) continue
    if (ch === '[') {
      referenceDepth++
      continue
    }
    if (ch === ']') {
      referenceDepth = Math.max(0, referenceDepth - 1)
      continue
    }
    if (referenceDepth) continue
    if (ch === '(') {
      let end = i
      while (end > 0 && /\s/.test(draft[end - 1])) end--
      let start = end
      while (start > 0 && NAME_REST.test(draft[start - 1])) start--
      const name = start < end && NAME_HEAD.test(draft[start]) ? draft.slice(start, end) : ''
      calls.push({ name: name.toUpperCase(), openParen: i + 1, activeArgIndex: 0 })
    } else if (ch === ')') calls.pop()
    else if (ch === ',' && calls.length) calls[calls.length - 1].activeArgIndex++
  }
  return { quote, call: [...calls].reverse().find((call) => call.name) ?? null }
}

/** 光标左侧的函数前缀；不把字符串、工作表名或限定引用当作函数。 */
export function findFunctionNameFragmentAtCaret(
  draft: string,
  caret: number,
): { start: number; end: number; text: string } | null {
  if (!Number.isInteger(caret) || caret <= 0 || caret > draft.length) return null
  if (contextAtCaret(draft, caret).quote) return null
  const charAt = draft[caret]
  if (charAt === '(' || (charAt !== undefined && NAME_REST.test(charAt))) return null
  let start = caret
  while (start > 0 && NAME_REST.test(draft[start - 1])) start--
  if (start === caret || !NAME_HEAD.test(draft[start])) return null
  let before = start - 1
  while (before >= 0 && /\s/.test(draft[before])) before--
  if (before >= 0 && !'=+-*/^&<>,({'.includes(draft[before])) return null
  return { start, end: caret, text: draft.slice(start, caret) }
}

/** 最近一个仍未闭合的函数；普通括号内也保留所属函数的参数提示。 */
export function findEnclosingFunctionCall(draft: string, caret: number): Call | null {
  if (!Number.isInteger(caret) || caret <= 0 || caret > draft.length) return null
  return contextAtCaret(draft, caret).call
}

export function findEnclosingFormulaHelpCall(
  draft: string,
  caret: number,
): FormulaCallContext | null {
  const call = findEnclosingFunctionCall(draft, caret)
  return call ? { ...call, ...countCallArguments(draft, call.openParen) } : null
}

/** Scan the whole current call, including text right of the caret. Otherwise
 * LET's second name and MAP's second array would be confused with their suffix. */
function countCallArguments(draft: string, start: number) {
  let quote: string | null = null
  let depth = 0
  let arrayDepth = 0
  let referenceDepth = 0
  let count = 1
  let hasContent = false
  let firstEnd: number | null = null
  const result = (end: number, closed: boolean) => ({
    argumentCount: hasContent ? count : 0, closed,
    firstArgument: draft.slice(start, firstEnd ?? end).trim(),
  })
  for (let i = start; i < draft.length; i++) {
    const ch = draft[i]
    if (quote) {
      if (ch === quote) {
        if (draft[i + 1] === quote) i++
        else quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; hasContent = true; continue }
    if (ch === '{') { arrayDepth++; hasContent = true; continue }
    if (ch === '}') { arrayDepth = Math.max(0, arrayDepth - 1); continue }
    if (arrayDepth) continue
    if (ch === '[') { referenceDepth++; hasContent = true; continue }
    if (ch === ']') { referenceDepth = Math.max(0, referenceDepth - 1); continue }
    if (referenceDepth) continue
    if (ch === '(') { depth++; hasContent = true } else if (ch === ')' && depth > 0) depth--
    else if (ch === ')') return result(i, true)
    else if (ch === ',' && depth === 0) {
      if (firstEnd === null) firstEnd = i
      count++; hasContent = true
    } else if (!/\s/.test(ch)) hasContent = true
  }
  return result(draft.length, false)
}
