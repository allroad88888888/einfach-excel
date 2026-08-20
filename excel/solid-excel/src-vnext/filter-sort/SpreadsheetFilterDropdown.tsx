import { Show, createEffect, createMemo } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { useT } from '../../src/i18n'
import {
  captureFilterSortCapabilityAtom,
  captureSortRangeCapabilityAtom,
  closeFilterDropdownAtom,
  filterDropdownAtom,
  filterSortCapabilityAtom,
  filterSortCanCloseAtom,
  filterSortDraftAtom,
  filterSortErrorAtom,
  filterSortLifecycleAtom,
  filterSortStateAtom,
  getColumnLabel,
  runFilterSortMutationAtom,
  retryFilterSortRefreshAtom,
  sortRangeSupportedAtom,
  updateFilterSortAvailableValuesAtom,
  updateFilterSortDraftAtom,
  type ColumnFilterRule,
  type FilterSortDraftPatch,
  type FilterSortMutationIntent,
  type FilterSortState,
  type SortDirection,
} from '@einfach/spreadsheet-ui-core'
import {
  createHistoryEntryRecorder,
  refreshVisibleProjection,
  spreadsheetProjectionSnapshotAtom,
  useSpreadsheetBackend,
  useSpreadsheetUiStore,
} from '../provider'
import { SortConfirmationDialog } from '../sort/SortConfirmationDialog'
import { useSortConfirmation } from '../sort/useSortConfirmation'
import { FilterDropdownPresentation } from './FilterDropdownPresentation'
import { useFilterDropdownFocus } from './filter-dropdown-focus'

if (typeof process === 'undefined' || !process.env.JEST_WORKER_ID) {
  void import('@einfach/spreadsheet-ui-styles/features/filter-dropdown.css')
}

export interface SpreadsheetFilterDropdownProps {
  class?: string
  'data-testid'?: string
}

const EMPTY_STATE: FilterSortState = { rules: [] }

