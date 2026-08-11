import { createEffect, onCleanup } from 'solid-js'

const ENABLED_ITEM_SELECTOR =
  '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)'

function enabledItems(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(ENABLED_ITEM_SELECTOR))
}

function focusPreferredItem(root: HTMLElement): void {
  const items = enabledItems(root)
  const current = items.find((item) => item.getAttribute('aria-checked') === 'true')
  ;(current ?? items[0])?.focus()
}

/** Handles the DOM-only focus lifecycle shared by layout-format toolbar menus. */
export function createLayoutFormatMenuInteraction<T>(options: {
  anchor: () => HTMLElement | null | undefined
  isOpen: () => boolean
  onClose: () => void
  onSelect: (value: T) => void
}) {
  let root: HTMLDivElement | undefined

  function restoreAnchorFocus(): void {
    options.anchor()?.focus()
  }

  function closeAndRestoreFocus(): void {
    options.onClose()
    restoreAnchorFocus()
  }

  createEffect(() => {
    if (!options.isOpen()) return

    queueMicrotask(() => {
      if (root && options.isOpen()) focusPreferredItem(root)
    })

    function onDocumentPointerDown(event: MouseEvent): void {
      const target = event.target as Node | null
      if (!target || root?.contains(target) || options.anchor()?.contains(target)) return
      options.onClose()
    }

    function onDocumentKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeAndRestoreFocus()
        return
      }
      if (event.target instanceof Node && root?.contains(event.target)) onMenuKeyDown(event)
    }

    document.addEventListener('mousedown', onDocumentPointerDown, true)
    document.addEventListener('keydown', onDocumentKeyDown)
    onCleanup(() => {
      document.removeEventListener('mousedown', onDocumentPointerDown, true)
      document.removeEventListener('keydown', onDocumentKeyDown)
    })
  })

  function onMenuKeyDown(event: KeyboardEvent): void {
    if (!root) return
    const items = enabledItems(root)
    if (items.length === 0) return

    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex: number | null = null
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % items.length
        break
      case 'ArrowUp':
        nextIndex =
          activeIndex < 0 ? items.length - 1 : (activeIndex - 1 + items.length) % items.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = items.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    event.stopPropagation()
    items[nextIndex]?.focus()
  }

  function select(value: T): void {
    options.onSelect(value)
    restoreAnchorFocus()
  }

  return {
    select,
    setRoot: (element: HTMLDivElement) => {
      root = element
    },
  }
}
