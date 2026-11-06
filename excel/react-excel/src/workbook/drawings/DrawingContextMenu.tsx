import { useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import { changeSheetDrawingAtom, copyDrawingAtom, drawingClipboardAtom, drawingMenuAtom,
  openDrawingMenuAtom, pasteDrawingAtom } from '@einfach-excel/spreadsheet-ui-core'
import '../shift-cells/shift-cells.css'

/** 对象右键菜单：剪切、复制、粘贴、层级与删除；位置由 UI Core 保存，样式沿用单元格菜单。 */
export function DrawingContextMenu() {
  const { t } = useLingui()
  const menu = useAtomValue(drawingMenuAtom)
  const clipboard = useAtomValue(drawingClipboardAtom)
  const open = useSetAtom(openDrawingMenuAtom)
  const change = useSetAtom(changeSheetDrawingAtom)
  const copy = useSetAtom(copyDrawingAtom)
  const paste = useSetAtom(pasteDrawingAtom)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!menu) return
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) open(null)
    }
    document.addEventListener('pointerdown', dismiss, true)
    return () => document.removeEventListener('pointerdown', dismiss, true)
  }, [menu, open])
  if (!menu) return null
  const run = (action: () => Promise<unknown>, refocus = false) => {
    // 对象被剪切或删除后焦点回到同一工作簿的网格，键盘操作不落到 body。
    const grid = ref.current?.closest('.einfach-spreadsheet')
      ?.querySelector<HTMLElement>('[data-workbook-grid="true"]')
    open(null)
    void action()
    if (refocus) grid?.focus({ preventScroll: true })
  }
  const items: readonly { key: string; label: string; disabled?: boolean; action: () => void }[] = [
    { key: 'cut', label: t`Cut`, action: () => run(() => copy({ id: menu.id, cut: true }), true) },
    { key: 'copy', label: t`Copy`, action: () => run(() => copy({ id: menu.id })) },
    { key: 'paste', label: t`Paste`, disabled: !clipboard.pasteHere, action: () => run(() => paste()) },
    { key: 'front', label: t`Bring to front`,
      action: () => run(() => change({ type: 'order', id: menu.id, toFront: true })) },
    { key: 'back', label: t`Send to back`,
      action: () => run(() => change({ type: 'order', id: menu.id, toFront: false })) },
    { key: 'delete', label: t`Delete`,
      action: () => run(() => change({ type: 'remove', id: menu.id }), true) },
  ]
  return (
    <div ref={ref} className="cell-context-menu drawing-context-menu" role="menu"
      aria-label={t`Object actions`} style={{ left: menu.x, top: menu.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          open(null)
          return
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not(:disabled)')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const step = event.key === 'ArrowDown' ? 1 : -1
        buttons[(index + step + buttons.length) % buttons.length]?.focus()
      }}>
      {items.map((item) => <button key={item.key} type="button" role="menuitem"
        data-menu-item={`drawing.${item.key}`} disabled={item.disabled}
        onClick={item.action}>{item.label}</button>)}
    </div>
  )
}
