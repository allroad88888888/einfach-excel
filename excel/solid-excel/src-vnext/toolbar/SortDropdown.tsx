import { createEffect, For, onCleanup } from 'solid-js'
import type { SortDirection } from '@einfach/spreadsheet-ui-core'
import { SortConfirmationDialog } from '../sort/SortConfirmationDialog'
import { useSortConfirmation } from '../sort/useSortConfirmation'
import { ToolbarAnchoredMenu } from './ToolbarAnchoredMenu'

interface SortDropdownProps {
  anchorRef?: HTMLElement | null
  disabled: boolean
  disabledReason: string | null
  isOpen: boolean
  onRequestClose: () => void
  onSelect: (direction: SortDirection) => void
  t: (key: string) => string
}

/** Menu surface for the two physical-sort directions. */
export function SortDropdown(props: SortDropdownProps) {
  let rootRef: HTMLDivElement | undefined
  const confirmation = useSortConfirmation()

  function onDocPointerDown(event: MouseEvent) {
    if (!rootRef) return
    const target = event.target as Node | null
    if (!target || rootRef.contains(target) || props.anchorRef?.contains(target)) return
    props.onRequestClose()
  }

  function closeAndRestoreFocus() {
    props.onRequestClose()
    props.anchorRef?.focus()
  }

  function onDocKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeAndRestoreFocus()
      return
    }
    if (!rootRef || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(rootRef.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    if (items.length === 0) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1 + items.length) % items.length
            : (current - 1 + items.length) % items.length
    items[next]?.focus()
  }

  createEffect(() => {
    if (!props.isOpen) return
    document.addEventListener('mousedown', onDocPointerDown, true)
    document.addEventListener('keydown', onDocKeyDown)
    queueMicrotask(() =>
      rootRef?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus(),
    )
    onCleanup(() => {
      document.removeEventListener('mousedown', onDocPointerDown, true)
      document.removeEventListener('keydown', onDocKeyDown)
    })
  })

  const options: Array<{ direction: SortDirection; labelKey: string; testId: string }> = [
    { direction: 'asc', labelKey: 'toolbar.sort.asc', testId: 'toolbar-sort-asc' },
    { direction: 'desc', labelKey: 'toolbar.sort.desc', testId: 'toolbar-sort-desc' },
  ]

  return (
    <>
      <ToolbarAnchoredMenu
        anchorRef={props.anchorRef}
        rootRef={(element) => {
          rootRef = element
        }}
        class="spreadsheet-toolbar-sort-dropdown"
        role="menu"
        data-testid="toolbar-sort-dropdown"
        isOpen={props.isOpen}
        minWidth="140px"
      >
        <For each={options}>
          {(option) => (
            <button
              type="button"
              class="spreadsheet-toolbar-sort-option"
              role="menuitem"
              data-testid={option.testId}
              disabled={props.disabled}
              title={props.disabledReason ?? ''}
              style={{
                padding: '4px 12px',
                'text-align': 'left',
                background: 'transparent',
                border: 'none',
                cursor: props.disabled ? 'not-allowed' : 'pointer',
                font: 'inherit',
              }}
              onClick={() => {
                confirmation.begin(option.direction)
                props.onRequestClose()
              }}
            >
              {props.t(option.labelKey)}
            </button>
          )}
        </For>
      </ToolbarAnchoredMenu>
      <SortConfirmationDialog
        anchorRef={props.anchorRef}
        state={confirmation.state()}
        t={props.t}
        onCancel={confirmation.cancel}
        onConfirm={confirmation.confirm}
        onRetry={confirmation.retry}
      />
    </>
  )
}
