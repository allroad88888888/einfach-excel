import { atom } from '@einfach/core'
import { coordToA1, rangeToA1 } from '../name-box/address'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import type { CellRange } from '../shared'
import { parseConditionalFormatScope } from './scope'
import {
  nativeConditionalFormatPanelAtom, nativeConditionalFormatsAtom, runNativeConditionalFormatAtom,
} from './native-panel'

const PREFIX = 'alternating-colors-'

/** Absolute anchor follows structural edits in Rust; parity is relative to the range, not row 1. */
function formula(range: CellRange, header: boolean, rendered = false): string {
  const anchor = coordToA1({ row: range.rowStart, col: range.colStart })
    .replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2')
  return rendered
    ? `=(MOD((ROW()-ROW(${anchor})),2)=${header ? 1 : 0})`
    : `=MOD(ROW()-ROW(${anchor}),2)=${header ? 1 : 0}`
}

export const alternatingColorsDraftAtom = atom((get) => {
  const state = get(nativeConditionalFormatPanelAtom)
  const scope = parseConditionalFormatScope(state.range)
  return {
    header: state.rule.kind === 'formula'
      && /=1\)?$/.test(state.rule.formula.replace(/\s/g, '')),
    color: 'format' in state.rule ? state.rule.format.bgColor ?? '#e8f0fe' : '#e8f0fe',
    existing: get(nativeConditionalFormatsAtom)?.rules
      .some((entry) => entry.id === state.ruleId) ?? false,
    range: scope?.range,
  }
})
alternatingColorsDraftAtom.debugLabel = 'spreadsheet.alternatingColors.draft'

type Action = 'open' | 'close' | 'save' | 'remove'
  | { type: 'draft'; header?: boolean; color?: string }

/** A preset for the existing native rule editor, with no second rule store or mutation path. */
export const runAlternatingColorsAtom = atom(null, (get, set, action: Action): Promise<boolean> => {
  if (action === 'open') {
    const config = get(nativeConditionalFormatsAtom)
    if (!config) return Promise.resolve(false)
    const range = get(selectionSnapshotAtom).range
    const continuous = get(selectionRegionsAtom).length === 1
    // Selecting inside a band edits its whole range; unrelated conditions are never removed.
    const existing = continuous && config.rules.find((entry) => {
      const target = entry.scope.range
      return !entry.scope.additionalRanges?.length
        && entry.rule.kind === 'formula' && !entry.rule.stopIfTrue
        && Object.keys(entry.rule.format).every((key) => key === 'bgColor')
        // Rust parenthesizes binary expressions when structural edits rewrite references.
        && [false, true].flatMap((header) => [
          formula(target, header), formula(target, header, true),
        ]).map((value) => value.slice(1))
          .includes(entry.rule.formula.replace(/\s/g, '').replace(/^=/, '').toUpperCase())
        && range.rowStart >= target.rowStart && range.rowEnd <= target.rowEnd
        && range.colStart >= target.colStart && range.colEnd <= target.colEnd
    })
    const ids = new Set(config.rules.map((entry) => entry.id))
    let suffix = 1
    while (ids.has(`${PREFIX}${suffix}`)) suffix++
    return set(runNativeConditionalFormatAtom, {
      type: 'preset', ruleId: existing ? existing.id : `${PREFIX}${suffix}`,
      range: continuous ? rangeToA1(existing ? existing.scope.range : range) : '',
      rule: existing ? existing.rule : {
        kind: 'formula', formula: formula(range, false), format: { bgColor: '#e8f0fe' },
      },
    })
  }
  const state = get(nativeConditionalFormatPanelAtom)
  if (state.editor !== 'alternating' || state.sheetId === null) return Promise.resolve(false)
  const draft = get(alternatingColorsDraftAtom)
  if (typeof action === 'object') {
    if (!draft.range) return Promise.resolve(false)
    return set(runNativeConditionalFormatAtom, { type: 'draft', rule: {
      formula: formula(draft.range, action.header ?? draft.header),
      format: { bgColor: action.color ?? draft.color },
      enabled: true,
    } })
  }
  if (action === 'remove') {
    if (!draft.existing || !state.ruleId) return Promise.resolve(false)
    return set(runNativeConditionalFormatAtom, { type: 'remove', id: state.ruleId })
  }
  return set(runNativeConditionalFormatAtom, action)
})
runAlternatingColorsAtom.debugLabel = 'spreadsheet.alternatingColors.run'
