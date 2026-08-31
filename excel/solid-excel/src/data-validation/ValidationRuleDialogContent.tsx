/** @jsxImportSource solid-js */

import { Show, type Accessor } from 'solid-js'
import type {
  ValidationRuleEditorState,
  ValidationRuleFormState,
} from '@einfach/spreadsheet-ui-core'
import { ValidationRuleFields } from './ValidationRuleFields'

interface ValidationRuleDialogContentProps {
  readonly class?: string
  readonly 'data-testid'?: string
  readonly dialogRef: (element: HTMLDivElement) => void
  readonly onDialogKeyDown: (event: KeyboardEvent) => void
  readonly editor: Accessor<ValidationRuleEditorState>
  readonly form: Accessor<Readonly<ValidationRuleFormState>>
  readonly rangeLabel: Accessor<string>
  readonly actionsDisabled: Accessor<boolean>
  readonly translate: (id: string) => string
  readonly onUpdate: (patch: Partial<ValidationRuleFormState>) => void
  readonly onClose: () => void
  readonly onClear: () => void
  readonly onSave: () => void
}

const TITLE_ID = 'data-validation-dialog-title'
const RANGE_ID = 'data-validation-dialog-range'
const ERROR_ID = 'data-validation-dialog-error'

/** Presents an Atom-owned editor state without introducing product-local state. */
export function ValidationRuleDialogContent(props: ValidationRuleDialogContentProps) {
  return (
    <div
      ref={props.dialogRef}
      class={`validation-dialog spreadsheet-validation-dialog ${props.class ?? ''}`.trim()}
      data-testid={props['data-testid'] ?? 'validation-dialog'}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      aria-describedby={props.editor().error ? `${RANGE_ID} ${ERROR_ID}` : RANGE_ID}
      aria-busy={props.editor().pending}
      tabindex="-1"
      onKeyDown={props.onDialogKeyDown}
    >
      <div class="dv-dialog-header">
        <h2 class="dv-dialog-title" id={TITLE_ID}>
          {props.translate('dataValidation.title')}
        </h2>
        <button
          type="button"
          class="dialog-close-x"
          data-testid="dialog-close-x"
          aria-label={props.translate('dialog.close.label')}
          onClick={props.onClose}
        >
          ×
        </button>
      </div>

      <div class="dv-dialog-body">
        <div class="dv-range-row" id={RANGE_ID}>
          <span class="dv-range-label">{props.translate('dataValidation.range')}</span>
          <output class="validation-range" data-testid="validation-range">
            {props.rangeLabel()}
          </output>
        </div>

        <ValidationRuleFields
          form={props.form}
          disabled={props.actionsDisabled}
          translate={props.translate}
          onUpdate={props.onUpdate}
        />
      </div>

      <Show when={props.editor().error}>
        <div class="dv-error" data-testid="validation-error-text" id={ERROR_ID} role="alert">
          {props.editor().error}
        </div>
      </Show>

      <div class="dv-dialog-footer">
        <button
          type="button"
          class="validation-clear-button"
          data-testid="validation-clear-button"
          data-variant="danger"
          disabled={props.actionsDisabled()}
          aria-describedby={props.editor().error ? ERROR_ID : undefined}
          onClick={props.onClear}
        >
          {props.translate('dataValidation.clear')}
        </button>
        <span class="dv-footer-status" role="status" aria-live="polite">
          <Show when={props.editor().pending}>
            <span class="dv-pending-indicator" aria-hidden="true" />
            <span data-testid="validation-pending-text">
              {props.translate('status.projection.loading')}
            </span>
          </Show>
        </span>
        <button
          type="button"
          class="validation-cancel-button"
          data-testid="validation-cancel-button"
          onClick={props.onClose}
        >
          {props.translate('dataValidation.cancel')}
        </button>
        <button
          type="button"
          class="validation-save-button"
          data-testid="validation-save-button"
          data-variant="primary"
          disabled={props.actionsDisabled()}
          aria-describedby={props.editor().error ? ERROR_ID : undefined}
          onClick={props.onSave}
        >
          {props.translate('dataValidation.save')}
        </button>
      </div>
    </div>
  )
}
