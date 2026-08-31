const MENU_ITEM_SELECTOR = '[role="menuitemradio"]:not(:disabled)'

function menuItems(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR))
}

/** Focuses the active font choice, falling back to the first available row. */
export function focusCurrentFontMenuItem(root: HTMLElement): void {
  const items = menuItems(root)
  const active = items.find((item) => item.getAttribute('aria-checked') === 'true')
  ;(active ?? items[0])?.focus()
}

/** Applies the standard vertical-menu navigation contract to a font menu. */
export function handleFontMenuNavigation(event: KeyboardEvent, root: HTMLElement): void {
  const items = menuItems(root)
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
