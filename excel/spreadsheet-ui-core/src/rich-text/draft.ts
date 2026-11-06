import type { RichTextFormat, RichTextRun } from '../contracts'

export function normalizeRichTextDraft(runs: readonly RichTextRun[]): RichTextRun[] {
  const result: RichTextRun[] = []
  for (const run of runs) {
    if (!run.text) continue
    const last = result.at(-1)
    if (last && JSON.stringify(last.format) === JSON.stringify(run.format))
      result[result.length - 1] = { ...last, text: last.text + run.text }
    else result.push({ text: run.text, format: { ...run.format } })
  }
  return result
}

function slice(runs: readonly RichTextRun[], start: number, end: number): RichTextRun[] {
  let offset = 0
  return runs.flatMap((run) => {
    const text = run.text.slice(Math.max(0, start - offset), Math.max(0, end - offset))
    offset += run.text.length
    return text ? [{ text, format: run.format }] : []
  })
}

export function richTextSelection(text: string, start: number, end: number): [number, number] {
  start = Math.max(0, Math.min(text.length, Number.isFinite(start) ? Math.floor(start) : 0))
  end = Math.max(start, Math.min(text.length, Number.isFinite(end) ? Math.floor(end) : start))
  const low = (index: number) => /[\uDC00-\uDFFF]/.test(text[index] ?? '')
  if (low(start)) start -= 1
  if (low(end)) end += 1
  return [start, end]
}

export function formatRichTextDraft(
  runs: readonly RichTextRun[],
  start: number,
  end: number,
  format: RichTextFormat | null,
): RichTextRun[] {
  const text = runs.map((run) => run.text).join('')
  ;[start, end] = richTextSelection(text, start, end)
  if (start === end) return [...runs]
  return normalizeRichTextDraft([
    ...slice(runs, 0, start),
    ...slice(runs, start, end).map((run) => ({
      text: run.text,
      format: format === null ? {} : { ...run.format, ...format },
    })),
    ...slice(runs, end, text.length),
  ])
}

export function replaceRichTextDraft(runs: readonly RichTextRun[], text: string): RichTextRun[] {
  const old = runs.map((run) => run.text).join('')
  if (old === text) return [...runs]
  const oldChars = Array.from(old),
    nextChars = Array.from(text)
  let prefix = 0,
    suffix = 0
  while (
    prefix < oldChars.length &&
    prefix < nextChars.length &&
    oldChars[prefix] === nextChars[prefix]
  )
    prefix += 1
  while (
    suffix < oldChars.length - prefix &&
    suffix < nextChars.length - prefix &&
    oldChars[oldChars.length - suffix - 1] === nextChars[nextChars.length - suffix - 1]
  )
    suffix += 1
  const start = nextChars.slice(0, prefix).join('').length
  const tail = nextChars.slice(nextChars.length - suffix).join('').length
  const before = slice(runs, 0, start)
  const inherited = before.at(-1)?.format ?? runs[0]?.format ?? {}
  return normalizeRichTextDraft([
    ...before,
    { text: text.slice(start, text.length - tail), format: inherited },
    ...slice(runs, old.length - tail, old.length),
  ])
}
