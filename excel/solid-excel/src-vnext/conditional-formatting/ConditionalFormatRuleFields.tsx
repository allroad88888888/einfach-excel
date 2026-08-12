/** @jsxImportSource solid-js */

import { Match, Switch, type Accessor } from 'solid-js'
import type {
  ConditionalFormatEditorDraft,
  ConditionalFormatEditorDraftUpdate,
} from '@einfach/spreadsheet-ui-core'
import { CellValueRuleFields } from './CellValueRuleFields'
import { ColorRuleFields } from './ColorRuleFields'
import { FormulaRuleFields } from './FormulaRuleFields'
import { TopBottomRuleFields } from './TopBottomRuleFields'

interface ConditionalFormatRuleFieldsProps {
  readonly draft: Accessor<ConditionalFormatEditorDraft | null>
  readonly disabled: Accessor<boolean>
  readonly onUpdate: (update: ConditionalFormatEditorDraftUpdate) => void
  readonly onUseSelection: () => void
}

type RangeField = 'rowStart' | 'rowEnd' | 'colStart' | 'colEnd'

function rangeLabel(field: RangeField): string {
  switch (field) {
    case 'rowStart':
      return 'Start row'
    case 'rowEnd':
      return 'End row'
    case 'colStart':
      return 'Start column'
    case 'colEnd':
      return 'End column'
  }
}

export function ConditionalFormatRuleFields(props: ConditionalFormatRuleFieldsProps) {
  function updateRange(field: RangeField, event: Event) {
    const draft = props.draft()
    if (draft?.scope === null || draft === null) return
    const raw = (event.target as HTMLInputElement).value
    const value = raw.trim().length === 0 ? Number.NaN : Number(raw)
    props.onUpdate({
      kind: 'scope',
      scope: { range: { ...draft.scope.range, [field]: value } },
    })
  }

  function updatePriority(event: Event) {
    const raw = (event.target as HTMLInputElement).value
    props.onUpdate({ kind: 'priority', priority: raw.trim().length === 0 ? null : Number(raw) })
  }

  return (
    <>
      <div class="cf-form-row">
        <span class="cf-form-label">Range</span>
        <div class="cf-range-fields">
          {(['rowStart', 'rowEnd', 'colStart', 'colEnd'] as const).map((field) => (
            <input
              type="number"
              min="0"
              aria-label={rangeLabel(field)}
              data-testid={`cf-range-${field}`}
              disabled={props.disabled() || props.draft()?.scope === null}
              value={props.draft()?.scope?.range[field] ?? ''}
              onChange={(event) => updateRange(field, event)}
            />
          ))}
        </div>
        <button
          type="button"
          data-testid="cf-use-selection-button"
          disabled={props.disabled()}
          onClick={props.onUseSelection}
        >
          Use selection
        </button>
      </div>

      <div class="cf-form-row">
        <label class="cf-form-label" for="cf-priority-input">
          Priority
        </label>
        <input
          id="cf-priority-input"
          type="number"
          min="0"
          step="1"
          data-testid="cf-priority-input"
          disabled={props.disabled()}
          value={props.draft()?.priority ?? ''}
          onChange={updatePriority}
        />
      </div>

      <Switch>
        <Match when={props.draft()?.rule.kind === 'cell-value'}>
          <CellValueRuleFields
            draft={props.draft}
            disabled={props.disabled}
            onUpdate={props.onUpdate}
          />
        </Match>
        <Match when={props.draft()?.rule.kind === 'formula'}>
          <FormulaRuleFields
            draft={props.draft}
            disabled={props.disabled}
            onUpdate={props.onUpdate}
          />
        </Match>
        <Match
          when={
            props.draft()?.rule.kind === 'data-bar' || props.draft()?.rule.kind === 'color-scale'
          }
        >
          <ColorRuleFields
            draft={props.draft}
            disabled={props.disabled}
            onUpdate={props.onUpdate}
          />
        </Match>
        <Match when={props.draft()?.rule.kind === 'top-bottom'}>
          <TopBottomRuleFields
            draft={props.draft}
            disabled={props.disabled}
            onUpdate={props.onUpdate}
          />
        </Match>
      </Switch>
    </>
  )
}
