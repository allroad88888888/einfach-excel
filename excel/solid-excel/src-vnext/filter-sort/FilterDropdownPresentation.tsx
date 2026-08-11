import { Show, type Accessor } from 'solid-js'
import { useT } from '../../src/i18n'
import type {
  ColumnFilterRule,
  FilterSortDraftPatch,
  FilterSortDraftState,
  FilterSortMutationIntent,
  SortDirection,
} from '@einfach/spreadsheet-ui-core'
import { FilterDropdownConditions } from './FilterDropdownConditions'

export interface FilterDropdownPresentationProps {
  readonly class?: string
  readonly testId: string
  readonly sheetId: Accessor<string>
  readonly colIndex: Accessor<number>
  readonly columnLabel: Accessor<string>
  readonly lifecycleStatus: Accessor<string>
  readonly canClose: Accessor<boolean>
  readonly sortSupported: Accessor<boolean>
  readonly mutationDisabled: Accessor<boolean>
  readonly mutationBusy: Accessor<boolean>
  readonly currentRulesForCol: Accessor<readonly ColumnFilterRule[]>
  readonly draft: Accessor<FilterSortDraftState>
  readonly filteredValues: Accessor<readonly string[]>
  readonly selectedValueSet: Accessor<ReadonlySet<string>>
  readonly availableValues: Accessor<readonly string[]>
  readonly allValuesSelected: Accessor<boolean>
  readonly visibleValuesSelected: Accessor<boolean>
  readonly errorText: Accessor<string>
  readonly updateDraft: (patch: FilterSortDraftPatch) => void
  readonly toggleValue: (value: string, checked: boolean) => void
  readonly toggleVisibleValues: (checked: boolean) => void
  readonly run: (intent: FilterSortMutationIntent) => void
  readonly runSort: (direction: SortDirection) => void
  readonly applyDraftAndClose: () => void
  readonly retryRefresh: () => void
  readonly close: () => void
  readonly setSearchInput: (node: HTMLInputElement) => void
  readonly setRetryButton: (node: HTMLButtonElement) => void
}

function ruleSummary(rule: ColumnFilterRule): string {
  switch (rule.kind) {
    case 'equals':
      return `= ${rule.value}`
    case 'contains':
      return `* ${rule.value}`
    case 'range':
      if (rule.min !== undefined && rule.max !== undefined) return `${rule.min}..${rule.max}`
      if (rule.min !== undefined) return `>= ${rule.min}`
      if (rule.max !== undefined) return `<= ${rule.max}`
      return 'range'
    case 'list':
      return `${rule.values.length} values`
  }
}

