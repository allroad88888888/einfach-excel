import { createEffect, For, onCleanup } from 'solid-js'
import type { SortDirection } from '@einfach/spreadsheet-ui-core'
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

  function onDocPointerDown(event: MouseEvent) {
    if (!rootRef) return
    const target = event.target as Node | null
    if (!target || rootRef.contains(target) || props.anchorRef?.contains(target)) return
    props.onRequestClose()
  }

  function onDocKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onRequestClose()
    }
  }

  createEffect(() => {
    if (!props.isOpen) return
    document.addEventListener('mousedown', onDocPointerDown, true)
    document.addEventListener('keydown', onDocKeyDown)
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
            onClick={() => props.onSelect(option.direction)}
          >
            {props.t(option.labelKey)}
          </button>
        )}
      </For>
    </ToolbarAnchoredMenu>
  )
}
