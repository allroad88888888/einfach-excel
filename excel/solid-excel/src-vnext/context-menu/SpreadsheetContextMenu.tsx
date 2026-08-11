import { createEffect, For, onCleanup, onMount, Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  closeMenuAtom,
  menuIntentAtom,
  menuStateAtom,
  pasteSpecialCapabilityAtom,
  viewportFreezeAtom,
  viewportHiddenContextMenuCommandAvailabilityAtom,
  type MenuCloseReason,
} from '@einfach/spreadsheet-ui-core'

import { useT } from '../../src/i18n'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'
import { createContextMenuCommandExecutor } from './context-menu-command-executor'
import { createContextMenuFocusController } from './context-menu-focus'
import {
  getContextMenuCommands,
  getContextMenuLabelKey,
  getContextMenuTooltip,
} from './context-menu-presentation'
import type { SpreadsheetContextMenuProps } from './context-menu-types'

export type { SpreadsheetContextMenuProps } from './context-menu-types'

function toInt(value: number): number {
  return Math.trunc(value)
}

/** Renders the shared command manifest for the active Atom-backed menu target. */
export function SpreadsheetContextMenu(props: SpreadsheetContextMenuProps) {
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const menuIntent = useAtomValue(menuIntentAtom)
  const menuState = useAtomValue(menuStateAtom)
  const pasteSpecialCapability = useAtomValue(pasteSpecialCapabilityAtom)
  const freezeState = useAtomValue(viewportFreezeAtom)
  const viewportHiddenCommandAvailable = useAtomValue(
    viewportHiddenContextMenuCommandAvailabilityAtom,
  )
  const t = useT()

  function closeMenu(reason: MenuCloseReason = 'dismissed') {
    store.setter(closeMenuAtom, reason)
  }

  const focusController = createContextMenuFocusController({ menuIntent, menuState, closeMenu })
  const commandExecutor = createContextMenuCommandExecutor({
    store,
    backend,
    closeMenu,
    viewportHiddenCommandAvailable: (command) => viewportHiddenCommandAvailable()(command),
  })

  createEffect(() => {
    menuIntent()
    focusController.syncKeyboardOpen()
  })

  onMount(() => {
    document.addEventListener('mousedown', focusController.handleDocumentMouseDown, true)
    document.addEventListener('keydown', focusController.handleDocumentKeyDown, true)
    onCleanup(() => {
      document.removeEventListener('mousedown', focusController.handleDocumentMouseDown, true)
      document.removeEventListener('keydown', focusController.handleDocumentKeyDown, true)
    })
  })

  const canRender = () => {
    const state = menuState()
    return state.status === 'open' && state.target !== null && state.position !== null
  }
  const presentation = () => {
    const target = menuState().target
    const freeze = freezeState()
    return {
      pasteSpecialAvailable: pasteSpecialCapability(),
      viewportHiddenCommandAvailable: (
        command: 'row.hide' | 'row.unhide' | 'column.hide' | 'column.unhide',
      ) => viewportHiddenCommandAvailable()(command),
      frozenRows: target ? (freeze.rowsBySheet[target.sheetId] ?? 0) : 0,
      frozenColumns: target ? (freeze.colsBySheet[target.sheetId] ?? 0) : 0,
    }
  }
  const commandList = () => getContextMenuCommands(menuState().target, presentation())
  const targetRow = () => {
    const target = menuState().target
    return target?.kind === 'row' ? `${target.rowIndex}` : ''
  }
  const targetCol = () => {
    const target = menuState().target
    return target?.kind === 'column' ? `${target.colIndex}` : ''
  }

  return (
    <Show when={canRender()}>
      <div
        class={`context-menu spreadsheet-context-menu ${props.class ?? ''}`.trim()}
        data-testid={props['data-testid'] ?? 'spreadsheet-context-menu'}
        data-menu-status={menuState().status}
        data-menu-surface={menuState().surface ?? ''}
        data-menu-target-kind={menuState().target?.kind ?? ''}
        data-menu-target-sheet-id={menuState().target?.sheetId ?? ''}
        data-menu-target-row={targetRow()}
        data-menu-target-col={targetCol()}
        role="menu"
        style={{
          position: 'absolute',
          left: `${toInt(menuState().position?.x ?? 0)}px`,
          top: `${toInt(menuState().position?.y ?? 0)}px`,
          'z-index': 1000,
        }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={focusController.handleMenuKeyDown}
        ref={focusController.setRoot}
      >
        <For each={commandList()}>
          {(command, index) => (
            <button
              type="button"
              role="menuitem"
              tabindex={index() === 0 ? 0 : -1}
              class="context-menu-item spreadsheet-context-menu-item"
              data-menu-command={command}
              data-testid={`context-menu-command-${command}`}
              title={getContextMenuTooltip(command, menuState().target!, t)}
              onClick={() => commandExecutor.dispatch(command)}
            >
              {t(getContextMenuLabelKey(command))}
            </button>
          )}
        </For>
      </div>
    </Show>
  )
}
