import type { JSX } from 'solid-js'

/**
 * 工具栏下拉菜单的视口感知定位。
 *
 * 这些菜单都是 `position: fixed` 锚定在工具栏按钮下方。fixed 元素不随页面
 * 滚动，所以一旦菜单底部超出视口，那部分内容就永远点不到 —— 浏览器的命中
 * 测试在视口外的坐标上返回 `<html>`，Playwright 的 "scroll into view" 对
 * fixed 元素也是空操作。
 *
 * 实测：number-format 菜单 16 项、高 378px，在 1280x720 下菜单底部落在
 * 717.5px —— 距视口底只剩 2.5px。中文标签的字体度量稍有差异（例如 CI 上
 * 缺中文字体走 fallback）就会溢出，最后一项「自定义格式」直接不可点。
 *
 * 处置与 Excel 一致：下方放不下就向上翻；两边都放不下就取较宽松的一侧并
 * 限高滚动。限高后菜单内部可滚动，元素能被正常滚入视野再点击。
 */

export interface AnchorRect {
  top: number
  bottom: number
  left: number
}

export interface AnchoredMenuStyleOptions {
  /** 锚点按钮的视口坐标矩形；无锚点时菜单不显示。 */
  anchor: AnchorRect | null | undefined
  /** 菜单与锚点之间的间距，默认 2px。 */
  gap?: number
  /** 菜单与视口边缘的最小留白，默认 8px。 */
  padding?: number
  /** 叠放层级，默认 500。 */
  zIndex?: number
  /** 视口高度，默认取 window.innerHeight（便于测试注入）。 */
  viewportHeight?: number
}

export function anchoredMenuStyle(options: AnchoredMenuStyleOptions): JSX.CSSProperties {
  const { anchor } = options
  if (!anchor) {
    return { display: 'none' }
  }

  const gap = options.gap ?? 2
  const padding = options.padding ?? 8
  const zIndex = options.zIndex ?? 500
  const viewportHeight =
    options.viewportHeight ?? (typeof window === 'undefined' ? 0 : window.innerHeight)

  const spaceBelow = viewportHeight - anchor.bottom - gap - padding
  const spaceAbove = anchor.top - gap - padding

  const base: JSX.CSSProperties = {
    position: 'fixed',
    left: `${anchor.left}px`,
    'z-index': `${zIndex}`,
    'overflow-y': 'auto',
  }

  // 下方空间不足且上方更宽裕时向上翻。相等时保持向下，维持既有观感。
  if (spaceBelow < spaceAbove) {
    return {
      ...base,
      bottom: `${Math.max(viewportHeight - anchor.top + gap, padding)}px`,
      'max-height': `${Math.max(spaceAbove, 0)}px`,
    }
  }

  return {
    ...base,
    top: `${anchor.bottom + gap}px`,
    'max-height': `${Math.max(spaceBelow, 0)}px`,
  }
}
