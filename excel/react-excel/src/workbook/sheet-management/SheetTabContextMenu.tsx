import { Trans, useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  closeSheetTabMenuAtom,
  duplicateSheetAtom,
  groupedSheetIdsAtom,
  hiddenSheetListAtom,
  hideSheetAtom,
  hostControlsAtom,
  isSheetGroupActiveAtom,
  openUnhideDialogAtom,
  selectAllSheetsAtom,
  setSheetTabColorAtom,
  sheetManagementUiAtom,
  sheetTabsAtom,
  toggleTabColorMenuAtom,
  ungroupSheetsAtom,
  visibleSheets,
  workbookDocumentAtom,
  runWorkbookSheetCommandAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { TAB_COLORS } from './tab-colors'
import './sheet-management.css'

/** 工作表操作集中在标签右键菜单；命令目标是右键点击的表。 */
export function SheetTabContextMenu({ structureBusy }: { readonly structureBusy: boolean }) {
  const { i18n, t } = useLingui()
  const menu = useAtomValue(sheetTabsAtom).contextMenu
  const ui = useAtomValue(sheetManagementUiAtom)
  const hidden = useAtomValue(hiddenSheetListAtom)
  const controls = useAtomValue(hostControlsAtom)
  const sheets = useAtomValue(workbookDocumentAtom).sheets
  const grouped = useAtomValue(groupedSheetIdsAtom)
  const isGroupActive = useAtomValue(isSheetGroupActiveAtom)
  const close = useSetAtom(closeSheetTabMenuAtom)
  const duplicate = useSetAtom(duplicateSheetAtom)
  const hide = useSetAtom(hideSheetAtom)
  const openUnhide = useSetAtom(openUnhideDialogAtom)
  const toggleColors = useSetAtom(toggleTabColorMenuAtom)
  const setColor = useSetAtom(setSheetTabColorAtom)
  const selectAll = useSetAtom(selectAllSheetsAtom)
  const ungroup = useSetAtom(ungroupSheetsAtom)
  const run = useSetAtom(runWorkbookSheetCommandAtom)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    const view = element?.ownerDocument.defaultView
    if (!menu || !element || !view) return
    const position = () => {
      element.style.left = `${Math.max(8, Math.min(menu.x, view.innerWidth - element.offsetWidth - 8))}px`
      element.style.top = `${Math.max(8, Math.min(menu.y - element.offsetHeight,
        view.innerHeight - element.offsetHeight - 8))}px`
    }
    position()
    view.addEventListener('resize', position)
    return () => view.removeEventListener('resize', position)
  }, [menu, ui.colorMenuOpen])

  useEffect(() => {
    const element = ref.current
    if (!menu || !element) return
    element.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const owner = element.ownerDocument
    const workbook = element.closest('.workbook')
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) void close()
    }
    owner.addEventListener('pointerdown', outside, true)
    return () => {
      owner.removeEventListener('pointerdown', outside, true)
      if (owner.activeElement !== owner.body && !element.contains(owner.activeElement)) return
      const tabs = workbook?.querySelectorAll<HTMLElement>('[role="tab"][data-sheet-id]') ?? []
      Array.from(tabs).find((tab) => tab.dataset.sheetId === menu.sheetId)
        ?.focus({ preventScroll: true })
    }
  }, [menu, close])

  if (!menu) return null
  const target = sheets.find((sheet) => sheet.id === menu.sheetId)
  if (!target) return null
  const locked = structureBusy || !controls.allowSheetStructure || controls.readOnly
  const visible = visibleSheets(sheets)
  const onlyVisible = visible.length <= 1
  const allGrouped = !onlyVisible && grouped.length >= visible.length
  const items = (): HTMLElement[] =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])

  return (
    <div
      ref={ref}
      className="sheet-tab-menu"
      role="menu"
      aria-label={t`Worksheet tab`}
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault()
          void close()
          return
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const list = items()
        const at = list.indexOf(event.target as HTMLElement)
        const step = event.key === 'ArrowDown' ? 1 : -1
        list[(at + step + list.length) % list.length]?.focus()
      }}
    >
      <button type="button" role="menuitem" disabled={locked} onClick={() => void run({ operation: 'add' })}>
        <Trans>New sheet</Trans>
      </button>
      <button type="button" role="menuitem" disabled={locked || onlyVisible}
        onClick={() => void run({ operation: 'request-delete', sheetId: target.id })}>
        <Trans>Delete sheet</Trans>
      </button>
      <button type="button" role="menuitem" disabled={locked}
        onClick={() => void run({ operation: 'begin-rename', sheetId: target.id })}>
        <Trans>Rename sheet</Trans>
      </button>
      <div role="separator" />
      <button type="button" role="menuitem" disabled={locked || target.index <= 0}
        onClick={() => void run({ operation: 'move-left', sheetId: target.id })}>
        <Trans>Move sheet left</Trans>
      </button>
      <button type="button" role="menuitem" disabled={locked || target.index >= sheets.length - 1}
        onClick={() => void run({ operation: 'move-right', sheetId: target.id })}>
        <Trans>Move sheet right</Trans>
      </button>
      <button type="button" role="menuitem" disabled={locked} onClick={() => void duplicate(target.id)}>
        <Trans context="worksheet">Duplicate</Trans>
      </button>
      <div role="separator" />
      <button
        type="button"
        role="menuitem"
        disabled={locked || onlyVisible}
        onClick={() => void hide(target.id)}
      >
        <Trans>Hide</Trans>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={locked || hidden.length === 0}
        onClick={() => void openUnhide()}
      >
        <Trans>Unhide…</Trans>
      </button>
      <button
        type="button"
        role="menuitem"
        aria-label={t`Tab color`}
        aria-haspopup="menu"
        aria-expanded={ui.colorMenuOpen}
        disabled={locked}
        onClick={() => void toggleColors()}
      >
        <Trans>Tab color</Trans> ▸
      </button>
      {ui.colorMenuOpen && (
        <div className="sheet-tab-colors" role="group" aria-label={t`Tab color`}>
          {TAB_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              className="sheet-tab-swatch"
              aria-label={i18n._(color.name)}
              title={i18n._(color.name)}
              aria-pressed={target.tabColor === color.value}
              style={{ background: color.value }}
              onClick={() => void setColor({ sheetId: target.id, color: color.value })}
            />
          ))}
          <button
            type="button"
            className="sheet-tab-no-color"
            disabled={!target.tabColor}
            onClick={() => void setColor({ sheetId: target.id, color: null })}
          >
            <Trans>No color</Trans>
          </button>
        </div>
      )}
      <button
        type="button"
        role="menuitem"
        disabled={onlyVisible || allGrouped}
        onClick={() => void selectAll()}
      >
        <Trans>Select all sheets</Trans>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!isGroupActive}
        onClick={() => void ungroup()}
      >
        <Trans>Ungroup sheets</Trans>
      </button>
    </div>
  )
}
