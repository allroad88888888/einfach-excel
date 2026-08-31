const COLOR_OPTION_SELECTOR = '[data-color-option="true"]:not(:disabled)'

function colorOptions(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(COLOR_OPTION_SELECTOR))
}

/** Focuses the selected color, falling back to the automatic/no-fill row. */
export function focusCurrentColor(root: HTMLElement): void {
  const options = colorOptions(root)
  const selected = options.find((option) => option.dataset.selected === 'true')
  ;(selected ?? options[0])?.focus()
}

/** Keeps keyboard interaction inside the palette while supporting grid navigation. */
export function handleColorPopoverNavigation(event: KeyboardEvent, root: HTMLElement): void {
  const options = colorOptions(root)
  if (options.length === 0) return

  const activeIndex = Math.max(0, options.indexOf(document.activeElement as HTMLButtonElement))
  let nextIndex: number | null = null
  switch (event.key) {
    case 'ArrowRight':
      nextIndex = Math.min(options.length - 1, activeIndex + 1)
      break
    case 'ArrowLeft':
      nextIndex = Math.max(0, activeIndex - 1)
      break
    case 'ArrowDown':
      nextIndex = Math.min(options.length - 1, activeIndex + 7)
      break
    case 'ArrowUp':
      nextIndex = Math.max(0, activeIndex - 7)
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = options.length - 1
      break
    case 'Tab':
      nextIndex = event.shiftKey
        ? (activeIndex - 1 + options.length) % options.length
        : (activeIndex + 1) % options.length
      break
    default:
      return
  }

  event.preventDefault()
  event.stopPropagation()
  options[nextIndex]?.focus()
}
