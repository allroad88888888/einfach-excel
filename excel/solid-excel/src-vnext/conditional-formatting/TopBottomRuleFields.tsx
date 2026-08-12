/** @jsxImportSource solid-js */

import type { Accessor } from 'solid-js'
import type {
  ConditionalFormatEditorDraft,
  ConditionalFormatEditorDraftUpdate,
  TopBottomRule,
} from '@einfach/spreadsheet-ui-core'

interface TopBottomRuleFieldsProps {
  readonly draft: Accessor<ConditionalFormatEditorDraft | null>
  readonly disabled: Accessor<boolean>
  readonly onUpdate: (update: ConditionalFormatEditorDraftUpdate) => void
}

export function TopBottomRuleFields(props: TopBottomRuleFieldsProps) {
  function rule(): TopBottomRule | null {
    const currentRule = props.draft()?.rule
    return currentRule?.kind === 'top-bottom' ? currentRule : null
  }

  function updateRule(patch: Partial<TopBottomRule>) {
    const current = rule()
    if (current !== null) props.onUpdate({ kind: 'rule', rule: { ...current, ...patch } })
  }

  return (
    <>
      <div class="cf-form-row">
        <label class="cf-form-label" for="cf-top-bottom-direction">
          Direction
        </label>
        <select
          id="cf-top-bottom-direction"
          data-testid="cf-top-bottom-direction"
          disabled={props.disabled()}
          value={rule()?.direction ?? 'top'}
          onChange={(event) =>
            updateRule({
              direction: (event.target as HTMLSelectElement).value as TopBottomRule['direction'],
            })
          }
        >
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>
      <div class="cf-form-row">
        <label class="cf-form-label" for="cf-top-bottom-count">
          Count
        </label>
        <input
          id="cf-top-bottom-count"
          type="number"
          min="1"
          step="1"
          data-testid="cf-top-bottom-count"
          disabled={props.disabled()}
          value={rule()?.count ?? ''}
          onChange={(event) =>
            updateRule({ count: Number((event.target as HTMLInputElement).value) })
          }
        />
      </div>
      <div class="cf-form-row">
        <label class="cf-form-label" for="cf-top-bottom-percent">
          Percent
        </label>
        <input
          id="cf-top-bottom-percent"
          type="checkbox"
          data-testid="cf-top-bottom-percent"
          disabled={props.disabled()}
          checked={rule()?.percent ?? false}
          onChange={(event) => updateRule({ percent: (event.target as HTMLInputElement).checked })}
        />
      </div>
      <div class="cf-form-row">
        <label class="cf-form-label" for="cf-top-bottom-background">
          Background
        </label>
        <input
          id="cf-top-bottom-background"
          data-testid="cf-top-bottom-background"
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
