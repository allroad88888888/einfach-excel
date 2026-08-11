import { For, Show } from 'solid-js'
import type { GoToValueKindFilter } from '@einfach/spreadsheet-ui-core'
import { useGoToDialogController } from './go-to-dialog-controller'
import {
  isLocatorDisabled,
  locatorKindOf,
  locatorValueKind,
  LOCATOR_KIND_ORDER,
  VALUE_KIND_FILTERS,
} from './go-to-dialog-locators'
import './go-to-dialog.css'

export interface SpreadsheetGoToDialogProps {
  class?: string
  'data-testid'?: string
}

function tabId(mode: 'simple' | 'special'): string {
  return `go-to-tab-${mode}`
}

export function SpreadsheetGoToDialog(props: SpreadsheetGoToDialogProps) {
  const controller = useGoToDialogController()

  function onTabKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = controller.mode() === 'simple' ? 'special' : 'simple'
    controller.setMode(next)
    const currentTab = event.currentTarget as HTMLButtonElement | null
    queueMicrotask(() => {
      const tab = currentTab?.parentElement?.querySelector<HTMLButtonElement>(
        `[data-go-to-tab="${next}"]`,
      )
      tab?.focus()
    })
  }

  return (
    <Show when={controller.isOpen()}>
      <div
        class={`go-to-dialog ${props.class ?? ''}`.trim()}
        data-testid={props['data-testid'] ?? 'go-to-dialog'}
        data-active-tab={controller.mode()}
        data-special-capability={controller.specialCapability()}
        data-special-pending={String(controller.specialPending())}
        data-special-warning={controller.specialWarning()?.reason ?? 'none'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="go-to-dialog-title"
      >
        <div class="gt-header">
          <span id="go-to-dialog-title" class="gt-title">
            {controller.t('goTo.title')}
          </span>
          <button
            type="button"
            class="dialog-close-x"
            data-testid="dialog-close-x"
            aria-label={controller.t('dialog.close.label')}
            onClick={controller.close}
          >
            ×
          </button>
        </div>

        <div class="gt-tabs" role="tablist" aria-label={controller.t('goTo.title')}>
          <button
            id={tabId('simple')}
            type="button"
            class="gt-tab"
            role="tab"
            aria-selected={controller.mode() === 'simple'}
            aria-controls="go-to-simple-pane"
            tabindex={controller.mode() === 'simple' ? 0 : -1}
            data-testid="go-to-tab-simple"
            data-go-to-tab="simple"
            disabled={controller.specialPending()}
            onClick={() => controller.setMode('simple')}
            onKeyDown={onTabKeyDown}
          >
            {controller.t('goTo.simple')}
          </button>
          <button
            id={tabId('special')}
            type="button"
            class="gt-tab"
            role="tab"
            aria-selected={controller.mode() === 'special'}
            aria-controls="go-to-special-pane"
            tabindex={controller.mode() === 'special' ? 0 : -1}
            data-testid="go-to-tab-special"
            data-go-to-tab="special"
            disabled={controller.specialPending()}
            onClick={() => controller.setMode('special')}
            onKeyDown={onTabKeyDown}
          >
            {controller.t('goTo.special')}
          </button>
        </div>

        <Show when={controller.mode() === 'simple'}>
          <div
            id="go-to-simple-pane"
            class="gt-body gt-body-simple"
            data-testid="go-to-simple-pane"
            role="tabpanel"
            aria-labelledby={tabId('simple')}
          >
            <label class="gt-field">
              <span class="gt-field-label">{controller.t('goTo.input.label')}</span>
              <input
                ref={controller.setInputRef}
                type="text"
                class="gt-input"
                data-testid="go-to-input"
                value={controller.inputValue()}
                placeholder={controller.t('goTo.input.placeholder')}
                onInput={(event) => controller.setInput(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  controller.onConfirm()
                }}
              />
            </label>
            <div class="gt-history">
              <div class="gt-history-label">{controller.t('goTo.history.label')}</div>
              <Show
                when={controller.history().length > 0}
                fallback={
                  <div class="gt-history-empty" data-testid="go-to-history-empty">
                    {controller.t('goTo.history.empty')}
                  </div>
                }
              >
                <ul class="gt-history-list" data-testid="go-to-history-list">
                  <For each={controller.history()}>
                    {(entry) => (
                      <li>
                        <button
                          type="button"
                          class="gt-history-item"
                          data-testid="go-to-history-item"
                          onClick={() => controller.onHistoryClick(entry)}
                        >
                          {entry}
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={controller.mode() === 'special'}>
          <div
            id="go-to-special-pane"
            class="gt-body gt-body-special"
            data-testid="go-to-special-pane"
            role="tabpanel"
            aria-labelledby={tabId('special')}
          >
            <fieldset class="gt-locator-group" disabled={controller.specialPending()}>
              <legend class="gt-field-label">{controller.t('goTo.special')}</legend>
              <For each={LOCATOR_KIND_ORDER}>
                {(kind) => {
                  const disabled = isLocatorDisabled(kind)
                  const id = `go-to-locator-${kind}`
                  return (
                    <label
                      class={`gt-radio${disabled ? ' gt-radio-disabled' : ''}`}
                      title={
                        disabled ? controller.t('goTo.locator.disabled.dependencyGraph') : undefined
                      }
                    >
                      <input
                        type="radio"
                        name="go-to-locator"
                        value={kind}
                        data-testid={id}
                        disabled={disabled}
                        checked={locatorKindOf(controller.locator()) === kind}
                        onChange={() => controller.setLocatorKind(kind)}
                      />
                      {controller.t(`goTo.locator.${kind}`)}
                    </label>
                  )
                }}
              </For>
            </fieldset>

            <Show
              when={
                locatorKindOf(controller.locator()) === 'formulas' ||
                locatorKindOf(controller.locator()) === 'constants'
              }
            >
              <label class="gt-subtype">
                <span class="gt-field-label">{controller.t('goTo.subtype.label')}</span>
                <select
                  class="gt-select"
                  data-testid="go-to-subtype-select"
                  disabled={controller.specialPending()}
                  value={String(locatorValueKind(controller.locator()) ?? '')}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    controller.setLocatorSubKind(
                      value === '' ? null : (value as GoToValueKindFilter),
                    )
                  }}
                >
                  <For each={VALUE_KIND_FILTERS}>
                    {(option) => (
                      <option value={String(option.value ?? '')}>
                        {controller.t(option.label)}
                      </option>
                    )}
                  </For>
                </select>
              </label>
            </Show>

            <Show when={controller.specialWarning()} keyed>
              {(warning) => (
                <div class="gt-truncated" data-testid="go-to-truncated">
                  <Show
                    when={warning.reason === 'regions'}
                    fallback={controller.t('goTo.truncated.cells', { limit: warning.limit })}
                  >
                    {controller.t('goTo.truncated.regions', { limit: warning.limit })}
                  </Show>
                </div>
              )}
            </Show>
          </div>
        </Show>

        <Show when={controller.errorText()}>
          <div class="gt-error" data-testid="go-to-error-text" role="alert">
            {controller.errorText()}
          </div>
        </Show>

        <div class="gt-footer">
          <button
            type="button"
            class="gt-btn"
            data-testid="go-to-cancel-button"
            onClick={controller.close}
          >
            {controller.t('goTo.cancel')}
          </button>
          <button
            type="button"
            class="gt-btn gt-btn-primary"
            data-testid="go-to-confirm-button"
            disabled={
              controller.specialPending() ||
              (controller.mode() === 'special' && controller.specialCapability() === 'unavailable')
            }
            onClick={controller.onConfirm}
          >
            {controller.t('goTo.confirm')}
          </button>
        </div>
      </div>
    </Show>
  )
}