export function FilterDropdownPresentation(props: FilterDropdownPresentationProps) {
  const t = useT()

  return (
    <div
      class={`filter-dropdown spreadsheet-filter-dropdown ${props.class ?? ''}`.trim()}
      data-testid={props.testId}
      data-sheet-id={props.sheetId()}
      data-col-index={props.colIndex()}
      data-filter-sort-status={props.lifecycleStatus()}
      data-filter-sort-can-close={props.canClose() ? 'true' : 'false'}
      role="dialog"
      aria-label={t('filterSort.title')}
      aria-busy={props.mutationBusy()}
      aria-describedby={props.errorText() ? 'filter-dropdown-error' : undefined}
    >
      <div class="filter-dropdown-header">
        <div>
          <div class="filter-dropdown-title">{t('filterSort.title')}</div>
          <div class="filter-dropdown-subtitle">
            {t('filterSort.column', { column: props.columnLabel() })}
          </div>
        </div>
        <button
          type="button"
          class="dialog-close-x"
          data-testid="dialog-close-x"
          aria-label={t('dialog.close.label')}
          disabled={!props.canClose()}
          onClick={props.close}
        >
          ×
        </button>
      </div>

      <Show when={props.currentRulesForCol().length > 0}>
        <div class="filter-dropdown-rules" data-testid="filter-active-summary">
          {props.currentRulesForCol().map((rule, index) => (
            <span class="filter-rule" data-rule-index={index} data-rule-kind={rule.kind}>
              {ruleSummary(rule)}
            </span>
          ))}
        </div>
      </Show>

      <Show when={props.sortSupported()}>
        <div class="filter-section" data-testid="filter-sort-section">
          <div class="filter-section-title">{t('filterSort.sortSection')}</div>
          <div class="filter-action-row">
            <button
              type="button"
              class="filter-btn"
              data-testid="filter-sort-asc"
              disabled={props.mutationDisabled()}
              onClick={() => void props.runSort('asc')}
            >
              {t('filterSort.sortAsc')}
            </button>
            <button
              type="button"
              class="filter-btn"
              data-testid="filter-sort-desc"
              disabled={props.mutationDisabled()}
              onClick={() => void props.runSort('desc')}
            >
              {t('filterSort.sortDesc')}
            </button>
          </div>
        </div>
      </Show>

      <div class="filter-section">
        <div class="filter-section-title">{t('filterSort.valuesSection')}</div>
        <input
          ref={props.setSearchInput}
          class="filter-search-input"
          data-testid="filter-search-input"
          type="search"
          value={props.draft().searchInput}
          disabled={props.mutationDisabled()}
          placeholder={t('filterSort.searchValues')}
          onInput={(event) => props.updateDraft({ searchInput: event.currentTarget.value })}
        />
        <label class="filter-value-option filter-value-option-all">
          <input
            data-testid="filter-values-select-visible"
            type="checkbox"
            checked={props.visibleValuesSelected()}
            disabled={props.mutationDisabled()}
            onChange={(event) => props.toggleVisibleValues(event.currentTarget.checked)}
          />
          <span>{t('filterSort.selectVisible')}</span>
        </label>
        <div class="filter-values-list" data-testid="filter-values-list">
          <Show
            when={props.filteredValues().length > 0}
            fallback={<div class="filter-empty-values">{t('filterSort.noValues')}</div>}
          >
            {props.filteredValues().map((value) => (
              <label class="filter-value-option" data-filter-value={value}>
                <input
                  type="checkbox"
                  data-testid={`filter-value-${value === '' ? '__blank__' : value}`}
                  checked={props.selectedValueSet().has(value)}
                  disabled={props.mutationDisabled()}
                  onChange={(event) => props.toggleValue(value, event.currentTarget.checked)}
                />
                <span>{value === '' ? t('filterSort.blank') : value}</span>
              </label>
            ))}
          </Show>
        </div>
        <div class="filter-values-count" data-testid="filter-values-count">
          {props.draft().selectedValues.length} / {props.availableValues().length}
          {props.allValuesSelected() ? ` ${t('filterSort.allSelected')}` : ''}
        </div>
      </div>

      <FilterDropdownConditions
        draft={props.draft}
        mutationDisabled={props.mutationDisabled}
        updateDraft={props.updateDraft}
        applyDraftAndClose={props.applyDraftAndClose}
      />

      <Show when={props.errorText().length > 0}>
        <div
          id="filter-dropdown-error"
          class="filter-error"
          data-testid="filter-error-text"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {props.errorText()}
        </div>
      </Show>

      <Show when={props.lifecycleStatus() === 'refresh-failed'}>
        <button
          ref={props.setRetryButton}
          type="button"
          class="filter-btn filter-btn-secondary"
          data-testid="filter-refresh-retry"
          aria-label="Retry filter and sort refresh"
          onClick={props.retryRefresh}
        >
          ↻
        </button>
      </Show>

      <div class="filter-footer">
        <div class="filter-footer-group">
          <button
            type="button"
            class="filter-btn filter-btn-secondary"
            data-testid="filter-clear-filter"
            disabled={props.mutationDisabled()}
            onClick={() => props.run({ kind: 'clear-filter' })}
          >
            {t('filterSort.clearFilter')}
          </button>
          <button
            type="button"
            class="filter-btn filter-btn-secondary"
            data-testid="filter-clear"
            disabled={props.mutationDisabled()}
            onClick={() => props.run({ kind: 'clear-column' })}
          >
            {t('filterSort.clear')}
          </button>
        </div>
        <div class="filter-footer-group">
          <button
            type="button"
            class="filter-btn filter-btn-secondary"
            data-testid="filter-close"
            disabled={!props.canClose()}
            onClick={props.close}
          >
            {t('filterSort.cancel')}
          </button>
          <button
            type="button"
            class="filter-btn filter-btn-primary"
            data-testid="filter-add-equals"
            disabled={props.mutationDisabled()}
            onClick={props.applyDraftAndClose}
          >
            {t('filterSort.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
