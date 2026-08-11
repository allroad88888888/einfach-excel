const NUMBER_FORMAT_ITEM_SELECTOR = '[role="menuitemradio"]:not(:disabled)'

function enabledItems(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(NUMBER_FORMAT_ITEM_SELECTOR))
}

/** Focuses the checked shortcut, or the first enabled shortcut when none matches. */
export function focusCurrentNumberFormatItem(root: HTMLElement): void {
  const items = enabledItems(root)
  const current = items.find((item) => item.getAttribute('aria-checked') === 'true')
  ;(current ?? items[0])?.focus()
}

/** Implements the vertical radio-menu Arrow/Home/End contract. */
export function handleNumberFormatMenuNavigation(event: KeyboardEvent, root: HTMLElement): void {
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
