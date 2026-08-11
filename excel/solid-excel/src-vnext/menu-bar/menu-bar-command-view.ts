import {
  openHelpOverlayAtom,
  toggleFormulaBarAtom,
  toggleGridlinesAtom,
  toggleHeadingsAtom,
  type MenuItemDispatch,
} from '@einfach/spreadsheet-ui-core'
import type { MenuBarCommandContext } from './menu-bar-command-context'

/** Dispatches view and help menu commands that only alter existing UI atoms. */
export function dispatchMenuBarViewCommand(
  context: MenuBarCommandContext,
  dispatch: MenuItemDispatch,
): boolean {
  const { store } = context
  switch (dispatch.kind) {
    case 'toggle-formula-bar':
      store.setter(toggleFormulaBarAtom)
      return true
    case 'toggle-gridlines':
      store.setter(toggleGridlinesAtom)
      return true
    case 'toggle-headings':
      store.setter(toggleHeadingsAtom)
      return true
    case 'toggle-full-screen':
    case 'zoom-in':
    case 'zoom-out':
    case 'zoom-reset':
    case 'placeholder':
      return true
    case 'open-about':
      store.setter(openHelpOverlayAtom, 'about')
      return true
    case 'open-keyboard-shortcuts':
      store.setter(openHelpOverlayAtom, 'shortcuts')
      return true
    default:
      return false
  }
}