function isSummaryLabel(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase()
  return normalized === 'total' || normalized === 'summary'
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

export function SpreadsheetFilterDropdown(props: SpreadsheetFilterDropdownProps) {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const sortConfirmation = useSortConfirmation('filter-dropdown')
  const dropdown = useAtomValue(filterDropdownAtom)
  const filterSortState = useAtomValue(filterSortStateAtom)
  const draft = useAtomValue(filterSortDraftAtom)
  const lifecycle = useAtomValue(filterSortLifecycleAtom)
  const capabilityAvailable = useAtomValue(filterSortCapabilityAtom)
  const sortSupported = useAtomValue(sortRangeSupportedAtom)
  const canClose = useAtomValue(filterSortCanCloseAtom)
  const errorText = useAtomValue(filterSortErrorAtom)
  const projectionSnapshot = useAtomValue(spreadsheetProjectionSnapshotAtom)
  let searchInput: HTMLInputElement | undefined
  let retryButton: HTMLButtonElement | undefined

  const isOpen = createMemo(() => dropdown().status === 'open')
  const sheetId = createMemo(() => (dropdown().status === 'open' ? dropdown().sheetId! : ''))
  const colIndex = createMemo(() => (dropdown().status === 'open' ? dropdown().colIndex! : -1))
  const columnLabel = createMemo(() => (colIndex() >= 0 ? getColumnLabel(colIndex()) : ''))
  const currentState = createMemo<FilterSortState>(
    () => filterSortState()[sheetId()] ?? EMPTY_STATE,
  )
  const currentRulesForCol = createMemo<readonly ColumnFilterRule[]>(() =>
    currentState().rules.filter((rule) => rule.colIndex === colIndex()),
  )
  const availableValues = createMemo(() => draft().availableValues)
  const filteredValues = createMemo(() => {
    const needle = draft().searchInput.trim().toLocaleLowerCase()
    if (!needle) return availableValues()
    return availableValues().filter((value) =>
      (value || t('filterSort.blank')).toLocaleLowerCase().includes(needle),
    )
  })
  const selectedValueSet = createMemo(() => new Set(draft().selectedValues))
  const allValuesSelected = createMemo(() => sameValues(draft().selectedValues, availableValues()))
  const visibleValuesSelected = createMemo(() => {
    const visible = filteredValues()
    if (visible.length === 0) return false
    const selected = selectedValueSet()
    return visible.every((value) => selected.has(value))
  })
  const mutationDisabled = createMemo(() => {
    const status = lifecycle().status
    return (
      !capabilityAvailable() ||
      status === 'pending' ||
      status === 'local-acknowledged' ||
      status === 'refreshing' ||
      status === 'refresh-failed' ||
      status === 'outcome-unknown'
    )
  })
  const mutationBusy = createMemo(() => {
    const status = lifecycle().status
    return status === 'pending' || status === 'local-acknowledged' || status === 'refreshing'
  })

  createEffect(() => {
    store.setter(captureFilterSortCapabilityAtom, backend)
    store.setter(captureSortRangeCapabilityAtom, backend)
  })

  createEffect(() => {
    const currentDropdown = dropdown()
    const currentDraft = draft()
    const result = projectionSnapshot().result
    if (
      currentDropdown.status !== 'open' ||
      currentDraft.sheetId !== currentDropdown.sheetId ||
      currentDraft.colIndex !== currentDropdown.colIndex ||
      result?.sheetId !== currentDropdown.sheetId
    ) {
      return
    }
    const rowLabels = new Map<number, string>()
    for (const cell of result.cells) {
      if (cell.col === 0) rowLabels.set(cell.row, cell.displayValue ?? '')
    }
    const values = new Set<string>()
    for (const cell of result.cells) {
      if (cell.col !== currentDropdown.colIndex || cell.row === 0) continue
      if (isSummaryLabel(rowLabels.get(cell.row) ?? '')) continue
      values.add(cell.displayValue ?? '')
    }
    store.setter(updateFilterSortAvailableValuesAtom, {
      sessionId: currentDraft.sessionId,
      sheetId: currentDropdown.sheetId,
      colIndex: currentDropdown.colIndex,
      values: [...values],
    })
  })

  function updateDraft(patch: FilterSortDraftPatch) {
    store.setter(updateFilterSortDraftAtom, { sessionId: draft().sessionId, patch })
  }

  function run(intent: FilterSortMutationIntent) {
    void store.setter(runFilterSortMutationAtom, {
      source: backend,
      historyEntryRecorder: createHistoryEntryRecorder(backend),
      sessionId: draft().sessionId,
      intent,
      refreshProjection: (targetSheetId) => refreshVisibleProjection(store, backend, targetSheetId),
    })
  }

  async function applyDraftAndClose() {
    const sessionId = draft().sessionId
    await store.setter(runFilterSortMutationAtom, {
      source: backend,
      historyEntryRecorder: createHistoryEntryRecorder(backend),
      sessionId,
      intent: { kind: 'apply-draft' },
      refreshProjection: (targetSheetId) => refreshVisibleProjection(store, backend, targetSheetId),
    })
    const settled = store.getter(filterSortLifecycleAtom)
    if (settled.status === 'editing' && settled.sessionId === sessionId) close()
  }

  function runSort(direction: SortDirection) {
    const currentSheetId = sheetId()
    const currentCol = colIndex()
    if (!currentSheetId || currentCol < 0 || typeof backend.sortRange !== 'function') return
    store.setter(closeFilterDropdownAtom)
    sortConfirmation.begin(direction, {
      target: { sheetId: currentSheetId, colIndex: currentCol },
      active: { row: 0, col: currentCol },
    })
  }

  function toggleValue(value: string, checked: boolean) {
    const selected = new Set(draft().selectedValues)
    if (checked) selected.add(value)
    else selected.delete(value)
    updateDraft({ selectedValues: [...selected], selectionMode: 'explicit' })
  }

  function toggleVisibleValues(checked: boolean) {
    const selected = new Set(draft().selectedValues)
    for (const value of filteredValues()) {
      if (checked) selected.add(value)
      else selected.delete(value)
    }
    updateDraft({ selectedValues: [...selected], selectionMode: 'explicit' })
  }

  function close() {
    store.setter(closeFilterDropdownAtom)
  }

  function retryRefresh() {
    void store.setter(retryFilterSortRefreshAtom, {
      refreshProjection: (targetSheetId) => refreshVisibleProjection(store, backend, targetSheetId),
    })
  }

  const getOpener = useFilterDropdownFocus({
    isOpen,
    sessionId: () => draft().sessionId,
    lifecycleStatus: () => lifecycle().status,
    canClose,
    close,
    focusSearch: () => searchInput?.focus(),
    focusRetry: () => retryButton?.focus(),
  })

  return (
    <>
      <Show when={isOpen()}>
        <FilterDropdownPresentation
          class={props.class}
          testId={props['data-testid'] ?? 'filter-dropdown'}
          sheetId={sheetId}
          colIndex={colIndex}
          columnLabel={columnLabel}
          lifecycleStatus={() => lifecycle().status}
          canClose={canClose}
          sortSupported={sortSupported}
          mutationDisabled={mutationDisabled}
          mutationBusy={mutationBusy}
          currentRulesForCol={currentRulesForCol}
          draft={draft}
          filteredValues={filteredValues}
          selectedValueSet={selectedValueSet}
          availableValues={availableValues}
          allValuesSelected={allValuesSelected}
          visibleValuesSelected={visibleValuesSelected}
          errorText={errorText}
          updateDraft={updateDraft}
          toggleValue={toggleValue}
          toggleVisibleValues={toggleVisibleValues}
          run={run}
          runSort={runSort}
          applyDraftAndClose={applyDraftAndClose}
          retryRefresh={retryRefresh}
          close={close}
          setSearchInput={(node) => (searchInput = node)}
          setRetryButton={(node) => (retryButton = node)}
        />
      </Show>
      <SortConfirmationDialog
        anchorRef={getOpener}
        owner="filter-dropdown"
        state={sortConfirmation.state()}
        t={t}
        onCancel={sortConfirmation.cancel}
        onConfirm={sortConfirmation.confirm}
        onRetry={sortConfirmation.retry}
      />
    </>
  )
}
