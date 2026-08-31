import { type MenuItemDispatch } from '@einfach/spreadsheet-ui-core'
import { dispatchMenuBarDataCommand } from './menu-bar-command-data'
import type { MenuBarCommandContext } from './menu-bar-command-context'
import { dispatchMenuBarEditCommand } from './menu-bar-command-edit'
import { dispatchMenuBarFormatCommand } from './menu-bar-command-format'
import { dispatchMenuBarInsertCommand } from './menu-bar-command-insert'
import { dispatchMenuBarViewCommand } from './menu-bar-command-view'

const menuBarCommandHandlers = [
  dispatchMenuBarEditCommand,
  dispatchMenuBarInsertCommand,
  dispatchMenuBarDataCommand,
  dispatchMenuBarFormatCommand,
  dispatchMenuBarViewCommand,
] as const

/** Routes a descriptor command to the single Core adapter that owns it. */
export function dispatchMenuBarCommand(context: MenuBarCommandContext, dispatch: MenuItemDispatch) {
  for (const handler of menuBarCommandHandlers) {
    if (handler(context, dispatch)) return
  }
}
