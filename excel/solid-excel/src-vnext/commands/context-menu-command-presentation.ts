import type { MenuCommandKind, MenuTarget, MenuTargetKind } from '@einfach/spreadsheet-ui-core'

import type { CommandAvailability, ResolvedCommand } from './command-shell'

export type ContextMenuCommandKind = MenuCommandKind | 'clipboard.pasteSpecial'

export type ViewportHiddenContextMenuCommand =
  | 'row.hide'
  | 'row.unhide'
  | 'column.hide'
  | 'column.unhide'

export interface ContextMenuCommandPresentationSnapshot {
  readonly pasteSpecialAvailable: boolean
  readonly viewportHiddenCommandAvailable: (command: ViewportHiddenContextMenuCommand) => boolean
  readonly frozenRows: number
  readonly frozenColumns: number
}

const COMMANDS_BY_TARGET: Readonly<Record<MenuTargetKind, readonly ContextMenuCommandKind[]>> = {
  cell: [
    'clipboard.copy',
    'clipboard.cut',
    'clipboard.paste',
    'clipboard.pasteSpecial',
    'cell.clear',
    'view.freezePanes',
    'view.freezeRowsHere',
    'view.freezeColsHere',
    'view.unfreeze',
  ],
  range: [
    'clipboard.copy',
    'clipboard.cut',
    'clipboard.paste',
    'clipboard.pasteSpecial',
    'cell.clear',
    'view.freezePanes',
    'view.freezeRowsHere',
    'view.freezeColsHere',
    'view.unfreeze',
  ],
  row: [
    'row.insert',
    'row.delete',
    'row.hide',
    'row.unhide',
    'view.freezeRowsHere',
    'view.unfreeze',
  ],
  column: [
    'column.insert',
    'column.delete',
    'column.hide',
    'column.unhide',
    'view.freezeColsHere',
    'view.unfreeze',
  ],
  all: ['row.insert', 'row.delete', 'column.insert', 'column.delete'],
  'sheet-tab': [],
}

function isViewportHiddenCommand(
  command: ContextMenuCommandKind,
): command is ViewportHiddenContextMenuCommand {
  return (
    command === 'row.hide' ||
    command === 'row.unhide' ||
    command === 'column.hide' ||
    command === 'column.unhide'
  )
}

function frozen(snapshot: ContextMenuCommandPresentationSnapshot): boolean {
  return snapshot.frozenRows > 0 || snapshot.frozenColumns > 0
}

/** The context menu's current visibility rules, without Solid or atom access. */
export function isContextMenuCommandVisible(
  command: ContextMenuCommandKind,
  target: MenuTarget,
  snapshot: ContextMenuCommandPresentationSnapshot,
): boolean {
  if (command === 'clipboard.pasteSpecial') return snapshot.pasteSpecialAvailable
  if (isViewportHiddenCommand(command)) return snapshot.viewportHiddenCommandAvailable(command)

  switch (command) {
    case 'view.freezeRowsHere':
      if (target.kind === 'row') return target.rowIndex > 0
      if (target.kind === 'cell') return target.cell.row > 0
      return target.kind === 'range' && target.range.rowStart > 0
    case 'view.freezeColsHere':
      if (target.kind === 'column') return target.colIndex > 0
      if (target.kind === 'cell') return target.cell.col > 0
      return target.kind === 'range' && target.range.colStart > 0
    case 'view.freezePanes':
      if (target.kind === 'cell') return target.cell.row > 0 || target.cell.col > 0
      if (target.kind === 'range') return target.range.rowStart > 0 || target.range.colStart > 0
      return false
    case 'view.unfreeze':
      return frozen(snapshot)
    default:
      return true
  }
}

export function resolveContextMenuCommand(
  command: ContextMenuCommandKind,
  target: MenuTarget,
  snapshot: ContextMenuCommandPresentationSnapshot,
): ResolvedCommand<ContextMenuCommandKind> {
  const availability: CommandAvailability = isContextMenuCommandVisible(command, target, snapshot)
    ? { status: 'ready' }
    : { status: 'hidden' }
  return { command, availability, presentation: undefined }
}

export function resolveContextMenuCommands(
  target: MenuTarget,
  snapshot: ContextMenuCommandPresentationSnapshot,
): readonly ContextMenuCommandKind[] {
  return COMMANDS_BY_TARGET[target.kind].filter((command) =>
    isContextMenuCommandVisible(command, target, snapshot),
  )
}
