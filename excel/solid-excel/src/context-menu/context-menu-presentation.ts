import type { MenuTarget } from '@einfach/spreadsheet-ui-core'

import {
  resolveContextMenuCommands,
  type ContextMenuCommandPresentationSnapshot,
} from '../commands/context-menu-command-presentation'
import type { ContextMenuCommandKind } from './context-menu-types'

const COMMAND_LABEL_KEYS: Record<ContextMenuCommandKind, string> = {
  'clipboard.copy': 'contextMenu.command.copy',
  'clipboard.cut': 'contextMenu.command.cut',
  'clipboard.paste': 'contextMenu.command.paste',
  'clipboard.pasteSpecial': 'menuBar.edit.pasteSpecial',
  'cell.clear': 'contextMenu.command.delete',
  'row.insert': 'contextMenu.command.insertRow',
  'row.delete': 'contextMenu.command.deleteRow',
  'row.hide': 'menuBar.format.hideRow',
  'row.unhide': 'menuBar.format.unhideRow',
  'column.insert': 'contextMenu.command.insertColumn',
  'column.delete': 'contextMenu.command.deleteColumn',
  'column.hide': 'menuBar.format.hideCol',
  'column.unhide': 'menuBar.format.unhideCol',
  'formatting.open': 'contextMenu.command.formatting',
  'view.freezeRowsHere': 'contextMenu.command.freezeRowsHere',
  'view.freezeColsHere': 'contextMenu.command.freezeColsHere',
  'view.freezePanes': 'contextMenu.command.freezePanes',
  'view.unfreeze': 'contextMenu.command.unfreeze',
}

/** Resolves target-specific commands through the shared command manifest. */
export function getContextMenuCommands(
  target: MenuTarget | null,
  snapshot: ContextMenuCommandPresentationSnapshot,
): readonly ContextMenuCommandKind[] {
  return target ? resolveContextMenuCommands(target, snapshot) : []
}

export function getContextMenuLabelKey(command: ContextMenuCommandKind): string {
  return COMMAND_LABEL_KEYS[command]
}

export function getContextMenuTooltip(
  command: ContextMenuCommandKind,
  target: MenuTarget,
  t: (key: string, values?: Record<string, unknown>) => string,
): string | undefined {
  switch (command) {
    case 'view.freezeRowsHere':
      return t('contextMenu.command.freezeRowsHere.tooltip', {
        count:
          target.kind === 'row'
            ? target.rowIndex
            : target.kind === 'cell'
              ? target.cell.row
              : target.kind === 'range'
                ? target.range.rowStart
                : 0,
      })
    case 'view.freezeColsHere':
      return t('contextMenu.command.freezeColsHere.tooltip', {
        count:
          target.kind === 'column'
            ? target.colIndex
            : target.kind === 'cell'
              ? target.cell.col
              : target.kind === 'range'
                ? target.range.colStart
                : 0,
      })
    case 'view.freezePanes':
      return t('contextMenu.command.freezePanes.tooltip')
    default:
      return undefined
  }
}
