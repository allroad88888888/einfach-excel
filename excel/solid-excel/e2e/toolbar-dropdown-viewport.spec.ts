/**
 * 工具栏下拉菜单的视口溢出回归钉。
 *
 * 背景：这些菜单都是 `position: fixed`。fixed 元素不随页面滚动，一旦菜单
 * 底部超出视口，超出部分永远点不到 —— 浏览器命中测试在视口外坐标上返回
 * `<html>`，Playwright 的 "scroll into view" 对 fixed 元素也是空操作，
 * 表现为 `locator.click` 卡满 30s 超时。
 *
 * 该缺陷曾在 CI 上让 audit-format 的三条 Format Cells 用例稳定失败，而本地
 * 不复现：number-format 菜单 16 项、高 378px，在 1280x720 下菜单底部落在
 * 717.5px —— 距视口底只剩 2.5px。CI 上中文标签走 fallback 字体、导航多换
 * 一行，就把菜单顶出视口。
 *
 * 修复见 `src-vnext/toolbar/anchored-menu-style.ts`：下方放不下就向上翻，
 * 两边都不够就取较宽松一侧并限高滚动。
 *
 * 440 / 560 两个高度在修复前必定失败，是这份钉子的有效性保证；720 是本地
 * 与 CI 的默认视口，修复前靠 2.5px 侥幸通过。
 */
import { test, expect } from '@playwright/test'

for (const height of [720, 560, 440]) {
  test.describe(`工具栏下拉不溢出视口 — 1280x${height}`, () => {
    test.use({ viewport: { width: 1280, height } })

    test('number-format 菜单末项可点并打开 Format Cells', async ({ page }) => {
      await page.goto('/')
      await page.getByTestId('nav-tab-vnext-wave5').click()
      await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })

      await page
        .locator('[data-testid="wave5-grid"]')
        .locator('td.cell[data-cell-addr="B2"]')
        .click()
      await page.getByTestId('toolbar-btn-number-format').click()
      await expect(page.getByTestId('number-format-dropdown')).toBeVisible()

      const overflows = await page.evaluate(() => {
        const rect = document
          .querySelector('[data-testid="number-format-dropdown"]')
          ?.getBoundingClientRect()
        if (!rect) return null
        return rect.bottom > window.innerHeight || rect.top < 0
      })
      expect(overflows).toBe(false)

      // 末项 Custom：溢出时这一步会卡满超时,这正是原缺陷的表现。
      await page.getByTestId('number-format-item-Custom').click({ timeout: 5_000 })
      await expect(page.getByTestId('wave5-format-cells')).toBeVisible()
    })
  })
}
