import { createEffect, createMemo, onCleanup, onMount } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  captureFilterSortCapabilityAtom,
  captureRemoveDuplicatesCapabilityAtom,
  captureTableCapabilityAtom,
  closeHelpOverlayAtom,
  closeTopMenuAtom,
  filterSortEntrypointProjectionAtom,
  helpOverlayAtom,
  pasteSpecialCapabilityAtom,
  reapplyFilterDisabledReasonAtom,
  retryFilterSortRefreshAtom,
  tableDiagnosticAtom,
  createTableSupportedAtom,
  lastCreatedTableNameAtom,
  lastToggledTableTotalsAtom,
  openTopMenuAtom,
  removeDuplicatesCapabilityAtom,
  textToColumnsEntrypointProjectionAtom,
  toggleTableTotalsSupportedAtom,
  topMenuOpenAtom,
  viewportShowFormulaBarAtom,
  viewportShowGridlinesAtom,
  viewportShowHeadingsAtom,
  type MenuItemDispatch,
  type MenuItemDescriptor,
  type TopMenuId,
} from '@einfach/spreadsheet-ui-core'
import {
  refreshVisibleProjection,
  textToColumnsSupportedAtom,
  useSpreadsheetBackend,
  useSpreadsheetUiStore,
} from '../provider'
import { useT } from '../../src/i18n'
import { SortConfirmationDialog } from '../sort/SortConfirmationDialog'
import { useSortConfirmation } from '../sort/useSortConfirmation'
import { dispatchMenuBarCommand } from './menu-bar-command-router'
import { createMenuBarCommandContext } from './menu-bar-command-context'
import { MenuBarHelpDialog } from './menu-bar-help-dialog'
import { createMenuBarKeyboardController } from './menu-bar-keyboard-controller'
import { MenuBarPresentation } from './menu-bar-presentation'
import { MenuBarStatus } from './menu-bar-status'

export interface SpreadsheetMenuBarProps {
  class?: string
  'data-testid'?: string
  hiddenItemIds?: readonly string[]
}

