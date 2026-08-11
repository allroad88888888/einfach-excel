import { getAdjacentSheetId } from '@einfach/spreadsheet-ui-core'
import type { SpreadsheetSheetMetadata } from '@einfach/spreadsheet-ui-core'

export type SheetTabKeyboardAction = 'previous' | 'next' | 'first' | 'last' | null

/** Keeps DOM focus references local while feature state stays in Sheet Tabs atoms. */
export function createSheetTabFocusRegistry() {
  const tabs = new Map<string, HTMLButtonElement>()

  return {
    bind(sheetId: string, element: HTMLButtonElement | null): void {
      if (element) tabs.set(sheetId, element)
      else tabs.delete(sheetId)
    },
    clear(): void {
      tabs.clear()
    },
    focus(sheetId: string): void {
      const tab = tabs.get(sheetId)
      if (tab?.isConnected) tab.focus({ preventScroll: true })
    },
    element(sheetId: string): HTMLButtonElement | null {
      const tab = tabs.get(sheetId)
      return tab?.isConnected ? tab : null
    },
  }
}

export function sheetTabKeyboardAction(event: KeyboardEvent): SheetTabKeyboardAction {
  if (event.altKey || event.isComposing) return null
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') return 'previous'
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') return 'next'
  if (event.key === 'Home') return 'first'
  if (event.key === 'End') return 'last'
  if ((event.ctrlKey || event.metaKey) && event.key === 'PageUp') return 'previous'
  if ((event.ctrlKey || event.metaKey) && event.key === 'PageDown') return 'next'
  return null
}

export function resolveSheetTabKeyboardTarget(
  event: KeyboardEvent,
  sheets: readonly SpreadsheetSheetMetadata[],
  sheetId: string,
): string | null {
  const action = sheetTabKeyboardAction(event)
  if (action === 'previous' || action === 'next') return getAdjacentSheetId(sheets, sheetId, action)
  if (action === 'first') return sheets[0]?.id ?? null
  if (action === 'last') return sheets.at(-1)?.id ?? null
  return null
}
