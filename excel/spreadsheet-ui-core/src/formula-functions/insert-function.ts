import { atom } from '@einfach/core'
import { startEditingAtom } from '../editing/session-atoms'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { quickFormulaAvailableAtom } from '../quick-formula/command'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { selectionAuthorityWitnessAtom, selectionSnapshotAtom, type SelectionAuthorityWitness } from '../selection'
import { scrollToCellAtom } from '../viewport/metrics'
import { nativeFunctionCatalogAtom } from './native-catalog'
import { searchFormulaFunctions } from './search'

const draftAtom = atom<{
  connection: RustWorkbookConnection
  authority: SelectionAuthorityWitness
  query: string
  category: string
  name: string
  error: string
} | null>(null)

export const insertFunctionPanelAtom = atom((get) => {
  const draft = get(draftAtom)
  const catalog = get(nativeFunctionCatalogAtom)
  const available = get(quickFormulaAvailableAtom) && catalog.length > 0
  const open = Boolean(draft && available && draft.connection === get(rustWorkbookConnectionAtom) &&
    draft.authority === get(selectionAuthorityWitnessAtom))
  const query = draft?.query ?? ''
  const category = draft?.category ?? ''
  const functions = searchFormulaFunctions(query.trim(), catalog
    .filter((entry) => !category || entry.category === category)
    .sort((a, b) => a.name.localeCompare(b.name)))
  const selected = functions.find((entry) => entry.name === draft?.name) ?? functions[0]
  return { open, available, query, category, functions, selected,
    categories: [...new Set(catalog.map((entry) => entry.category ?? 'Other'))].sort(),
    total: catalog.length, error: draft?.error ?? '' }
})

type Action = 'open' | 'close' | 'insert' | { query: string } | { category: string } | { name: string }

/** 只创建当前格的公式草稿；校验、提交、撤销完全复用原有单格编辑链。 */
export const runInsertFunctionAtom = atom(null, (get, set, action: Action): boolean => {
  if (action === 'close') { set(draftAtom, null); return true }
  const panel = get(insertFunctionPanelAtom)
  if (!panel.available) return false
  if (action === 'open') {
    set(draftAtom, { connection: get(rustWorkbookConnectionAtom)!,
      authority: get(selectionAuthorityWitnessAtom), query: '', category: '', name: '', error: '' })
    return true
  }
  if (!panel.open) return false
  const draft = get(draftAtom)!
  if (typeof action === 'object') {
    set(draftAtom, { ...draft, name: '', ...action, error: '' })
    return true
  }
  const sheet = get(activeWorkbookSheetAtom)
  const cell = get(selectionSnapshotAtom).activeCell
  if (!sheet || cell.sheetId !== sheet.id || !panel.selected) return false
  const permission = set(resolveContentMutationAtom, { kind: 'set-cell-input', sheetId: sheet.id, cell })
  if (permission.status !== 'allowed') {
    set(draftAtom, { ...draft, error: permission.diagnostic.message })
    return false
  }
  set(draftAtom, null)
  set(scrollToCellAtom, { coord: cell, rowAlign: 'nearest', colAlign: 'nearest' })
  set(startEditingAtom, { sheetId: sheet.id, cell, draft: `=${panel.selected.name}(`, source: 'formula-bar' })
  return true
})
