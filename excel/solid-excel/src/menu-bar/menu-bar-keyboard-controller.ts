import {
  closeTopMenuAtom,
  findMenuByAccessKey,
  MENU_BAR_ITEMS,
  openTopMenuAtom,
  topMenuOpenAtom,
  type TopMenuId,
} from '@einfach/spreadsheet-ui-core'
import type { Store } from '@einfach/core'

type MenuItemFocus = 'first' | 'last'

export interface MenuBarKeyboardController {
  attach: (root: HTMLDivElement) => () => void
  onDropdownKeyDown: (menuId: TopMenuId, event: KeyboardEvent) => void
  onTopButtonKeyDown: (menuId: TopMenuId, event: KeyboardEvent) => void
}

/** Owns ephemeral menu DOM focus while Core atoms remain the menu-state authority. */
export function createMenuBarKeyboardController(store: Store): MenuBarKeyboardController {
  let root: HTMLDivElement | undefined

  function currentOpenMenu(): TopMenuId | null {
    const state = store.getter(topMenuOpenAtom)
    return state.kind === 'open' ? state.menu : null
  }

  function topButton(menuId: TopMenuId): HTMLButtonElement | null {
    return root?.querySelector(`[data-menu-bar-top-button="${menuId}"]`) ?? null
  }

  function menuItems(menuId: TopMenuId): HTMLButtonElement[] {
    const dropdown = root?.querySelector(`[data-menu-bar-dropdown="${menuId}"]`)
    if (!dropdown) return []
    return Array.from(dropdown.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]')).filter(
      (item) => !item.disabled,
    )
  }

  function focusMenuItem(menuId: TopMenuId, target: MenuItemFocus) {
    queueMicrotask(() => {
      const items = menuItems(menuId)
      items.at(target === 'first' ? 0 : -1)?.focus()
    })
  }

  function focusTopButton(menuId: TopMenuId) {
    queueMicrotask(() => topButton(menuId)?.focus())
  }

  function adjacentMenu(menuId: TopMenuId, step: 1 | -1): TopMenuId {
    const index = MENU_BAR_ITEMS.findIndex((menu) => menu.id === menuId)
    const nextIndex = (index + step + MENU_BAR_ITEMS.length) % MENU_BAR_ITEMS.length
    return MENU_BAR_ITEMS[nextIndex]!.id
  }

  function openMenu(menuId: TopMenuId, focus: MenuItemFocus) {
    store.setter(openTopMenuAtom, menuId)
    focusMenuItem(menuId, focus)
  }

  function closeMenuAndReturnFocus(menuId: TopMenuId) {
    store.setter(closeTopMenuAtom)
    focusTopButton(menuId)
  }

  function moveDropdownFocus(menuId: TopMenuId, step: 1 | -1) {
    const items = menuItems(menuId)
    if (items.length === 0) return
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex =
      activeIndex < 0
        ? step === 1
          ? 0
          : items.length - 1
        : (activeIndex + step + items.length) % items.length
    items[nextIndex]?.focus()
  }

  function onTopButtonKeyDown(menuId: TopMenuId, event: KeyboardEvent) {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        openMenu(menuId, 'first')
        return
      case 'ArrowUp':
        event.preventDefault()
        openMenu(menuId, 'last')
        return
      case 'ArrowRight':
      case 'ArrowLeft': {
        event.preventDefault()
        const nextMenu = adjacentMenu(menuId, event.key === 'ArrowRight' ? 1 : -1)
        if (currentOpenMenu() === null) focusTopButton(nextMenu)
        else openMenu(nextMenu, 'first')
        return
      }
      case 'Home':
      case 'End': {
        event.preventDefault()
        const target = event.key === 'Home' ? MENU_BAR_ITEMS[0] : MENU_BAR_ITEMS.at(-1)
        if (!target) return
        if (currentOpenMenu() === null) focusTopButton(target.id)
        else openMenu(target.id, 'first')
        return
      }
      case 'Escape':
        if (currentOpenMenu() !== null) {
          event.preventDefault()
          closeMenuAndReturnFocus(menuId)
        }
        return
      default:
        return
    }
  }

  function onDropdownKeyDown(menuId: TopMenuId, event: KeyboardEvent) {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveDropdownFocus(menuId, 1)
        return
      case 'ArrowUp':
        event.preventDefault()
        moveDropdownFocus(menuId, -1)
        return
      case 'Home':
        event.preventDefault()
        focusMenuItem(menuId, 'first')
        return
      case 'End':
        event.preventDefault()
        focusMenuItem(menuId, 'last')
        return
      case 'ArrowRight':
        event.preventDefault()
        openMenu(adjacentMenu(menuId, 1), 'first')
        return
      case 'ArrowLeft':
        event.preventDefault()
        openMenu(adjacentMenu(menuId, -1), 'last')
        return
      case 'Escape':
        event.preventDefault()
        closeMenuAndReturnFocus(menuId)
        return
      default:
        return
    }
  }

  function onDocumentPointerDown(event: MouseEvent) {
    if (!root || !currentOpenMenu()) return
    const target = event.target as Node | null
    if (!target || !root.contains(target)) store.setter(closeTopMenuAtom)
  }

  function onDocumentKeyDown(event: KeyboardEvent) {
    const menuId = currentOpenMenu()
    if (event.key === 'Escape' && menuId) {
      event.preventDefault()
      closeMenuAndReturnFocus(menuId)
      return
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.length === 1) {
      const menu = findMenuByAccessKey(event.key)
      if (!menu) return
      event.preventDefault()
      openMenu(menu.id, 'first')
    }
  }

  function attach(nextRoot: HTMLDivElement) {
    root = nextRoot
    document.addEventListener('mousedown', onDocumentPointerDown, true)
    document.addEventListener('keydown', onDocumentKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentPointerDown, true)
      document.removeEventListener('keydown', onDocumentKeyDown)
      if (root === nextRoot) root = undefined
    }
  }

  return { attach, onDropdownKeyDown, onTopButtonKeyDown }
}
