/** @jsxImportSource solid-js */

import { Show, type Accessor } from 'solid-js'
import type {
  ValidationMode,
  ValidationRuleFormState,
  ValidationRuleKind,
} from '@einfach/spreadsheet-ui-core'

interface ValidationRuleFieldsProps {
  readonly form: Accessor<Readonly<ValidationRuleFormState>>
  readonly disabled: Accessor<boolean>
  readonly translate: (id: string) => string
  readonly onUpdate: (patch: Partial<ValidationRuleFormState>) => void
}

/** Renders data-validation form controls from an Atom-owned form snapshot. */
export function ValidationRuleFields(props: ValidationRuleFieldsProps) {
  return (
    <>
      <div class="dv-form-row">
        <label for="validation-kind-select">
          {props.translate('dataValidation.ruleType')}
          <select
            id="validation-kind-select"
            class="validation-kind-select"
            data-testid="validation-kind-select"
            value={props.form().kind}
            disabled={props.disabled()}
            onChange={(event) => {
              props.onUpdate({
                kind: (event.target as HTMLSelectElement).value as ValidationRuleKind,
              })
            }}
          >
            <option value="list">{props.translate('dataValidation.rule.list')}</option>
            <option value="range">{props.translate('dataValidation.rule.range')}</option>
            <option value="regex">{props.translate('dataValidation.rule.regex')}</option>
            <option value="formula">{props.translate('dataValidation.rule.formula')}</option>
          </select>
        </label>
      </div>

      <Show when={props.form().kind === 'list'}>
        <div class="dv-form-row">
          <label for="validation-list-values">
            {props.translate('dataValidation.values')}
            <input
              id="validation-list-values"
              type="text"
              class="validation-list-values"
              data-testid="validation-list-values"
              value={props.form().listValues}
              disabled={props.disabled()}
              onInput={(event) => props.onUpdate({ listValues: event.currentTarget.value })}
            />
          </label>
        </div>
      </Show>

      <Show when={props.form().kind === 'range'}>
        <div class="dv-form-row">
          <label>{props.translate('dataValidation.minMax')}</label>
          <div class="dv-range-pair">
            <input
              type="number"
              class="validation-range-min"
              data-testid="validation-range-min"
              aria-label={props.translate('dataValidation.min')}
              placeholder={props.translate('dataValidation.min')}
              value={props.form().rangeMin}
              disabled={props.disabled()}
              onInput={(event) => props.onUpdate({ rangeMin: event.currentTarget.value })}
            />
            <input
              type="number"
              class="validation-range-max"
              data-testid="validation-range-max"
              aria-label={props.translate('dataValidation.max')}
              placeholder={props.translate('dataValidation.max')}
              value={props.form().rangeMax}
              disabled={props.disabled()}
              onInput={(event) => props.onUpdate({ rangeMax: event.currentTarget.value })}
            />
          </div>
        </div>
      </Show>

      <Show when={props.form().kind === 'regex'}>
        <div class="dv-form-row">
          <label for="validation-regex-pattern">
            {props.translate('dataValidation.pattern')}
            <input
              id="validation-regex-pattern"
              type="text"
              class="validation-regex-pattern"
              data-testid="validation-regex-pattern"
              value={props.form().regexPattern}
              disabled={props.disabled()}
              onInput={(event) => props.onUpdate({ regexPattern: event.currentTarget.value })}
            />
          </label>
        </div>
      </Show>

      <Show when={props.form().kind === 'formula'}>
        <div class="dv-form-row">
          <label for="validation-formula-text">
            {props.translate('dataValidation.formula')}
            <input
              id="validation-formula-text"
              type="text"
              class="validation-formula-text"
              data-testid="validation-formula-text"
              value={props.form().formulaText}
              disabled={props.disabled()}
              onInput={(event) => props.onUpdate({ formulaText: event.currentTarget.value })}
            />
          </label>
        </div>
      </Show>

      <div class="dv-form-row">
        <label for="validation-mode-select">
          {props.translate('dataValidation.mode')}
          <select
            id="validation-mode-select"
            class="validation-mode-select"
            data-testid="validation-mode-select"
            value={props.form().mode}
            disabled={props.disabled()}
            onChange={(event) => {
              props.onUpdate({ mode: event.target.value as ValidationMode })
            }}
          >
            <option value="warn">{props.translate('dataValidation.mode.warn')}</option>
            <option value="reject">{props.translate('dataValidation.mode.reject')}</option>
          </select>
        </label>
      </div>
    </>
  )
}
