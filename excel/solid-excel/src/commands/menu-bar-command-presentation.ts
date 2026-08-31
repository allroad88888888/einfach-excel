import type { MenuItemDescriptor } from '@einfach/spreadsheet-ui-core'

import type { CommandAvailability, ResolvedCommand } from './command-shell'

export interface MenuBarCommandCapabilities {
  readonly pasteSpecial: boolean
  readonly textToColumns: boolean
  readonly removeDuplicates: Readonly<{ canRead: boolean; canRemove: boolean }>
  readonly createTable: boolean
  readonly toggleTableTotals: boolean
  readonly insertRows: boolean
  readonly insertColumns: boolean
  readonly sortRange: boolean
}

export interface MenuBarCommandPresentationSnapshot {
  readonly showGridlines: boolean
  readonly showHeadings: boolean
  readonly showFormulaBar: boolean
  readonly filterSortDisabledReason: string | null
  readonly reapplyFilterDisabledReason: string | null
  readonly textToColumnsDisabledReason: string | null
  readonly capabilities: MenuBarCommandCapabilities
}

export interface MenuBarCommandPresentation {
  readonly checked: boolean | undefined
  readonly disabledReason: string | null
  readonly isPlaceholder: boolean
}

function resolveChecked(
  item: MenuItemDescriptor,
  snapshot: MenuBarCommandPresentationSnapshot,
): boolean | undefined {
  switch (item.dispatch.kind) {
    case 'toggle-gridlines':
      return snapshot.showGridlines
    case 'toggle-headings':
      return snapshot.showHeadings
    case 'toggle-formula-bar':
      return snapshot.showFormulaBar
    default:
      return undefined
  }
}

function resolveDisabledReason(
  item: MenuItemDescriptor,
  snapshot: MenuBarCommandPresentationSnapshot,
): string | null {
  switch (item.dispatch.kind) {
    case 'open-filter-dropdown':
    case 'sort-asc':
    case 'sort-desc':
      return snapshot.filterSortDisabledReason
    case 'reapply-filter':
      return snapshot.reapplyFilterDisabledReason
    case 'open-text-to-columns':
      return snapshot.textToColumnsDisabledReason
    default:
      return null
  }
}

export function resolveMenuBarCapability(
  key: string | undefined,
  capabilities: MenuBarCommandCapabilities,
): boolean {
  switch (key) {
    case 'pasteSpecial':
      return capabilities.pasteSpecial
    case 'textToColumns':
      return capabilities.textToColumns
    case 'removeRows':
      return capabilities.removeDuplicates.canRead && capabilities.removeDuplicates.canRemove
    case 'createTable':
      return capabilities.createTable
    case 'toggleTableTotals':
      return capabilities.toggleTableTotals
    case 'insertRows':
      return capabilities.insertRows
    case 'insertColumns':
      return capabilities.insertColumns
    case 'sortRange':
      return capabilities.sortRange
    default:
      return false
  }
}

function resolveAvailability(
  item: MenuItemDescriptor,
  presentation: MenuBarCommandPresentation,
  capabilities: MenuBarCommandCapabilities,
): CommandAvailability {
  if (
    item.isAvailable === 'capability' &&
    !resolveMenuBarCapability(item.capabilityKey, capabilities)
  ) {
    return { status: 'hidden' }
  }
  if (presentation.isPlaceholder || presentation.disabledReason !== null) {
    return { status: 'disabled', reason: presentation.disabledReason }
  }
  return { status: 'ready' }
}

/**
 * Resolves the menu item's visual state and execution eligibility from facts
 * supplied by the host. It deliberately reads no atoms and writes no state.
 */
export function resolveMenuBarCommand(
  item: MenuItemDescriptor,
  snapshot: MenuBarCommandPresentationSnapshot,
): ResolvedCommand<MenuItemDescriptor, MenuBarCommandPresentation> {
  const presentation: MenuBarCommandPresentation = {
    checked: resolveChecked(item, snapshot),
    disabledReason: resolveDisabledReason(item, snapshot),
    isPlaceholder: item.isAvailable === 'placeholder',
  }
  return {
    command: item,
    availability: resolveAvailability(item, presentation, snapshot.capabilities),
    presentation,
  }
}
