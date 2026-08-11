import { Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type {
  FindReplaceCapabilityProjection,
  FindReplaceFormState,
  FindReplaceRefreshRecoveryState,
  ReplaceAllCapInfo,
} from '@einfach/spreadsheet-ui-core'
import { useT } from '../../src/i18n'
import { FindReplaceDialogFields } from './FindReplaceDialogFields'

export interface FindReplaceDialogContentProps {
  readonly class?: string
  readonly 'data-testid'?: string
  readonly capability: Accessor<FindReplaceCapabilityProjection>
  readonly form: Accessor<FindReplaceFormState>
  readonly mutationBlocked: Accessor<boolean>
  readonly pending: Accessor<boolean>
  readonly refreshRecovery: Accessor<FindReplaceRefreshRecoveryState>
  readonly replaceAllCapped: Accessor<ReplaceAllCapInfo | null>
  readonly statusText: Accessor<string>
  readonly errorText: Accessor<string>
  readonly setNeedleRef: (element: HTMLInputElement) => void
  readonly closeDialog: () => void
  readonly runSearch: () => void | Promise<void>
  readonly handleFindStep: (direction: 1 | -1) => void | Promise<void>
  readonly handleReplace: (action: 'replace-current' | 'replace-all') => void | Promise<void>
  readonly handleRefreshRecovery: () => void | Promise<void>
  readonly updateForm: (patch: Partial<FindReplaceFormState>) => void
}

export function FindReplaceDialogContent(props: FindReplaceDialogContentProps) {
  const t = useT()

  function replaceDisabled() {
    return props.pending() || props.mutationBlocked() || !props.capability().replaceEnabled
  }

  return (
    <div
      class={`find-replace-dialog ${props.class ?? ''}`.trim()}
      data-testid={props['data-testid'] ?? 'find-replace-dialog'}
      data-active-tab={props.form().activeTab}
      data-capability={props.capability().capability}
      role="dialog"
      aria-modal="true"
      aria-labelledby="find-replace-dialog-title"
    >
      <div class="fr-header">
        <span id="find-replace-dialog-title" class="fr-title">
          {t('findReplace.title')}
        </span>
        <button
          type="button"
          class="dialog-close-x"
          data-testid="dialog-close-x"
          aria-label={t('dialog.close.label')}
          onClick={props.closeDialog}
        >
          ×
        </button>
      </div>

      <FindReplaceDialogFields
        capability={props.capability}
        form={props.form}
        pending={props.pending}
        setNeedleRef={props.setNeedleRef}
        runSearch={props.runSearch}
        handleFindStep={props.handleFindStep}
        updateForm={props.updateForm}
      />

      <div class="fr-status" data-testid="find-status-text" aria-live="polite">
        {props.statusText()}
      </div>
      <Show when={props.replaceAllCapped()}>
        <div class="fr-capped" data-testid="replace-all-capped-text" role="status">
          {t('findReplace.replaceAll.capped', {
            acknowledged: props.replaceAllCapped()?.acknowledgedProjectionCount ?? 0,
            total: props.replaceAllCapped()?.totalCount ?? 0,
          })}
        </div>
      </Show>
      <Show when={props.errorText()}>
        <div class="fr-error" data-testid="find-error-text" role="alert">
          {props.errorText()}
        </div>
      </Show>
      <Show when={props.refreshRecovery().status !== 'idle'}>
        <div
          class="fr-status"
          data-testid="find-refresh-status"
          data-phase={props.refreshRecovery().phase ?? undefined}
          role="status"
        >
          {t('findReplace.status.refreshing')}
        </div>
      </Show>

      <div class="fr-footer">
        <Show when={props.refreshRecovery().status === 'required'}>
          <button
            type="button"
            class="fr-btn"
            data-testid="find-refresh-retry-button"
            disabled={!props.capability().findEnabled}
            onClick={() => void props.handleRefreshRecovery()}
          >
            {t('findReplace.action.retryRefresh')}
          </button>
        </Show>
        <button
          type="button"
          class="fr-btn"
          data-testid="replace-all-button"
          data-replace-only="true"
          disabled={replaceDisabled()}
          onClick={() => void props.handleReplace('replace-all')}
        >
          {t('findReplace.replaceAll')}
        </button>
        <button
          type="button"
          class="fr-btn"
          data-testid="replace-button"
          data-replace-only="true"
          disabled={replaceDisabled()}
          onClick={() => void props.handleReplace('replace-current')}
        >
          {t('findReplace.replace')}
        </button>
        <button
          type="button"
          class="fr-btn fr-btn-primary"
          data-testid="find-close-button"
          onClick={props.closeDialog}
        >
          {t('findReplace.close')}
        </button>
      </div>
    </div>
  )
}
