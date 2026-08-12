/** @jsxImportSource solid-js */

import { Show, type Accessor } from 'solid-js'
import type {
  CellValueRule,
  ConditionalFormatEditorDraft,
  ConditionalFormatEditorDraftUpdate,
} from '@einfach/spreadsheet-ui-core'

interface CellValueRuleFieldsProps {
  readonly draft: Accessor<ConditionalFormatEditorDraft | null>
  readonly disabled: Accessor<boolean>
  readonly onUpdate: (update: ConditionalFormatEditorDraftUpdate) => void
}

const OPERATORS: readonly CellValueRule['operator'][] = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'not-between',
]

export function CellValueRuleFields(props: CellValueRuleFieldsProps) {
  function rule(): CellValueRule | null {
    const currentRule = props.draft()?.rule
    return currentRule?.kind === 'cell-value' ? currentRule : null
  }

  function updateRule(patch: Partial<CellValueRule>) {
    const current = rule()
    if (current !== null) props.onUpdate({ kind: 'rule', rule: { ...current, ...patch } })
  }

  const requiresSecondValue = () => {
    const operator = rule()?.operator
    return operator === 'between' || operator === 'not-between'
  }

  return (
    <>
      <div class="cf-form-row">
        <label class="cf-form-label" for="cf-cell-operator">
          Condition
        </label>
        <select
          id="cf-cell-operator"
          data-testid="cf-cell-operator"
          disabled={props.disabled()}
          value={rule()?.operator ?? 'gt'}
          onChange={(event) =>
            updateRule({
              operator: (event.target as HTMLSelectElement).value as CellValueRule['operator'],
            })
          }
        >
          {OPERATORS.map((operator) => (
            <option value={operator}>{operator}</option>
          ))}
        </select>
      </div>
      <div class="cf-form-row">
        <label class="cf-form-label" for="cf-cell-value">
          Value
        </label>
        <input
          id="cf-cell-value"
          data-testid="cf-cell-value"
          disabled={props.disabled()}
          value={rule()?.value ?? ''}
          onChange={(event) => updateRule({ value: (event.target as HTMLInputElement).value })}
        />
      </div>
      <Show when={requiresSecondValue()}>
        <div class="cf-form-row">
          <label class="cf-form-label" for="cf-cell-value-2">
            Second value
          </label>
          <input
            id="cf-cell-value-2"
            data-testid="cf-cell-value-2"
            disabled={props.disabled()}
            value={rule()?.value2 ?? ''}
            onChange={(event) => updateRule({ value2: (event.target as HTMLInputElement).value })}
          />
        </div>
      </Show>
      <div class="cf-form-row">
        <label class="cf-form-label" for="cf-cell-background">
          Background
        </label>
        <input
          id="cf-cell-background"
          data-testid="cf-cell-background"
          disabled={props.disabled()}
          value={rule()?.format.bgColor ?? ''}
          onChange={(event) =>
            updateRule({
              format: { ...rule()?.format, bgColor: (event.target as HTMLInputElement).value },
            })
          }
        />
      </div>
    </>
  )
}
