import { atom } from '@einfach/core'
import {
  changeSubtotalListAtom, inspectSubtotalListAtom, subtotalSelectionAtom,
  type SubtotalAction, type SubtotalFunction, type SubtotalList, type SubtotalPlacement,
  type SubtotalSelection,
} from '@einfach-excel/spreadsheet-ui-core'

export interface SubtotalDraft {
  readonly groupByColumn: number
  readonly function: SubtotalFunction
  readonly columns: readonly number[]
  readonly placement: SubtotalPlacement
  readonly replace: boolean
}

interface Panel {
  readonly context: SubtotalSelection
  readonly list: SubtotalList | null
  readonly draft: SubtotalDraft
  readonly busy: boolean
  readonly error: string | null
}

const initialDraft: SubtotalDraft = {
  groupByColumn: 0, function: 'sum', columns: [], placement: 'below', replace: true,
}

type Action =
  | 'open' | 'close' | 'refresh' | 'remove'
  | { readonly patch: Partial<SubtotalDraft> }
  | { readonly totalSuffix: string; readonly grandTotal: string }

const stateAtom = atom<Panel | null>(null)

export const subtotalPanelAtom = atom((get) => {
  const state = get(stateAtom)
  const selection = get(subtotalSelectionAtom)
  return state && selection?.connection === state.context.connection &&
    selection.sheetId === state.context.sheetId ? state : null
})

export const configureSubtotalAtom = atom(null, async (get, set, action: Action) => {
  const panel = get(subtotalPanelAtom)
  if (action === 'close') {
    set(stateAtom, null)
    return true
  }
  if (panel?.busy) return false
  const context = get(subtotalSelectionAtom)
  if (!context || context.disabled) return false
  if (action === 'open' || action === 'refresh') {
    if (action === 'open' && panel) return false
    const base = panel
      ? { ...panel, context }
      : { context, list: null, draft: initialDraft, busy: false, error: null }
    const pending = { ...base, busy: true, error: null }
    set(stateAtom, pending)
    try {
      const query = set(inspectSubtotalListAtom, {
        sheetId: context.sheetId, range: context.range,
      })
      await Promise.resolve()
      if (get(subtotalPanelAtom) === pending) set(stateAtom, pending)
      const list = await query
      if (get(subtotalPanelAtom) !== pending) {
        if (get(stateAtom) === pending) set(stateAtom, null)
        return false
      }
      const fields = new Set(list.fields.map(field => field.column))
      const groupByColumn = base.list && fields.has(base.draft.groupByColumn)
        ? base.draft.groupByColumn : list.fields[0]?.column ?? 0
      const columns = base.list ? base.draft.columns.filter(column => fields.has(column))
        : list.fields.length ? [list.fields.at(-1)!.column] : []
      set(stateAtom, { ...pending, list, busy: false, error: list.notice ?? null, draft: {
        ...base.draft, groupByColumn, columns,
        placement: list.placement ?? base.draft.placement,
      } })
      return true
    } catch (error) {
      if (get(subtotalPanelAtom) === pending) set(stateAtom, {
        ...pending, busy: false, list: null,
        error: error instanceof Error ? error.message : String(error),
      })
      else if (get(stateAtom) === pending) set(stateAtom, null)
      return false
    }
  }
  if (!panel?.list) return false
  if (typeof action === 'object' && 'patch' in action) {
    set(stateAtom, { ...panel, draft: { ...panel.draft, ...action.patch }, error: null })
    return true
  }
  const command: SubtotalAction = action === 'remove' ? { kind: 'remove' } : {
    kind: 'apply',
    settings: {
      groupByColumn: panel.draft.groupByColumn, placement: panel.draft.placement,
      replace: panel.draft.replace, calculation: {
        function: panel.draft.function, columns: panel.draft.columns,
      },
      ...action,
    },
  }
  const pending = { ...panel, busy: true, error: null }
  set(stateAtom, pending)
  try {
    const result = set(changeSubtotalListAtom, {
      sheetId: context.sheetId, list: panel.list, action: command,
    })
    await Promise.resolve()
    if (get(subtotalPanelAtom) === pending) set(stateAtom, pending)
    const changed = await result
    if (get(subtotalPanelAtom) !== pending) {
      if (get(stateAtom) === pending) set(stateAtom, null)
      return false
    }
    if (!changed) {
      set(stateAtom, {
        ...pending, busy: false, error: 'This subtotal calculation is already included.',
      })
      return false
    }
    set(stateAtom, null)
    return true
  } catch (error) {
    if (get(subtotalPanelAtom) === pending) set(stateAtom, {
      ...pending, busy: false, error: error instanceof Error ? error.message : String(error),
    })
    else if (get(stateAtom) === pending) set(stateAtom, null)
    return false
  }
})
stateAtom.debugLabel = 'plugin.dataSubtotal.state'
subtotalPanelAtom.debugLabel = 'plugin.dataSubtotal.panel'
configureSubtotalAtom.debugLabel = 'plugin.dataSubtotal.configure'
