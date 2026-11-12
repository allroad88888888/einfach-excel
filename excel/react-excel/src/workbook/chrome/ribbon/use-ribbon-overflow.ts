import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  reportWorkbookRibbonOverflowAtom,
  workbookRibbonOverflowAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLayoutEffect, useRef, type RefObject } from 'react'

/** “更多”大按钮及其左侧分隔所占宽度。 */
const MORE_WIDTH = 64

type GroupSize = { readonly width: number; readonly inset: number }
const inset = (element: HTMLElement) => {
  const style = getComputedStyle(element)
  return [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth]
    .reduce((sum, value) => sum + (parseFloat(value) || 0), 0)
}

/**
 * 按整组计算末尾要收起几组。工具栏里的组实时量宽并记入缓存；已收起的组用最后一次在行内的宽度。
 * 切换分类时 UI Core 清零折叠，新分类的组都会先在行内排一次。
 */
function collapsedCount(
  tools: HTMLElement, ids: readonly string[], widths: Map<string, GroupSize>,
) {
  let fixed = 0
  for (const element of tools.querySelectorAll<HTMLElement>('[data-ribbon-group]')) {
    if (element.dataset.inactive === 'true') continue
    const id = element.dataset.ribbonGroup ?? ''
    if (ids.includes(id)) {
      const currentInset = inset(element)
      const inlineInset = element.parentElement === tools
        ? currentInset : (widths.get(id)?.inset ?? currentInset)
      widths.set(id, {
        width: element.offsetWidth - currentInset + inlineInset, inset: inlineInset,
      })
    } else if (element.parentElement === tools) fixed += element.offsetWidth
  }
  const available = tools.clientWidth
  const sizes = ids.map((id) => widths.get(id)?.width ?? 0)
  if (fixed + sizes.reduce((sum, size) => sum + size, 0) <= available) return 0
  let used = fixed + MORE_WIDTH
  for (let index = 0; index < sizes.length; index += 1) {
    used += sizes[index]!
    if (used > available) return sizes.length - index
  }
  return 0
}

/**
 * 测量当前分类哪些组放不下并上报 UI Core。只读 DOM 尺寸，折叠数由 workbookRibbonOverflowAtom 持有。
 */
export function useRibbonOverflow(
  toolsRef: RefObject<HTMLElement | null>, groupIds: readonly string[],
) {
  const { collapsed, expanded } = useAtomValue(workbookRibbonOverflowAtom)
  const report = useSetAtom(reportWorkbookRibbonOverflowAtom)
  const widths = useRef(new Map<string, GroupSize>())
  const focusedItem = useRef<string | null>(null)
  const key = groupIds.join('\n')

  useLayoutEffect(() => {
    const tools = toolsRef.current
    if (!tools) return
    const ids = key ? key.split('\n') : []
    const measure = () => {
      const next = collapsedCount(tools, ids, widths.current)
      const focused = document.activeElement
      if (next !== collapsed && focused instanceof HTMLElement && tools.contains(focused)) {
        focusedItem.current = focused.dataset.ribbonItem ?? null
      }
      report(next)
    }
    measure()
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    resize?.observe(tools)
    const mutation = new MutationObserver(schedule)
    mutation.observe(tools, { childList: true, subtree: true, characterData: true })
    return () => {
      cancelAnimationFrame(frame)
      resize?.disconnect()
      mutation.disconnect()
    }
  }, [collapsed, expanded, key, report, toolsRef])

  // 分组在行内与面板间移动会重新挂载；等错误提示展开面板后恢复同一入口，避免吞掉键盘焦点。
  useLayoutEffect(() => {
    if (!focusedItem.current) return
    const frame = requestAnimationFrame(() => {
      const tools = toolsRef.current
      const item = focusedItem.current
      focusedItem.current = null
      if (!tools || !item || document.activeElement !== document.body) return
      const target = tools.querySelector<HTMLElement>(`[data-ribbon-item="${CSS.escape(item)}"]`)
      if (target?.checkVisibility()) target.focus({ preventScroll: true })
      else tools.querySelector<HTMLElement>('[data-ribbon-more]')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [collapsed, expanded, toolsRef])
}