/** Wires menu presentation to the existing Core atom command boundaries. */
export function SpreadsheetMenuBar(props: SpreadsheetMenuBarProps) {
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const t = useT()
  const sortConfirmation = useSortConfirmation('menu-bar')
  const commandContext = createMenuBarCommandContext(store, backend, sortConfirmation.begin)
  const keyboard = createMenuBarKeyboardController(store)
  const openState = useAtomValue(topMenuOpenAtom)
  const helpOverlay = useAtomValue(helpOverlayAtom)
  const showGridlines = useAtomValue(viewportShowGridlinesAtom)
  const showHeadings = useAtomValue(viewportShowHeadingsAtom)
  const showFormulaBar = useAtomValue(viewportShowFormulaBarAtom)
  const pasteSpecialCapability = useAtomValue(pasteSpecialCapabilityAtom)
  const textToColumnsSupported = useAtomValue(textToColumnsSupportedAtom)
  const removeDuplicatesCapability = useAtomValue(removeDuplicatesCapabilityAtom)
  const createTableSupported = useAtomValue(createTableSupportedAtom)
  const toggleTableTotalsSupported = useAtomValue(toggleTableTotalsSupportedAtom)
  const tableDiagnostic = useAtomValue(tableDiagnosticAtom)
  const lastCreatedTableName = useAtomValue(lastCreatedTableNameAtom)
  const lastToggledTableTotals = useAtomValue(lastToggledTableTotalsAtom)
  const filterSortEntrypoint = useAtomValue(filterSortEntrypointProjectionAtom)
  const textToColumnsEntrypoint = useAtomValue(textToColumnsEntrypointProjectionAtom)
  const reapplyDisabledReason = useAtomValue(reapplyFilterDisabledReasonAtom)
  let rootRef: HTMLDivElement | undefined

  createEffect(() => {
    store.setter(captureFilterSortCapabilityAtom, backend)
    store.setter(captureRemoveDuplicatesCapabilityAtom, backend)
    store.setter(captureTableCapabilityAtom, backend)
  })

  onMount(() => {
    const readyable = backend as typeof backend & { ready?: () => Promise<unknown> }
    void readyable.ready
      ?.call(backend)
      .then(() => {
        store.setter(captureFilterSortCapabilityAtom, backend)
        store.setter(captureRemoveDuplicatesCapabilityAtom, backend)
        store.setter(captureTableCapabilityAtom, backend)
      })
      .catch(() => {})
    if (rootRef) onCleanup(keyboard.attach(rootRef))
  })

  const openMenu = createMemo<TopMenuId | null>(() => {
    const state = openState()
    return state.kind === 'open' ? state.menu : null
  })

  const checkedForDispatch = (dispatch: MenuItemDispatch): boolean | undefined => {
    switch (dispatch.kind) {
      case 'toggle-gridlines':
        return showGridlines()
      case 'toggle-headings':
        return showHeadings()
      case 'toggle-formula-bar':
        return showFormulaBar()
      default:
        return undefined
    }
  }

  const disabledReasonForDispatch = (dispatch: MenuItemDispatch): string | null => {
    switch (dispatch.kind) {
      case 'open-filter-dropdown':
      case 'sort-asc':
      case 'sort-desc':
        return filterSortEntrypoint().disabledReason
      case 'reapply-filter':
        return reapplyDisabledReason()
      case 'open-text-to-columns':
        return textToColumnsEntrypoint().disabledReason
      default:
        return null
    }
  }

  const resolveCapability = (key: string | undefined): boolean => {
    switch (key) {
      case 'pasteSpecial':
        return pasteSpecialCapability()
      case 'textToColumns':
        return textToColumnsSupported()
      case 'removeRows':
        return removeDuplicatesCapability().canRead && removeDuplicatesCapability().canRemove
      case 'createTable':
        return createTableSupported()
      case 'toggleTableTotals':
        return toggleTableTotalsSupported()
      case 'insertRows':
        return backend.insertRows != null
      case 'insertColumns':
        return backend.insertColumns != null
      case 'sortRange':
        return backend.sortRange != null
      default:
        return false
    }
  }

  function dispatchItem(item: MenuItemDescriptor) {
    if (item.isAvailable === 'placeholder' || disabledReasonForDispatch(item.dispatch)) return
    dispatchMenuBarCommand(commandContext, item.dispatch)
    store.setter(closeTopMenuAtom)
  }

  function retryFilterSortRefresh() {
    void store.setter(retryFilterSortRefreshAtom, {
      refreshProjection: (sheetId) => refreshVisibleProjection(store, backend, sheetId),
    })
  }

  function retryTextToColumns() {
    dispatchMenuBarCommand(commandContext, { kind: 'open-text-to-columns' })
  }

  return (
    <>
      <div
        ref={rootRef}
        class={`spreadsheet-menu-bar ${props.class ?? ''}`.trim()}
        role="menubar"
        data-testid={props['data-testid'] ?? 'spreadsheet-menu-bar'}
        data-filter-sort-status={filterSortEntrypoint().status}
        data-filter-sort-error={filterSortEntrypoint().error || undefined}
        data-text-to-columns-entrypoint-status={textToColumnsEntrypoint().status}
        data-text-to-columns-entrypoint-error={textToColumnsEntrypoint().error || undefined}
      >
        <MenuBarPresentation
          isOpen={(menuId) => openMenu() === menuId}
          onDropdownKeyDown={keyboard.onDropdownKeyDown}
          onItemActivate={dispatchItem}
          onTopButtonClick={(menuId) => {
            if (openMenu() === menuId) store.setter(closeTopMenuAtom)
            else store.setter(openTopMenuAtom, menuId)
          }}
          onTopButtonHover={(menuId) => {
            if (openMenu() !== null && openMenu() !== menuId) {
              store.setter(openTopMenuAtom, menuId)
            }
          }}
          onTopButtonKeyDown={keyboard.onTopButtonKeyDown}
          getChecked={checkedForDispatch}
          getDisabledReason={disabledReasonForDispatch}
          hiddenItemIds={props.hiddenItemIds}
          resolveCapability={resolveCapability}
        />
      </div>
      <MenuBarStatus
        filterSortEntrypoint={filterSortEntrypoint}
        lastCreatedTableName={lastCreatedTableName}
        lastToggledTableTotals={lastToggledTableTotals}
        tableDiagnostic={tableDiagnostic}
        textToColumnsEntrypoint={textToColumnsEntrypoint}
        onRetryFilterSort={retryFilterSortRefresh}
        onRetryTextToColumns={retryTextToColumns}
      />
      <MenuBarHelpDialog kind={helpOverlay()} onClose={() => store.setter(closeHelpOverlayAtom)} />
      <SortConfirmationDialog
        owner="menu-bar"
        state={sortConfirmation.state()}
        t={t}
        onCancel={sortConfirmation.cancel}
        onConfirm={sortConfirmation.confirm}
        onRetry={sortConfirmation.retry}
      />
    </>
  )
}
