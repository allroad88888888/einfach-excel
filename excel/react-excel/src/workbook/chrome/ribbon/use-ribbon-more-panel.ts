import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  setWorkbookRibbonExpandedAtom,
  workbookRibbonOverflowAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useEffect, useRef, type RefObject } from 'react'

const POPUP = 'dialog,[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]'
const FOLDED = '.ribbon-more-panel'

/**
 * 执行按钮或菜单命令、点外部、Escape 都收起；持有设置值的选择框保留焦点供连续调整。
 * 命令打开了弹窗时保持打开，关弹窗后焦点仍能回到原按钮。收起时折叠组里出现新的错误提示
 * （role="alert"）就自动展开，错误不会被藏起来。只读 DOM 事件，开合状态由 UI Core 持有。
 */
export function useRibbonMorePanel(panelRef: RefObject<HTMLElement | null>) {
  const { collapsed, expanded } = useAtomValue(workbookRibbonOverflowAtom)
  const setExpanded = useSetAtom(setWorkbookRibbonExpandedAtom)
  const alerts = useRef(new WeakMap<Element, string>())

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || collapsed === 0) return
    const surface = () => {
      // Rust 预检可能晚于菜单收起；确认框出现后露出原入口，取消时焦点才有可返回的位置。
      if (panel.querySelector(`${FOLDED} dialog[open]`)) setExpanded(true)
      for (const alert of panel.querySelectorAll(`${FOLDED} [role="alert"]`)) {
        const text = alert.textContent?.trim() ?? ''
        if (!text || alerts.current.get(alert) === text) continue
        alerts.current.set(alert, text)
        setExpanded(true)
      }
    }
    surface()
    const observer = new MutationObserver(surface)
    observer.observe(panel, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['open'],
    })
    return () => observer.disconnect()
  }, [collapsed, panelRef, setExpanded])

  useEffect(() => {
    const panel = panelRef.current
    if (!expanded || !panel) return
    let frame = 0
    const outside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || panel.contains(target) || target.closest(POPUP)) return
      setExpanded(false)
    }
    const escape = (event: KeyboardEvent) => {
      const target = event.target
      if (event.key !== 'Escape' || event.defaultPrevented || !(target instanceof Element)) return
      if (!panel.contains(target) || target.closest(POPUP)) return
      event.preventDefault()
      setExpanded(false)
      panel.querySelector<HTMLElement>('[data-ribbon-more]')?.focus({ preventScroll: true })
    }
    // 命令先跑完（含它同步打开的弹窗），下一帧没有弹窗再收起。
    const command = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest(FOLDED) || target.closest(POPUP)) return
      const control = target.closest(event.type === 'click' ? 'button' : 'select')
      if (!control || control.getAttribute('aria-haspopup') === 'dialog') return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // 命令菜单执行后回到空占位；字体、对齐等设置保留选中值，可以连续调整。
        if (control instanceof HTMLSelectElement && control.value !== '') return
        const workbook = panel.closest('.einfach-spreadsheet') ?? panel
        const popup = 'dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"]'
        if (!workbook.querySelector(popup)) {
          const restoreFocus = document.activeElement === control ||
            document.activeElement === document.body
          setExpanded(false)
          if (restoreFocus) {
            panel.querySelector<HTMLElement>('[data-ribbon-more]')?.focus({ preventScroll: true })
          }
        }
      })
    }
    document.addEventListener('pointerdown', outside, true)
    panel.addEventListener('keydown', escape)
    panel.addEventListener('click', command)
    panel.addEventListener('change', command)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', outside, true)
      panel.removeEventListener('keydown', escape)
      panel.removeEventListener('click', command)
      panel.removeEventListener('change', command)
    }
  }, [expanded, panelRef, setExpanded])
}
