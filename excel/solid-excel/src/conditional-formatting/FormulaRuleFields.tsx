/** @jsxImportSource solid-js */

import type { Accessor } from 'solid-js'
import type {
  ConditionalFormatEditorDraft,
  ConditionalFormatEditorDraftUpdate,
  FormulaRule,
} from '@einfach/spreadsheet-ui-core'

interface FormulaRuleFieldsProps {
  readonly draft: Accessor<ConditionalFormatEditorDraft | null>
  readonly disabled: Accessor<boolean>
  readonly onUpdate: (update: ConditionalFormatEditorDraftUpdate) => void
}

export function FormulaRuleFields(props: FormulaRuleFieldsProps) {
  function rule(): FormulaRule | null {
    const currentRule = props.draft()?.rule
    return currentRule?.kind === 'formula' ? currentRule : null
  }

  function updateRule(patch: Partial<FormulaRule>) {
    const current = rule()
    if (current !== null) props.onUpdate({ kind: 'rule', rule: { ...current, ...patch } })
  }

  return (
    <>
      <div class="cf-form-row">
        <label class="cf-form-label" for="cf-formula-value">
          Formula
        </label>
        <input
          id="cf-formula-value"
          data-testid="cf-formula-value"
          disabled={props.disabled()}
          value={rule()?.formula ?? ''}
          onChange={(event) => updateRule({ formula: (event.target as HTMLInputElement).value })}
        />
      </div>
      <div class="cf-form-row">
        <label class="cf-form-label" for="cf-formula-background">
          Background
        </label>
        <input
          id="cf-formula-background"
          data-testid="cf-formula-background"
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
