import { For, Show, createMemo } from 'solid-js'
import { useT } from '../../src/i18n'
import {
  isMenuItemDescriptor,
  MENU_BAR_ITEMS,
  type MenuBarEntry,
  type MenuItemDescriptor,
  type MenuItemDispatch,
  type TopMenuDescriptor,
  type TopMenuId,
} from '@einfach/spreadsheet-ui-core'

export interface MenuBarPresentationProps {
  isOpen: (menuId: TopMenuId) => boolean
  onDropdownKeyDown: (menuId: TopMenuId, event: KeyboardEvent) => void
  onItemActivate: (item: MenuItemDescriptor) => void
  onTopButtonClick: (menuId: TopMenuId) => void
  onTopButtonHover: (menuId: TopMenuId) => void
  onTopButtonKeyDown: (menuId: TopMenuId, event: KeyboardEvent) => void
  getChecked: (dispatch: MenuItemDispatch) => boolean | undefined
  getDisabledReason: (dispatch: MenuItemDispatch) => string | null
  hiddenItemIds?: readonly string[]
  resolveCapability: (key: string | undefined) => boolean
}

/** Renders the ARIA menu hierarchy; all open and command state stays above this view. */
export function MenuBarPresentation(props: MenuBarPresentationProps) {
  return (
    <For each={MENU_BAR_ITEMS}>
      {(menu) => (
        <MenuBarTopButton
          menu={menu}
          isOpen={props.isOpen(menu.id)}
          onClick={() => props.onTopButtonClick(menu.id)}
          onHover={() => props.onTopButtonHover(menu.id)}
          onKeyDown={(event) => props.onTopButtonKeyDown(menu.id, event)}
          onDropdownKeyDown={(event) => props.onDropdownKeyDown(menu.id, event)}
          onItemActivate={props.onItemActivate}
          getChecked={props.getChecked}
          getDisabledReason={props.getDisabledReason}
          resolveCapability={props.resolveCapability}
          hiddenItemIds={props.hiddenItemIds}
        />
      )}
    </For>
  )
}

interface MenuBarTopButtonProps {
  menu: TopMenuDescriptor
  isOpen: boolean
  onClick: () => void
  onHover: () => void
  onKeyDown: (event: KeyboardEvent) => void
  onDropdownKeyDown: (event: KeyboardEvent) => void
  onItemActivate: (item: MenuItemDescriptor) => void
  getChecked: (dispatch: MenuItemDispatch) => boolean | undefined
  getDisabledReason: (dispatch: MenuItemDispatch) => string | null
  resolveCapability: (key: string | undefined) => boolean
  hiddenItemIds?: readonly string[]
}

function MenuBarTopButton(props: MenuBarTopButtonProps) {
  const t = useT()
  const entries = createMemo(() =>
    filterHostVisibleEntries(props.menu.items, props.hiddenItemIds ?? []),
  )
  return (
    <div class="menu-bar-top" role="none" data-testid={`menu-bar-top-${props.menu.id}`}>
      <button
        type="button"
        class={`menu-bar-button ${props.isOpen ? 'menu-bar-button-open' : ''}`.trim()}
        data-testid={`menu-bar-button-${props.menu.id}`}
        data-menu-bar-top-button={props.menu.id}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={props.isOpen}
        accessKey={props.menu.accessKey.toLowerCase()}
        onClick={props.onClick}
        onMouseEnter={props.onHover}
        onKeyDown={props.onKeyDown}
      >
        {t(props.menu.label)}
      </button>
      <Show when={props.isOpen}>
        <div
          class="menu-bar-dropdown"
          role="menu"
          data-testid={`menu-bar-dropdown-${props.menu.id}`}
          data-menu-bar-dropdown={props.menu.id}
          onKeyDown={props.onDropdownKeyDown}
        >
          <For each={entries()}>
            {(entry) => (
              <MenuBarDropdownEntry
                entry={entry}
                onActivate={props.onItemActivate}
                getChecked={props.getChecked}
                getDisabledReason={props.getDisabledReason}
                resolveCapability={props.resolveCapability}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

function filterHostVisibleEntries(
  entries: readonly MenuBarEntry[],
  hiddenItemIds: readonly string[],
): readonly MenuBarEntry[] {
  if (hiddenItemIds.length === 0) return entries
  const hiddenIds = new Set(hiddenItemIds)
  const filtered: MenuBarEntry[] = []
  let pendingSeparator: MenuBarEntry | null = null
  for (const entry of entries) {
    if (isMenuItemDescriptor(entry) && hiddenIds.has(entry.id)) continue
    if (!isMenuItemDescriptor(entry)) {
      if (filtered.length > 0 && pendingSeparator === null) pendingSeparator = entry
      continue
    }
    if (pendingSeparator) {
      filtered.push(pendingSeparator)
      pendingSeparator = null
    }
    filtered.push(entry)
  }
  return filtered
}

function MenuBarDropdownEntry(props: {
  entry: MenuBarEntry
  onActivate: (item: MenuItemDescriptor) => void
  getChecked: (dispatch: MenuItemDispatch) => boolean | undefined
  getDisabledReason: (dispatch: MenuItemDispatch) => string | null
  resolveCapability: (key: string | undefined) => boolean
}) {
  const isHidden = () =>
    isMenuItemDescriptor(props.entry) &&
    props.entry.isAvailable === 'capability' &&
    !props.resolveCapability(props.entry.capabilityKey)
  return (
    <Show when={!isHidden()}>
      <Show
        when={isMenuItemDescriptor(props.entry)}
        fallback={
          <div
            class="menu-bar-separator"
            role="separator"
            data-testid={`menu-bar-separator-${(props.entry as { id: string }).id}`}
          />
        }
      >
        <DropdownItemButton
          item={props.entry as MenuItemDescriptor}
          onActivate={props.onActivate}
          getChecked={props.getChecked}
          getDisabledReason={props.getDisabledReason}
        />
      </Show>
    </Show>
  )
}

function DropdownItemButton(props: {
  item: MenuItemDescriptor
  onActivate: (item: MenuItemDescriptor) => void
  getChecked: (dispatch: MenuItemDispatch) => boolean | undefined
  getDisabledReason: (dispatch: MenuItemDispatch) => string | null
}) {
  const t = useT()
  const disabledReason = () => props.getDisabledReason(props.item.dispatch)
  const isDisabled = () => props.item.isAvailable === 'placeholder' || disabledReason() !== null
  const checked = () => props.getChecked(props.item.dispatch)
  const hasCheck = () => checked() !== undefined
  return (
    <button
      type="button"
      class={`menu-bar-item ${isDisabled() ? 'menu-bar-item-disabled' : ''} ${
        hasCheck() ? 'menu-bar-item-checkable' : ''
      }`.trim()}
      role={hasCheck() ? 'menuitemcheckbox' : 'menuitem'}
      data-testid={`menu-bar-item-${props.item.id}`}
      disabled={isDisabled()}
      aria-checked={hasCheck() ? (checked() ? 'true' : 'false') : undefined}
      title={
        disabledReason() ??
        (isDisabled()
          ? props.item.placeholderMessage
            ? t(props.item.placeholderMessage)
            : ''
          : (props.item.shortcut ?? ''))
      }
      onClick={() => props.onActivate(props.item)}
    >
      <span class="menu-bar-item-label">{t(props.item.label)}</span>
      <Show when={props.item.shortcut}>
        <span class="menu-bar-item-shortcut">{props.item.shortcut}</span>
      </Show>
    </button>
  )
}
