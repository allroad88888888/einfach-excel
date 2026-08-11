/** @jsxImportSource solid-js */

import { For, Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import { useT } from '../../src/i18n'
import type {
  TextToColumnsIntent,
  TextToColumnsLifecycleState,
  TextToColumnsPreviewRow,
  TextToColumnsWizardState,
} from '@einfach/spreadsheet-ui-core'
import { TextToColumnsWizardSteps } from './TextToColumnsWizardSteps'

interface TextToColumnsDialogContentProps {
  readonly class?: string
  readonly 'data-testid'?: string
  readonly dialogRef: (element: HTMLDivElement) => void
  readonly onDialogKeyDown: (event: KeyboardEvent) => void
  readonly wizard: Accessor<TextToColumnsWizardState>
  readonly preview: Accessor<readonly TextToColumnsPreviewRow[]>
  readonly lifecycle: Accessor<TextToColumnsLifecycleState>
  readonly error: Accessor<string>
  readonly hasSource: Accessor<boolean>
  readonly columnCount: Accessor<number>
  readonly canEdit: Accessor<boolean>
  readonly canClose: Accessor<boolean>
  readonly canGoBack: Accessor<boolean>
  readonly canGoNext: Accessor<boolean>
  readonly canFinish: Accessor<boolean>
  readonly stepLabel: Accessor<string>
  readonly nextDisabledReason: Accessor<string | undefined>
  readonly onIntent: (intent: TextToColumnsIntent) => void
  readonly onClose: () => void
  readonly onBack: () => void
  readonly onNext: () => void
  readonly onFinish: () => void
}

const TITLE_ID = 'text-to-columns-dialog-title'
const ERROR_ID = 'text-to-columns-dialog-error'

/** Renders the dialog shell and binds it to atom-derived presenter values. */
export function TextToColumnsDialogContent(props: TextToColumnsDialogContentProps) {
  const t = useT()
  const isBusy = () => {
    const status = props.lifecycle().status
    return status === 'pending' || status === 'local-acknowledged' || status === 'refreshing'
  }

  return (
    <div
      ref={props.dialogRef}
      class={`text-to-columns-dialog ${props.class ?? ''}`.trim()}
      data-testid={props['data-testid'] ?? 'text-to-columns-dialog'}
      data-step={props.wizard().step}
      data-lifecycle={props.lifecycle().status}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      aria-busy={isBusy()}
      tabindex="-1"
      onKeyDown={props.onDialogKeyDown}
    >
      <div class="ttc-header">
        <span class="ttc-title" id={TITLE_ID}>
          {t('textToColumns.title')}
        </span>
        <span class="ttc-step-label" data-testid="ttc-step-label">
          {props.stepLabel()}
        </span>
        <button
          type="button"
          class="dialog-close-x"
          data-testid="dialog-close-x"
          aria-label={t('dialog.close.label')}
          disabled={!props.canClose()}
          onClick={props.onClose}
        >
          ×
        </button>
      </div>

      <div class="ttc-body">
        <Show when={!props.hasSource()}>
          <div class="ttc-error" data-testid="ttc-no-source-error" role="alert">
            {t('textToColumns.error.singleColumn')}
          </div>
        </Show>
        <Show when={props.error().length > 0}>
          <div class="ttc-error" data-testid="ttc-mutation-error" id={ERROR_ID} role="alert">
            {props.error()}
          </div>
        </Show>

        <TextToColumnsWizardSteps
          wizard={props.wizard()}
          columnCount={props.columnCount()}
          disabled={!props.canEdit()}
          onIntent={props.onIntent}
        />

        <div class="ttc-preview" data-testid="ttc-preview">
          <div class="ttc-preview-header">{t('textToColumns.preview')}</div>
          <div class="ttc-preview-scroll">
            <table>
              <tbody>
                <For each={props.preview()}>
                  {(row) => (
                    <tr data-testid={`ttc-preview-row-${row.sourceRow}`}>
                      <For each={row.tokens}>
                        {(token, index) => (
                          <td data-testid={`ttc-preview-cell-${row.sourceRow}-${index()}`}>
                            {token}
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="ttc-footer">
        <button
          type="button"
          class="ttc-btn"
          data-testid="ttc-back-button"
          disabled={!props.canGoBack()}
          onClick={props.onBack}
        >
          {t('textToColumns.back')}
        </button>
        <button
          type="button"
          class="ttc-btn"
          data-testid="ttc-next-button"
          disabled={!props.canGoNext()}
          title={props.nextDisabledReason()}
          onClick={props.onNext}
        >
          {t('textToColumns.next')}
        </button>
        <Show when={props.nextDisabledReason()}>
          <span class="ttc-next-disabled-hint" data-testid="ttc-next-disabled-hint" role="status">
            {props.nextDisabledReason()}
          </span>
        </Show>
        <button
          type="button"
          class="ttc-btn"
          data-testid="ttc-cancel-button"
          disabled={!props.canClose()}
          onClick={props.onClose}
        >
          {t('textToColumns.cancel')}
        </button>
        <button
          type="button"
          class="ttc-btn ttc-btn-primary"
          data-testid="ttc-finish-button"
          disabled={!props.canFinish()}
          aria-describedby={props.error().length > 0 ? ERROR_ID : undefined}
          onClick={props.onFinish}
        >
          {t('textToColumns.finish')}
        </button>
      </div>
    </div>
  )
}
