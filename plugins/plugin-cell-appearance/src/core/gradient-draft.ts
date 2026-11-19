import { snapshotCellFill, type SpreadsheetCellFormat, type SpreadsheetGradientFill,
  type SpreadsheetGradientStop } from '@einfach-excel/spreadsheet-ui-core'

export type GradientEdge = 'left' | 'right' | 'top' | 'bottom'
export interface NumericDraft { readonly text: string; readonly value: number | null }
export interface GradientDraft {
  readonly mode: SpreadsheetGradientFill['kind']
  readonly angle: NumericDraft
  readonly rectangle: Readonly<Record<GradientEdge, NumericDraft>>
  readonly stops: readonly SpreadsheetGradientStop[]
  readonly startColor: string
  readonly endColor: string
  readonly fallback: string
}

const rgb = (value: string) => /^#[\da-f]{6}$/i.test(value)
const numericField = (value: number, percent = false): NumericDraft => ({
  text: String(value * (percent ? 100 : 1)), value,
})

/** Keep imported numeric values exact until the user actually edits their displayed percentage. */
export function gradientNumericInput(text: string, percent = false): NumericDraft {
  const number = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) ? Number(text) : NaN
  return { text, value: Number.isFinite(number) && (!percent || (number >= 0 && number <= 100))
    ? number / (percent ? 100 : 1) : null }
}

function endpoints(stops: readonly SpreadsheetGradientStop[]) {
  const ordered = stops.map((stop, index) => ({ ...stop, index }))
    .sort((a, b) => a.position - b.position)
  let start = ordered[0]
  if (start?.position === 0) for (const stop of ordered) {
    if (stop.position === 0) start = stop
  }
  return { start: start?.index, end: ordered.at(-1)?.index }
}

export function gradientDraftFromFormat(format: SpreadsheetCellFormat): GradientDraft {
  const fill = format.fill?.kind !== 'pattern' ? format.fill : undefined
  const stops = fill ? fill.stops.map(stop => ({ ...stop })) : [
    { position: 0, color: format.bgColor ?? '#ffffff' }, { position: 1, color: '#4472c4' },
  ]
  const { start, end } = endpoints(stops)
  const fallback = format.bgColor ?? '#000000'
  const rectangle = fill?.kind === 'path-gradient' ? fill : { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 }
  return { mode: fill?.kind ?? 'linear-gradient',
    angle: numericField(fill?.kind === 'linear-gradient' ? fill.degree : 0),
    rectangle: { left: numericField(rectangle.left, true),
      right: numericField(rectangle.right, true),
      top: numericField(rectangle.top, true), bottom: numericField(rectangle.bottom, true) },
    stops,
    startColor: start === undefined ? fallback : stops[start].color,
    endColor: end === undefined ? fallback : stops[end].color, fallback }
}

/** Edit only the rendered endpoint, preserving every imported middle stop and its position. */
export function gradientColorInput(draft: GradientDraft, field: 'startColor' | 'endColor', value: string): GradientDraft {
  const indices = endpoints(draft.stops)
  const index = field === 'startColor' ? indices.start : indices.end
  const shared = index !== undefined && indices.start === indices.end
  const next = { ...draft, [field]: value,
    ...(shared ? { startColor: value, endColor: value } : {}) }
  if (!draft.stops.length) return rgb(next.startColor) && rgb(next.endColor)
    ? { ...next, stops: [{ position: 0, color: next.startColor.toLowerCase() },
        { position: 1, color: next.endColor.toLowerCase() }] } : next
  return rgb(value) ? { ...next, stops: draft.stops.map((stop, i) => i === index
    ? { ...stop, color: value.toLowerCase() } : stop) } : next
}

export function gradientFromDraft(draft: GradientDraft): SpreadsheetGradientFill | null {
  if (!rgb(draft.startColor) || !rgb(draft.endColor)) return null
  const value = snapshotCellFill(draft.mode === 'linear-gradient'
    ? { kind: draft.mode, degree: draft.angle.value, stops: draft.stops }
    : { kind: draft.mode, left: draft.rectangle.left.value, right: draft.rectangle.right.value,
        top: draft.rectangle.top.value, bottom: draft.rectangle.bottom.value, stops: draft.stops })
  return value && value.kind !== 'pattern' ? value : null
}
