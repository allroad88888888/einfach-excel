import { FILTER_SORT_INVALID_INPUT_ERROR } from './constants'
import type {
  ColumnFilterRule,
  FilterSortDraftState,
  FilterSortState,
  RunFilterSortMutationInput,
} from './types'

export const CLOSED_FILTER_DROPDOWN_STATE = Object.freeze({ status: 'closed' } as const)

export const INITIAL_FILTER_SORT_DRAFT: FilterSortDraftState = Object.freeze({
  sessionId: 0,
  sheetId: null,
  colIndex: null,
  searchInput: '',
  selectedValues: Object.freeze([]),
  selectionMode: 'all',
  conditionKind: 'none',
  equalsInput: '',
  containsInput: '',
  rangeMinInput: '',
  rangeMaxInput: '',
  availableValues: Object.freeze([]),
})

export const openFilterDropdownState = (sheetId: string, colIndex: number) =>
  Object.freeze({ status: 'open' as const, sheetId, colIndex })

export const snapshotFilterSortDraft = (draft: FilterSortDraftState): FilterSortDraftState =>
  Object.freeze({
    ...draft,
    selectedValues: Object.freeze([...draft.selectedValues]),
    availableValues: Object.freeze([...draft.availableValues]),
  })

export const closedFilterSortDraft = (sessionId: number): FilterSortDraftState =>
  snapshotFilterSortDraft({ ...INITIAL_FILTER_SORT_DRAFT, sessionId })

export function sortFilterValues(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left === ''
      ? -1
      : right === ''
        ? 1
        : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
  )
}

export const sameValues = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value) => new Set(right).has(value))

export function draftFromState(
  sessionId: number,
  sheetId: string,
  colIndex: number,
  state: FilterSortState,
  knownValues: readonly string[] = [],
): FilterSortDraftState {
  const rules = state.rules.filter((rule) => rule.colIndex === colIndex)
  const listRule = rules.find(
    (rule): rule is Extract<ColumnFilterRule, { kind: 'list' }> => rule.kind === 'list',
  )
  const equalsRule = rules.find(
    (rule): rule is Extract<ColumnFilterRule, { kind: 'equals' }> => rule.kind === 'equals',
  )
  const containsRule = rules.find(
    (rule): rule is Extract<ColumnFilterRule, { kind: 'contains' }> => rule.kind === 'contains',
  )
  const rangeRule = rules.find(
    (rule): rule is Extract<ColumnFilterRule, { kind: 'range' }> => rule.kind === 'range',
  )
  const availableValues = sortFilterValues([...(listRule?.values ?? []), ...knownValues])
  return snapshotFilterSortDraft({
    sessionId,
    sheetId,
    colIndex,
    searchInput: '',
    selectedValues: listRule ? sortFilterValues(listRule.values) : [...availableValues],
    selectionMode: listRule ? 'explicit' : 'all',
    conditionKind: equalsRule ? 'equals' : containsRule ? 'contains' : rangeRule ? 'range' : 'none',
    equalsInput: equalsRule?.value ?? '',
    containsInput: containsRule?.value ?? '',
    rangeMinInput: rangeRule?.min === undefined ? '' : String(rangeRule.min),
    rangeMaxInput: rangeRule?.max === undefined ? '' : String(rangeRule.max),
    availableValues,
  })
}

function parseNumberInput(value: string): { valid: boolean; value?: number } {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { valid: true }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? { valid: true, value: parsed } : { valid: false }
}

export function deriveMutationState(
  current: FilterSortState,
  draft: FilterSortDraftState,
  intent: RunFilterSortMutationInput['intent'],
): { state: FilterSortState | null; error: string | null } {
  const colIndex = draft.colIndex
  if (colIndex === null || !Number.isSafeInteger(colIndex) || colIndex < 0)
    return { state: null, error: FILTER_SORT_INVALID_INPUT_ERROR }
  if (intent.kind === 'clear-filter' || intent.kind === 'clear-column')
    return {
      state: { rules: current.rules.filter((rule) => rule.colIndex !== colIndex) },
      error: null,
    }
  const rules: ColumnFilterRule[] = current.rules.filter((rule) => rule.colIndex !== colIndex)
  const selected = sortFilterValues(
    draft.selectedValues.filter((value) => draft.availableValues.includes(value)),
  )
  if (draft.availableValues.length > 0 && !sameValues(selected, draft.availableValues))
    rules.push({ kind: 'list', colIndex, values: selected })
  if (draft.conditionKind === 'equals' && draft.equalsInput.length > 0)
    rules.push({ kind: 'equals', colIndex, value: draft.equalsInput })
  else if (draft.conditionKind === 'contains' && draft.containsInput.length > 0)
    rules.push({ kind: 'contains', colIndex, value: draft.containsInput })
  else if (draft.conditionKind === 'range') {
    const min = parseNumberInput(draft.rangeMinInput)
    const max = parseNumberInput(draft.rangeMaxInput)
    if (
      !min.valid ||
      !max.valid ||
      (min.value !== undefined && max.value !== undefined && min.value > max.value)
    )
      return { state: null, error: FILTER_SORT_INVALID_INPUT_ERROR }
    if (min.value !== undefined || max.value !== undefined)
      rules.push({
        kind: 'range',
        colIndex,
        ...(min.value === undefined ? {} : { min: min.value }),
        ...(max.value === undefined ? {} : { max: max.value }),
      })
  }
  return { state: { rules }, error: null }
}
