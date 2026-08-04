// 一句话：在一段文本里收集查找命中的区间。

interface StaticFindSpan {
  readonly start: number
  readonly end: number
}

export function collectRegexFindSpans(matcher: RegExp, haystack: string): StaticFindSpan[] {
  const spans: StaticFindSpan[] = []
  matcher.lastIndex = 0

  for (;;) {
    const match = matcher.exec(haystack)
    if (!match) break

    if (match[0].length === 0) {
      // FindMatch requires a non-empty interval. Advance explicitly so a
      // zero-width global match cannot pin RegExp.lastIndex forever.
      matcher.lastIndex = match.index + 1
      continue
    }

    spans.push({ start: match.index, end: match.index + match[0].length })
  }

  matcher.lastIndex = 0
  return spans
}

export function collectLiteralFindSpans(
  haystack: string,
  needle: string,
  caseSensitive: boolean,
  wholeMatch: boolean,
): StaticFindSpan[] {
  const normalize = caseSensitive
    ? (value: string) => value
    : (value: string) => value.toLowerCase()
  const normalizedHaystack = normalize(haystack)
  const normalizedNeedle = normalize(needle)

  if (wholeMatch) {
    return normalizedHaystack === normalizedNeedle ? [{ start: 0, end: haystack.length }] : []
  }

  const start = normalizedHaystack.indexOf(normalizedNeedle)
  return start < 0 ? [] : [{ start, end: start + needle.length }]
}
