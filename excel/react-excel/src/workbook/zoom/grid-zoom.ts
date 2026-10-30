/**
 * 网格滚动容器带 CSS `zoom` 时，`clientX/Y` 与 `getBoundingClientRect` 是屏幕像素，
 * 而 `clientWidth`、`scrollTop`、行高列宽都是容器内的逻辑像素。两者之比即缩放比例。
 */
export function gridZoomOf(element: Element | null | undefined): number {
  const scroll = element?.closest<HTMLElement>('.sheet-scroll')
  if (!scroll || scroll.offsetWidth === 0) return 1
  const ratio = scroll.getBoundingClientRect().width / scroll.offsetWidth
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1
}
