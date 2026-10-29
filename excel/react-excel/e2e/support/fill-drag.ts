import { expect, type Page } from '@playwright/test'

// 与 use-grid-drag-autoscroll.ts 的 EDGE_ZONE_PX 一致：指针停在视口上下 48px 内会持续滚动。
const AUTOSCROLL_EDGE_PX = 48

/**
 * 横向拖填充前，用真实滚轮把该行移到视口中部。否则行贴着底边时，等待预览期间的
 * 自动滚动会改变静止指针下的行，合法地转成纵向填充；慢 CI 上几乎必现。
 */
export async function centerRowForHorizontalDrag(page: Page, coord: string) {
  const target = page.locator(`td[data-cell="${coord}"]`)
  await target.scrollIntoViewIfNeeded()
  const viewport = (await page.getByTestId('sheet-scroll').boundingBox())!
  const middle = viewport.y + viewport.height / 2
  await page.mouse.move(viewport.x + viewport.width / 2, middle)
  const box = (await target.boundingBox())!
  await page.mouse.wheel(0, Math.round(box.y + box.height / 2 - middle))
  await expect.poll(async () => {
    const current = (await target.boundingBox())!
    const center = current.y + current.height / 2
    return Math.min(center - viewport.y, viewport.y + viewport.height - center)
  }).toBeGreaterThan(AUTOSCROLL_EDGE_PX * 2)
}
