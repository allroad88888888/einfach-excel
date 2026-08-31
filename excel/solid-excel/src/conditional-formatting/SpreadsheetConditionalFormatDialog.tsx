/** @jsxImportSource solid-js */

import { Show, For, createEffect } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { useT } from '../i18n'
import {
  conditionalFormatEditorAtom,
  conditionalFormatEditorValidationAtom,
  conditionalFormatRulesCacheAtom,
  conditionalFormatRulesLoadAtom,
  closeConditionalFormatEditorAtom,
  loadConditionalFormatRulesAtom,
  openConditionalFormatEditorAtom,
  runConditionalFormatMutationAtom,
  setConditionalFormatEditorKindAtom,
  syncConditionalFormatRulesSheetAtom,
  updateConditionalFormatEditorDraftAtom,
  useSelectionForConditionalFormatEditorScopeAtom,
  workspaceSessionAtom,
  type ConditionalFormatRuleKind,
} from '@einfach/spreadsheet-ui-core'
import { ConditionalFormatRuleFields } from './ConditionalFormatRuleFields'
import { useOverlayInteraction } from '../overlay'
import { refreshVisibleProjection, useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'

// Pull in the dialog stylesheet as a side-effect import. Vite picks the
// dynamic-import target up statically and bundles the CSS into the chunk;
// the runtime guard skips evaluation under jest so unit tests aren't
// blocked when no CSS transform is configured. The co-located
// `.css.d.ts` keeps tsc satisfied under the Bundler moduleResolution.
if (typeof process === 'undefined' || !process.env.JEST_WORKER_ID) {
  void import('@einfach/spreadsheet-ui-styles/features/conditional-format-dialog.css')
  void import('@einfach/spreadsheet-ui-styles/features/conditional-format-fields.css')
}

export interface SpreadsheetConditionalFormatDialogProps {
  class?: string
  'data-testid'?: string
}

const ruleKinds: ConditionalFormatRuleKind[] = [
  'cell-value',
  'formula',
  'data-bar',
  'color-scale',
  'top-bottom',
]

const DIALOG_TITLE_ID = 'conditional-format-dialog-title'
const RULE_LIST_ID = 'conditional-format-rule-list'
const PREVIEW_ID = 'conditional-format-rule-preview'
const ERROR_ID = 'conditional-format-dialog-error'

export function SpreadsheetConditionalFormatDialog(props: SpreadsheetConditionalFormatDialogProps) {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const editor = useAtomValue(conditionalFormatEditorAtom)
  const editorValidation = useAtomValue(conditionalFormatEditorValidationAtom)
  const rulesCache = useAtomValue(conditionalFormatRulesCacheAtom)
  const rulesLoad = useAtomValue(conditionalFormatRulesLoadAtom)
  const workspace = useAtomValue(workspaceSessionAtom)
  let closeButton: HTMLButtonElement | undefined

  // The view owns the stable forwarding backend port. Core atoms retain only
  // data snapshots and request identities, never backend functions.
  createEffect(() => {
    store.setter(syncConditionalFormatRulesSheetAtom, workspace().activeSheetId)
  })

  createEffect(() => {
    const state = editor()
    const activeSheetId = workspace().activeSheetId
    if (!state.open || activeSheetId === null) return
    void store.setter(loadConditionalFormatRulesAtom, {
      listRules: backend.listConditionalFormatRules
        ? (request) => backend.listConditionalFormatRules!(request)
        : undefined,
    })
  })

  const isEditing = () => editor().open
  const rulesAreLoading = () => {
    const state = editor()
    const load = rulesLoad()
    return (
      load.phase === 'pending' &&
      load.sheetId === state.sheetId &&
      load.sessionId === state.sessionId
    )
  }
  const fieldsDisabled = () => editor().pending || rulesAreLoading()
  const visibleError = () => editorValidation() ?? editor().error

  function kindLabel(kind: ConditionalFormatRuleKind): string {
    return t(`conditionalFormat.kind.${kind}`)
  }

  function currentKind(): ConditionalFormatRuleKind {
    return editor().selectedKind
  }

  function close() {
    store.setter(closeConditionalFormatEditorAtom)
  }

  const overlay = useOverlayInteraction({
    active: isEditing,
    initialFocus: () => closeButton,
    onRequestClose: close,
  })

  async function handleSave() {
    await store.setter(runConditionalFormatMutationAtom, {
      action: 'save',
      setRule: backend.setConditionalFormatRule
        ? (request) => backend.setConditionalFormatRule!(request)
        : undefined,
      listRules: backend.listConditionalFormatRules
        ? (request) => backend.listConditionalFormatRules!(request)
        : undefined,
      acceptAcknowledgedResult: (result) =>
        refreshVisibleProjection(store, backend, result.sheetId),
    })
  }

  async function handleRemove() {
    await store.setter(runConditionalFormatMutationAtom, {
      action: 'remove',
      removeRule: backend.removeConditionalFormatRule
        ? (request) => backend.removeConditionalFormatRule!(request)
        : undefined,
      listRules: backend.listConditionalFormatRules
        ? (request) => backend.listConditionalFormatRules!(request)
        : undefined,
      acceptAcknowledgedResult: (result) =>
        refreshVisibleProjection(store, backend, result.sheetId),
    })
  }

  function handleCancel() {
    close()
  }

  function onKindChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as ConditionalFormatRuleKind
    store.setter(setConditionalFormatEditorKindAtom, value)
  }

  return (
    <Show when={isEditing()}>
      <form
        ref={overlay.overlayRef}
        class={`conditional-format-dialog ${props.class ?? ''}`.trim()}
        data-testid={props['data-testid'] ?? 'conditional-format-dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={DIALOG_TITLE_ID}
        aria-describedby={visibleError() ? ERROR_ID : PREVIEW_ID}
        aria-busy={fieldsDisabled()}
        onSubmit={(event) => {
          event.preventDefault()
          void handleSave()
        }}
      >
        <div class="cf-dialog-header">
          <h2 id={DIALOG_TITLE_ID} class="cf-dialog-title">
            {t('conditionalFormat.title')}
          </h2>
          <button
            type="button"
            class="dialog-close-x"
            data-testid="dialog-close-x"
            aria-label={t('dialog.close.label')}
            ref={(element) => {
              closeButton = element
            }}
            onClick={close}
          >
            ×
          </button>
        </div>

        <div class="cf-dialog-body">
          <div class="cf-rules-section">
            <span class="cf-section-label">{t('conditionalFormat.existingRules')}</span>
            <ul
              id={RULE_LIST_ID}
              class="cf-rule-list"
              data-testid="cf-rule-list"
              aria-label={t('conditionalFormat.existingRules')}
              aria-busy={rulesAreLoading()}
            >
              <For each={rulesCache().rules}>
                {(entry) => (
                  <li data-rule-id={entry.id} data-rule-kind={entry.rule.kind}>
                    <button
                      type="button"
                      class="cf-rule-select"
                      data-testid={`cf-rule-entry-${entry.id}`}
                      data-rule-id={entry.id}
                      data-rule-kind={entry.rule.kind}
                      disabled={fieldsDisabled()}
                      aria-current={editor().ruleId === entry.id ? 'true' : undefined}
                      onClick={() => store.setter(openConditionalFormatEditorAtom, entry)}
                    >
                      {kindLabel(entry.rule.kind)} - {t('conditionalFormat.priority')}{' '}
                      {entry.priority}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>

          <div class="cf-form">
            <div class="cf-form-row">
              <label class="cf-form-label" for="cf-rule-kind-select">
                {t('conditionalFormat.ruleType')}
              </label>
              <select
                id="cf-rule-kind-select"
                data-testid="cf-rule-kind-select"
                value={currentKind()}
                disabled={fieldsDisabled()}
                onChange={onKindChange}
              >
                <For each={ruleKinds}>
                  {(kind) => <option value={kind}>{kindLabel(kind)}</option>}
                </For>
              </select>
            </div>

            <ConditionalFormatRuleFields
              draft={() => editor().draft}
              disabled={fieldsDisabled}
              onUpdate={(update) => store.setter(updateConditionalFormatEditorDraftAtom, update)}
              onUseSelection={() => store.setter(useSelectionForConditionalFormatEditorScopeAtom)}
            />

            <div
              id={PREVIEW_ID}
              class="cf-rule-preview"
              data-rule-kind={currentKind()}
              aria-live="polite"
            >
              <span class="cf-rule-preview-swatch" />
              <span class="cf-rule-preview-text">
                {t('conditionalFormat.preview')} - {kindLabel(currentKind())}
              </span>
            </div>
          </div>
        </div>

        <Show when={visibleError()}>
          <div id={ERROR_ID} class="cf-error" data-testid="cf-error-text" role="alert">
            {visibleError()}
          </div>
        </Show>

        <div class="cf-dialog-footer">
          <button
            type="button"
            data-testid="cf-remove-button"
            data-variant="danger"
            disabled={editor().ruleId === null || fieldsDisabled()}
            onClick={() => {
              void handleRemove()
            }}
          >
            {t('conditionalFormat.remove')}
          </button>
          <span class="cf-error-spacer" />
          <button type="button" data-testid="cf-cancel-button" onClick={handleCancel}>
            {t('conditionalFormat.cancel')}
          </button>
          <button
            type="submit"
            data-testid="cf-save-button"
            data-variant="primary"
            disabled={fieldsDisabled() || editorValidation() !== null}
          >
            {t('conditionalFormat.save')}
          </button>
        </div>
      </form>
    </Show>
  )
}
