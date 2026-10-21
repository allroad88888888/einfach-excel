import { atom } from '@einfach/core'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { startEditingAtom } from '../editing/session-atoms'
import { nativeFunctionCatalogAtom } from '../formula-functions/native-catalog'
import type { FormulaFunctionSpec } from '../formula-functions/types'
import { quickFormulaAvailableAtom } from '../quick-formula/command'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { selectionAuthorityWitnessAtom, selectionSnapshotAtom,
  type SelectionAuthorityWitness } from '../selection'
import { scrollToCellAtom } from '../viewport/metrics'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import { buildFormulaArguments, formulaArgumentFields, formulaArgumentRepeat } from './layout'

interface ArgumentsDraft {
  connection: RustWorkbookConnection
  authority: SelectionAuthorityWitness
  sheetId: string
  cell: { row: number; col: number }
  spec: FormulaFunctionSpec
  groupCount: number
  values: readonly string[]
  error: string
  errorField: number | null
}
const draftAtom = atom<ArgumentsDraft | null>(null)

export const formulaArgumentsPanelAtom = atom((get) => {
  const draft = get(draftAtom)
  const catalog = get(nativeFunctionCatalogAtom)
  const available = get(quickFormulaAvailableAtom) && !get(nativeTableFeedbackAtom).busy
  const current = catalog.find((spec) => spec.name === draft?.spec.name)
  const open = Boolean(draft && current &&
    draft.connection === get(rustWorkbookConnectionAtom) &&
    draft.authority === get(selectionAuthorityWitnessAtom) &&
    draft.sheetId === get(activeWorkbookSheetAtom)?.id &&
    JSON.stringify(current) === JSON.stringify(draft.spec))
  const spec = draft?.spec ?? null
  const repeat = spec && formulaArgumentRepeat(spec)
  const fields = spec ? formulaArgumentFields(spec, draft!.groupCount, draft!.values) : []
  return { open, available, busy: !available, spec, fields,
    groupCount: draft?.groupCount ?? 0, minGroups: repeat?.minGroups ?? 0,
    groups: Array.from({ length: draft?.groupCount ?? 0 }, (_, index) => ({ index,
      fields: fields.filter((field) => field.groupIndex === index) })),
    error: draft?.error ?? '', errorField: draft?.errorField ?? null,
    formula: spec ? buildFormulaArguments(spec, draft!.groupCount, draft!.values).formula : '' }
})

export type FormulaArgumentsAction = { open: string } | 'close' | 'confirm' | 'add-group' |
  { removeGroup: number } | { field: number; value: string }

/** The only handoff is a complete existing formula-bar draft; no workbook request happens here. */
export const runFormulaArgumentsAtom = atom(null, (get, set,
  action: FormulaArgumentsAction): boolean => {
  if (action === 'close') { set(draftAtom, null); return true }
  const panel = get(formulaArgumentsPanelAtom)
  if (typeof action === 'object' && 'open' in action) {
    if (!panel.available) return false
    const spec = get(nativeFunctionCatalogAtom).find((entry) => entry.name === action.open)
    const sheet = get(activeWorkbookSheetAtom)
    const cell = get(selectionSnapshotAtom).activeCell
    if (!spec || spec.signatureAvailable === false || !sheet || cell.sheetId !== sheet.id)
      return false
    const repeat = formulaArgumentRepeat(spec)
    const groupCount = repeat ? Math.max(1, repeat.minGroups) : 0
    set(draftAtom, { connection: get(rustWorkbookConnectionAtom)!,
      authority: get(selectionAuthorityWitnessAtom), sheetId: sheet.id,
      cell: { row: cell.row, col: cell.col }, spec, groupCount,
      values: formulaArgumentFields(spec, groupCount, []).map(() => ''), error: '', errorField: null })
    return true
  }
  // Connection, selection and signature identity are checked again for every command.
  if (!panel.open || panel.busy) return false
  const draft = get(draftAtom)!
  const repeat = formulaArgumentRepeat(draft.spec)
  if (typeof action === 'object' && 'field' in action) {
    if (!Number.isInteger(action.field) || !panel.fields[action.field]) return false
    const values = [...draft.values]
    values[action.field] = action.value
    set(draftAtom, { ...draft, values, error: '', errorField: null })
    return true
  }
  if (action === 'add-group' || typeof action === 'object' && 'removeGroup' in action) {
    if (!repeat) return false
    const values = [...draft.values]
    const adding = action === 'add-group'
    const group = adding ? draft.groupCount : action.removeGroup
    if (!Number.isInteger(group) || group < 0 || group > draft.groupCount ||
      !adding && (group === draft.groupCount || draft.groupCount <= repeat.minGroups)) return false
    values.splice(repeat.start + group * repeat.length, adding ? 0 : repeat.length,
      ...adding ? Array<string>(repeat.length).fill('') : [])
    set(draftAtom, { ...draft, values, groupCount: draft.groupCount + (adding ? 1 : -1),
      error: '', errorField: null })
    return true
  }
  if (action !== 'confirm') return false
  const result = buildFormulaArguments(draft.spec, draft.groupCount, draft.values)
  if (result.error) {
    set(draftAtom, { ...draft, error: result.error, errorField: result.errorField })
    return false
  }
  const permission = set(resolveContentMutationAtom, {
    kind: 'set-cell-input', sheetId: draft.sheetId, cell: draft.cell,
  })
  if (permission.status !== 'allowed') {
    set(draftAtom, { ...draft, error: permission.diagnostic.message, errorField: null })
    return false
  }
  set(draftAtom, null)
  set(scrollToCellAtom, { coord: draft.cell, rowAlign: 'nearest', colAlign: 'nearest' })
  set(startEditingAtom, { sheetId: draft.sheetId, cell: draft.cell,
    draft: result.formula, source: 'formula-bar' })
  return true
})
