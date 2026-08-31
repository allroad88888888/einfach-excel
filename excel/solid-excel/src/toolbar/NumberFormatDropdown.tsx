/** @jsxImportSource solid-js */

import { useAtomValue, useSetAtom } from '@einfach/solid'
import {
  activeCellFormatAtom,
  formatCellsEditorAtom,
  retryToolbarMutationRefreshAtom,
  toolbarMutationLifecycleAtom,
} from '@einfach/spreadsheet-ui-core'
import { For, Show, createEffect, onCleanup } from 'solid-js'
import type { JSX } from 'solid-js'
import { useT } from '../i18n'
import { anchoredMenuStyle } from './anchored-menu-style'
import {
  focusCurrentNumberFormatItem,
  handleNumberFormatMenuNavigation,
} from './NumberFormatDropdownInteraction'
import {
  NUMBER_FORMAT_ITEMS,
  numberFormatIdForFormat,
  type NumberFormatCustomMenuId,
  type NumberFormatId,
} from './NumberFormatDropdownModel'

export {
  NUMBER_FORMAT_ITEMS,
  numberFormatIdForFormat,
  type NumberFormatCustomMenuId,
  type NumberFormatDropdownItem,
  type NumberFormatId,
} from './NumberFormatDropdownModel'

export interface NumberFormatDropdownProps {
  open: boolean
  /** Absolute viewport coordinates of the anchor button's bounding rect. */
  anchorRect: DOMRect | null
  /** Toggle anchor, excluded from click-outside and used for focus restoration. */
  anchorEl?: HTMLElement | null
  onSelect: (id: NumberFormatId) => void
  /** Compatibility contract for hosts still exposing lightweight dialogs. */
  onCustomSelect?: (id: NumberFormatCustomMenuId) => void
  onClose: () => void
  class?: string
  'data-testid'?: string
}

/**
 * Atom-backed number-format shortcut menu. Core owns the selected format,
 * active Format Cells draft, mutation lifecycle, and refresh-only recovery.
 */
export function NumberFormatDropdown(props: NumberFormatDropdownProps): JSX.Element {
  const t = useT()
  const activeCellFormat = useAtomValue(activeCellFormatAtom)
  const formatCellsEditor = useAtomValue(formatCellsEditorAtom)
  const mutation = useAtomValue(toolbarMutationLifecycleAtom)
  const retryRefresh = useSetAtom(retryToolbarMutationRefreshAtom)
  let rootRef: HTMLDivElement | undefined

  const currentId = () => {
    const editor = formatCellsEditor()
    const format = editor.status === 'open' ? editor.draft : activeCellFormat()
    return numberFormatIdForFormat(format.numberFormat)
  }
  const isFormatBusy = () =>
    mutation().operation === 'format' &&
    ['pending', 'local-acknowledged', 'refreshing'].includes(mutation().status)
  const formatError = () => {
    const state = mutation()
    return state.operation === 'format' &&
      (state.status === 'refresh-failed' || state.status === 'outcome-unknown')
      ? state
      : null
  }

  createEffect(() => {
    if (!props.open) return

    queueMicrotask(() => {
      if (rootRef && props.open) focusCurrentNumberFormatItem(rootRef)
    })

    function closeAndRestoreFocus() {
      props.onClose()
      props.anchorEl?.focus()
    }

    function onDocPointerDown(event: MouseEvent) {
      if (!rootRef) return
      const target = event.target as Node | null
      if (target && rootRef.contains(target)) return
      if (target && props.anchorEl && props.anchorEl.contains(target)) return
      props.onClose()
    }

    function onDocKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeAndRestoreFocus()
    }

    document.addEventListener('mousedown', onDocPointerDown, true)
    document.addEventListener('keydown', onDocKeyDown)
    onCleanup(() => {
      document.removeEventListener('mousedown', onDocPointerDown, true)
      document.removeEventListener('keydown', onDocKeyDown)
    })
  })

  function style(): JSX.CSSProperties {
    return props.anchorRect
      ? { ...anchoredMenuStyle({ anchor: props.anchorRect, zIndex: 500 }) }
      : { display: 'none' }
  }

  return (
    <Show when={props.open}>
      <div
        ref={(el) => (rootRef = el)}
        class={`number-format-dropdown ${props.class ?? ''}`.trim()}
        data-testid={props['data-testid'] ?? 'number-format-dropdown'}
        role="menu"
        aria-label={t('toolbar.numberFormat.title')}
        aria-busy={isFormatBusy()}
        style={style()}
        onKeyDown={(event) => handleNumberFormatMenuNavigation(event, rootRef!)}
      >
        <For each={NUMBER_FORMAT_ITEMS}>
          {(item) => {
            const isCurrent = () => currentId() === item.id
            const disabled = () => Boolean(item.disabled || isFormatBusy())
            return (
              <button
                type="button"
                class={`number-format-dropdown-item ${
                  disabled() ? 'number-format-dropdown-item-disabled' : ''
                }`.trim()}
                data-testid={`number-format-item-${item.id}`}
                data-format-id={item.id}
                role="menuitemradio"
                aria-checked={isCurrent()}
                disabled={disabled()}
                style={{ background: isCurrent() ? 'var(--select-bg)' : undefined }}
                onClick={() => {
                  if (disabled()) return
                  props.onSelect(item.id)
                  props.anchorEl?.focus()
                }}
              >
                <span class="number-format-dropdown-label">{t(item.labelKey)}</span>
                <span class="number-format-dropdown-preview">{item.preview}</span>
              </button>
            )
          }}
        </For>
        <Show when={formatError()} keyed>
          {(error) => (
            <div
              role="alert"
              data-testid="number-format-mutation-error"
              style={{ padding: '8px 12px', color: '#b42318', 'white-space': 'normal' }}
            >
              <div>{error.error}</div>
              <Show when={error.canRetryRefresh}>
                <button
                  type="button"
                  data-testid="number-format-mutation-retry"
                  onClick={() => void retryRefresh()}
                >
                  Reconcile toolbar mutation
                </button>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </Show>
  )
}
