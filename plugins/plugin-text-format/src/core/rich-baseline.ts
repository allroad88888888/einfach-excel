import { atom } from '@einfach/core'
import {
  richTextPanelAtom, runRichTextAtom, type FontBaseline, type RichTextRun,
} from '@einfach-excel/spreadsheet-ui-core'

export type SelectedBaseline = FontBaseline | 'mixed' | null

/** Read only intersecting runs; an omitted override inherits the cell's baseline. */
export function selectedBaseline(runs: readonly RichTextRun[], start: number, end: number,
  inherited: FontBaseline = 'normal'): SelectedBaseline {
  if (start >= end) return null
  let offset = 0
  let selected: SelectedBaseline = null
  for (const run of runs) {
    const next = offset + run.text.length
    if (start < next && end > offset) {
      const current = run.format.fontBaseline ?? inherited
      if (selected !== null && selected !== current) return 'mixed'
      selected = current
    }
    offset = next
    if (offset >= end) break
  }
  return selected
}

export const richTextBaselineAtom = atom(get => {
  const panel = get(richTextPanelAtom)
  return panel.open ? selectedBaseline(panel.runs, panel.start, panel.end,
    panel.base?.fontBaseline) : null
})

export const runRichTextBaselineAtom = atom(null, (get, set,
  value: 'superscript' | 'subscript') => {
  const panel = get(richTextPanelAtom)
  const selected = get(richTextBaselineAtom)
  if (!panel.open || panel.busy || selected === null ||
    !['superscript', 'subscript'].includes(value)) return false
  // Explicit normal overrides the cell; Reset formatting remains the way to inherit again.
  return set(runRichTextAtom, { format: { fontBaseline: selected === value ? 'normal' : value } })
})
richTextBaselineAtom.debugLabel = 'plugin.textFormat.richTextBaseline'
runRichTextBaselineAtom.debugLabel = 'plugin.textFormat.runRichTextBaseline'
