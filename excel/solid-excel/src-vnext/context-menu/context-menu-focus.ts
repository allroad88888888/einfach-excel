import type { Accessor } from 'solid-js'
import type { MenuCloseReason, MenuIntent, MenuState } from '@einfach/spreadsheet-ui-core'

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not([hidden]):not([disabled])'

export interface ContextMenuFocusController {
  setRoot(node: HTMLDivElement): void
  syncKeyboardOpen(): void
  handleDocumentMouseDown(event: MouseEvent): void
  handleDocumentKeyDown(event: KeyboardEvent): void
  handleMenuKeyDown(event: KeyboardEvent): void
}

interface ContextMenuFocusOptions {
  readonly menuIntent: Accessor<MenuIntent | null>
  readonly menuState: Accessor<MenuState>
  readonly closeMenu: (reason?: MenuCloseReason) => void
}

/** DOM-only focus behaviour for the atom-backed context-menu lifecycle. */
export function createContextMenuFocusController(
  options: ContextMenuFocusOptions,
): ContextMenuFocusController {
  let root: HTMLDivElement | undefined
  let focusReturnTarget: HTMLElement | null = null

  function menuItems(): HTMLElement[] {
    return root ? [...root.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)] : []
  }

  function moveFocus(from: EventTarget | null, offset: number): void {
    const items = menuItems()
    if (items.length === 0) return
    const current = from instanceof HTMLElement ? items.indexOf(from) : -1
    const next = current === -1 ? 0 : (current + offset + items.length) % items.length
    items[next]?.focus()
  }

  function returnFocus(): void {
    const target = focusReturnTarget
    focusReturnTarget = null
    queueMicrotask(() => {
      if (target?.isConnected) target.focus()
    })
  }

  function closeAndReturnFocus(reason: MenuCloseReason): void {
    options.closeMenu(reason)
    returnFocus()
  }

  return {
    setRoot(node) {
      root = node
    },
    syncKeyboardOpen() {
      const intent = options.menuIntent()
      if (intent?.type !== 'menu.open' || intent.source !== 'keyboard') return
      const activeElement = document.activeElement
      focusReturnTarget = activeElement instanceof HTMLElement ? activeElement : null
      queueMicrotask(() => {
        const latestIntent = options.menuIntent()
        if (
          options.menuState().status !== 'open' ||
          latestIntent?.type !== 'menu.open' ||
          latestIntent.source !== 'keyboard'
        ) {
          return
        }
        menuItems()[0]?.focus()
      })
    },
    handleDocumentMouseDown(event) {
      if (options.menuState().status !== 'open' || !root || root.contains(event.target as Node))
        return
      focusReturnTarget = null
      options.closeMenu('dismissed')
    },
    handleDocumentKeyDown(event) {
      if (options.menuState().status !== 'open' || event.key !== 'Escape') return
      event.preventDefault()
      closeAndReturnFocus('cancelled')
    },
    handleMenuKeyDown(event) {
      if (options.menuState().status !== 'open') return
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          moveFocus(event.target, 1)
          return
        case 'ArrowUp':
          event.preventDefault()
          moveFocus(event.target, -1)
          return
        case 'Home':
          event.preventDefault()
          menuItems()[0]?.focus()
          return
        case 'End': {
          event.preventDefault()
          const items = menuItems()
          items[items.length - 1]?.focus()
          return
        }
        case 'Tab':
          event.preventDefault()
          closeAndReturnFocus('cancelled')
          return
        default:
          return
      }
    },
  }
}
