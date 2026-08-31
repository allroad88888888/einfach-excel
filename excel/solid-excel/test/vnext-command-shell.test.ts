import { describe, expect, it } from '@jest/globals'
import {
  getToolbarCommandAvailability,
  type MenuItemDescriptor,
  type MenuTarget,
} from '@einfach/spreadsheet-ui-core'

import {
  dispatchResolvedCommand,
  resolveContextMenuCommand,
  resolveContextMenuCommands,
  resolveMenuBarCommand,
  resolveToolbarFormatCommand,
  type MenuBarCommandPresentationSnapshot,
} from '../src/commands'

const capabilities: MenuBarCommandPresentationSnapshot = {
  showGridlines: true,
  showHeadings: false,
  showFormulaBar: true,
  filterSortDisabledReason: null,
  reapplyFilterDisabledReason: null,
  textToColumnsDisabledReason: null,
  capabilities: {
    pasteSpecial: true,
    textToColumns: true,
    removeDuplicates: { canRead: true, canRemove: true },
    createTable: true,
    toggleTableTotals: true,
    insertRows: true,
    insertColumns: true,
    sortRange: true,
  },
}

const cellTarget: MenuTarget = {
  kind: 'cell',
  sheetId: 'sheet-1',
  cell: { row: 2, col: 3 },
}

const contextSnapshot = {
  pasteSpecialAvailable: true,
  viewportHiddenCommandAvailable: () => true,
  frozenRows: 0,
  frozenColumns: 0,
}

function menuItem(item: Omit<MenuItemDescriptor, 'id' | 'label'>): MenuItemDescriptor {
  return { id: 'test', label: 'test', ...item }
}

describe('vnext command shell', () => {
  it('does not execute a disabled or hidden command', () => {
    const disabled = resolveMenuBarCommand(
      menuItem({ dispatch: { kind: 'placeholder', reason: 'later' }, isAvailable: 'placeholder' }),
      capabilities,
    )
    const hidden = resolveMenuBarCommand(
      menuItem({
        dispatch: { kind: 'edit.pasteSpecial' },
        isAvailable: 'capability',
        capabilityKey: 'pasteSpecial',
      }),
      { ...capabilities, capabilities: { ...capabilities.capabilities, pasteSpecial: false } },
    )
    let calls = 0

    expect(dispatchResolvedCommand(disabled, () => (calls += 1)).dispatched).toBe(false)
    expect(dispatchResolvedCommand(hidden, () => (calls += 1)).dispatched).toBe(false)
    expect(calls).toBe(0)
  })

  it('preserves menu checked, disabled, and capability-gated presentation', () => {
    const checked = resolveMenuBarCommand(
      menuItem({ dispatch: { kind: 'toggle-gridlines' } }),
      capabilities,
    )
    const blocked = resolveMenuBarCommand(menuItem({ dispatch: { kind: 'sort-asc' } }), {
      ...capabilities,
      filterSortDisabledReason: 'Sorting is busy',
    })
    const hidden = resolveMenuBarCommand(
      menuItem({
        dispatch: { kind: 'insert-row-above' },
        isAvailable: 'capability',
        capabilityKey: 'insertRows',
      }),
      { ...capabilities, capabilities: { ...capabilities.capabilities, insertRows: false } },
    )

    expect(checked.presentation.checked).toBe(true)
    expect(checked.availability.status).toBe('ready')
    expect(blocked.presentation.disabledReason).toBe('Sorting is busy')
    expect(blocked.availability).toEqual({ status: 'disabled', reason: 'Sorting is busy' })
    expect(hidden.availability.status).toBe('hidden')
  })

  it('keeps context-menu target and freeze visibility semantics', () => {
    const atOrigin: MenuTarget = { ...cellTarget, cell: { row: 0, col: 0 } }
    const commands = resolveContextMenuCommands(cellTarget, contextSnapshot)
    const noFreeze = resolveContextMenuCommand('view.freezePanes', atOrigin, contextSnapshot)
    const canUnfreeze = resolveContextMenuCommand('view.unfreeze', cellTarget, {
      ...contextSnapshot,
      frozenRows: 1,
    })
    const hiddenRow = resolveContextMenuCommand('row.hide', cellTarget, {
      ...contextSnapshot,
      viewportHiddenCommandAvailable: () => false,
    })

    expect(commands).toContain('clipboard.pasteSpecial')
    expect(noFreeze.availability.status).toBe('hidden')
    expect(canUnfreeze.availability.status).toBe('ready')
    expect(hiddenRow.availability.status).toBe('hidden')
  })

  it('uses UI-core toolbar availability without atom reads or writes', () => {
    const availability = getToolbarCommandAvailability({
      sheetId: 'sheet-1',
      selectionKind: 'cell',
      editingMode: 'idle',
    })
    const draftingAvailability = getToolbarCommandAvailability({
      sheetId: 'sheet-1',
      selectionKind: 'cell',
      editingMode: 'drafting',
    })

    expect(resolveToolbarFormatCommand({ command: 'bold' }, availability).availability.status).toBe(
      'ready',
    )
    expect(
      resolveToolbarFormatCommand({ command: 'font-size-up' }, draftingAvailability).availability,
    ).toEqual({ status: 'disabled', reason: null })
  })
})
