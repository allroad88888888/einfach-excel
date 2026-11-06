import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { MORE_CHART_TYPES, moreChartsMenuOpenAtom, type ChartType } from './core'
import { labels, typeLabels } from './messages'

const ICONS: Record<(typeof MORE_CHART_TYPES)[number], string> = {
  radar: '✶', funnel: '⏷', waterfall: '▟', histogram: '▇', boxplot: '⊟', stock: '⫰',
  treemap: '▦', sunburst: '◉',
}

/** 「更多图表」：一个按钮展开菜单列出其余类型。 */
export function MoreChartsMenu({ disabled, onInsert }: {
  readonly disabled: boolean
  readonly onInsert: (type: ChartType) => void
}) {
  const { i18n } = useLingui()
  const open = useAtomValue(moreChartsMenuOpenAtom)
  const setOpen = useSetAtom(moreChartsMenuOpenAtom)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  // 功能区容器会裁剪溢出内容，菜单改用 fixed 定位，贴着按钮下沿放，并夹在视口内。
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const anchor = trigger.current.getBoundingClientRect()
    const width = menu.current.offsetWidth
    menu.current.style.top = `${anchor.bottom + 2}px`
    menu.current.style.left = `${Math.max(4, Math.min(anchor.left, window.innerWidth - width - 4))}px`
  }, [open])
  useEffect(() => {
    if (!open) return
    // 点到菜单外面、按 Esc 都收起。
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape'
        : !root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', close, true)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', close, true)
    }
  }, [open, setOpen])
  return (
    <div ref={root} className="plugin-chart-more">
      <button ref={trigger} type="button" className="tool-button" data-chart-type="more"
        aria-haspopup="menu" aria-expanded={open} disabled={disabled}
        aria-label={i18n._(labels.more)} title={i18n._(labels.more)}
        onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <div ref={menu} className="plugin-chart-menu" role="menu" aria-label={i18n._(labels.more)}>
          {MORE_CHART_TYPES.map((type) => (
            <button key={type} type="button" role="menuitem" data-chart-type={type}
              disabled={disabled}
              onClick={() => { setOpen(false); onInsert(type) }}>
              <span aria-hidden="true">{ICONS[type]}</span>{i18n._(typeLabels[type])}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
