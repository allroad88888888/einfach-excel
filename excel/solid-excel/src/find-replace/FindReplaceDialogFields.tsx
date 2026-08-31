import type { Accessor } from 'solid-js'
import type {
  FindReplaceCapabilityProjection,
  FindReplaceFormState,
  FindReplaceScope,
} from '@einfach/spreadsheet-ui-core'
import { useT } from '../i18n'

export interface FindReplaceDialogFieldsProps {
  readonly capability: Accessor<FindReplaceCapabilityProjection>
  readonly form: Accessor<FindReplaceFormState>
  readonly pending: Accessor<boolean>
  readonly setNeedleRef: (element: HTMLInputElement) => void
  readonly runSearch: () => void | Promise<void>
  readonly handleFindStep: (direction: 1 | -1) => void | Promise<void>
  readonly updateForm: (patch: Partial<FindReplaceFormState>) => void
}

function tabId(tab: FindReplaceFormState['activeTab']): string {
  return `find-replace-tab-${tab}`
}

export function FindReplaceDialogFields(props: FindReplaceDialogFieldsProps) {
  const t = useT()

  function selectTab(tab: FindReplaceFormState['activeTab']) {
    if (tab === 'replace' && !props.capability().replaceEnabled) return
    props.updateForm({ activeTab: tab })
  }

  function onTabKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next =
      props.form().activeTab === 'find' && props.capability().replaceEnabled ? 'replace' : 'find'
    selectTab(next)
    const currentTab = event.currentTarget as HTMLButtonElement | null
    queueMicrotask(() => {
      const tab = currentTab?.parentElement?.querySelector<HTMLButtonElement>(
        `[data-find-replace-tab="${next}"]`,
      )
      tab?.focus()
    })
  }

  return (
    <>
      <div class="fr-tabs" role="tablist" aria-label={t('findReplace.title')}>
        <button
          id={tabId('find')}
          type="button"
          class="fr-tab"
          role="tab"
          aria-selected={props.form().activeTab === 'find'}
          aria-controls="find-replace-panel"
          tabindex={props.form().activeTab === 'find' ? 0 : -1}
          data-testid="find-tab"
          data-find-replace-tab="find"
          onClick={() => selectTab('find')}
          onKeyDown={onTabKeyDown}
        >
          {t('findReplace.findTab')}
        </button>
        <button
          id={tabId('replace')}
          type="button"
          class="fr-tab"
          role="tab"
          aria-selected={props.form().activeTab === 'replace'}
          aria-controls="find-replace-panel"
          tabindex={props.form().activeTab === 'replace' ? 0 : -1}
          data-testid="replace-tab"
          data-find-replace-tab="replace"
          disabled={!props.capability().replaceEnabled}
          onClick={() => selectTab('replace')}
          onKeyDown={onTabKeyDown}
        >
          {t('findReplace.replaceTab')}
        </button>
      </div>

      <div
        id="find-replace-panel"
        class="fr-body"
        role="tabpanel"
        aria-labelledby={tabId(props.form().activeTab)}
      >
        <div class="fr-field">
          <label class="fr-field-label" for="find-needle">
            {t('findReplace.findWhat')}
          </label>
          <input
            ref={props.setNeedleRef}
            id="find-needle"
            class="fr-input"
            data-testid="find-needle-input"
            type="text"
            value={props.form().needle}
            onInput={(event) => props.updateForm({ needle: event.currentTarget.value })}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              void props.runSearch()
            }}
          />
          <span class="fr-step-group">
            <button
              type="button"
              class="fr-step-btn"
              data-testid="find-prev-button"
              aria-label={t('findReplace.prev')}
              title={t('findReplace.prev')}
              disabled={props.pending() || !props.capability().findEnabled}
              onClick={() => void props.handleFindStep(-1)}
            >
              ↑
            </button>
            <button
              type="button"
              class="fr-step-btn"
              data-testid="find-next-button"
              aria-label={t('findReplace.next')}
              title={t('findReplace.next')}
              disabled={props.pending() || !props.capability().findEnabled}
              onClick={() => void props.handleFindStep(1)}
            >
              ↓
            </button>
          </span>
        </div>

        <div class="fr-field fr-field-replace" data-replace-only="true">
          <label class="fr-field-label" for="find-replacement">
            {t('findReplace.replaceWith')}
          </label>
          <input
            id="find-replacement"
            class="fr-input"
            data-testid="find-replacement-input"
            type="text"
            value={props.form().replacement}
            disabled={!props.capability().replaceEnabled}
            onInput={(event) => props.updateForm({ replacement: event.currentTarget.value })}
          />
        </div>

        <div class="fr-options">
          <label class="fr-option">
            <input
              type="checkbox"
              data-testid="find-opt-case-sensitive"
              checked={props.form().caseSensitive}
              onChange={(event) => props.updateForm({ caseSensitive: event.currentTarget.checked })}
            />
            {t('findReplace.caseSensitive')}
          </label>
          <label class="fr-option">
            <input
              type="checkbox"
              data-testid="find-opt-whole-match"
              checked={props.form().wholeMatch}
              onChange={(event) => props.updateForm({ wholeMatch: event.currentTarget.checked })}
            />
            {t('findReplace.wholeMatch')}
          </label>
          <label class="fr-option">
            <input
              type="checkbox"
              data-testid="find-opt-formulas"
              checked={props.form().searchFormulas}
              onChange={(event) =>
                props.updateForm({ searchFormulas: event.currentTarget.checked })
              }
            />
            {t('findReplace.searchFormulas')}
          </label>
          <label class="fr-option">
            <input
              type="checkbox"
              data-testid="find-opt-regex"
              checked={props.form().regex}
              onChange={(event) => props.updateForm({ regex: event.currentTarget.checked })}
            />
            {t('findReplace.regex')}
          </label>
        </div>

        <div class="fr-scope">
          <label class="fr-field-label" for="find-scope-select">
            {t('findReplace.scope')}
          </label>
          <select
            id="find-scope-select"
            class="fr-select"
            data-testid="find-scope-select"
            value={props.form().scope}
            onChange={(event) =>
              props.updateForm({ scope: event.currentTarget.value as FindReplaceScope })
            }
          >
            <option value="sheet">{t('findReplace.scope.sheet')}</option>
            <option value="workbook" disabled>
              {t('findReplace.scope.workbook')}
            </option>
            <option value="current-selection">{t('findReplace.scope.selection')}</option>
          </select>
        </div>
      </div>
    </>
  )
}
