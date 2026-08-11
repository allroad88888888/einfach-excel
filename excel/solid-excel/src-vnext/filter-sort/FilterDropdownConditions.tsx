import { Show, type Accessor } from 'solid-js'
import { useT } from '../../src/i18n'
import type {
  FilterConditionKind,
  FilterSortDraftPatch,
  FilterSortDraftState,
} from '@einfach/spreadsheet-ui-core'

interface FilterDropdownConditionsProps {
  readonly draft: Accessor<FilterSortDraftState>
  readonly mutationDisabled: Accessor<boolean>
  readonly updateDraft: (patch: FilterSortDraftPatch) => void
  readonly applyDraftAndClose: () => void
}

/** Renders and submits the condition portion of a filter draft. */
export function FilterDropdownConditions(props: FilterDropdownConditionsProps) {
  const t = useT()
  const applyOnEnter = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || props.mutationDisabled()) return
    event.preventDefault()
    props.applyDraftAndClose()
  }

  return (
    <div class="filter-section">
      <div class="filter-section-title">{t('filterSort.conditionSection')}</div>
      <select
        class="filter-condition-select"
        data-testid="filter-condition-kind"
        value={props.draft().conditionKind}
        disabled={props.mutationDisabled()}
        onChange={(event) =>
          props.updateDraft({ conditionKind: event.currentTarget.value as FilterConditionKind })
        }
      >
        <option value="none">{t('filterSort.conditionNone')}</option>
        <option value="equals">{t('filterSort.equals')}</option>
        <option value="contains">{t('filterSort.contains')}</option>
        <option value="range">{t('filterSort.range')}</option>
      </select>

      <Show when={props.draft().conditionKind === 'equals'}>
        <input
          id="filter-equals-input"
          class="filter-condition-input filter-equals-input"
          data-testid="filter-equals-input"
          type="text"
          value={props.draft().equalsInput}
          disabled={props.mutationDisabled()}
          placeholder={t('filterSort.equals')}
          onInput={(event) => props.updateDraft({ equalsInput: event.currentTarget.value })}
          onKeyDown={applyOnEnter}
        />
      </Show>
      <Show when={props.draft().conditionKind === 'contains'}>
        <input
          class="filter-condition-input"
          data-testid="filter-contains-input"
          type="text"
          value={props.draft().containsInput}
          disabled={props.mutationDisabled()}
          placeholder={t('filterSort.contains')}
          onInput={(event) => props.updateDraft({ containsInput: event.currentTarget.value })}
          onKeyDown={applyOnEnter}
        />
      </Show>
      <Show when={props.draft().conditionKind === 'range'}>
        <div class="filter-range-row">
          <input
            class="filter-condition-input"
            data-testid="filter-range-min-input"
            type="number"
            value={props.draft().rangeMinInput}
            disabled={props.mutationDisabled()}
            placeholder={t('filterSort.rangeMin')}
            onInput={(event) => props.updateDraft({ rangeMinInput: event.currentTarget.value })}
            onKeyDown={applyOnEnter}
          />
          <input
            class="filter-condition-input"
            data-testid="filter-range-max-input"
            type="number"
            value={props.draft().rangeMaxInput}
            disabled={props.mutationDisabled()}
            placeholder={t('filterSort.rangeMax')}
            onInput={(event) => props.updateDraft({ rangeMaxInput: event.currentTarget.value })}
            onKeyDown={applyOnEnter}
          />
        </div>
      </Show>
    </div>
  )
}
