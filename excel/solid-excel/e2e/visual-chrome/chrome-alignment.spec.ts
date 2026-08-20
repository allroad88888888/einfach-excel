import { expect, test, type Page } from '@playwright/test'

import { expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

/**
 * Chrome 对齐守卫(VC-01..05,见 CASES.md)。
 *
 * 这些用例锁的是 jsdom 单测测不到的 CSSOM 事实:chrome 条之间不许有
 * 透明缝隙(暗色宿主会漏光)、控件高度统一、暗色皮肤下文字必须可读。
 * 每一条都对应一类修过的真实回归(acfa5cb / f5892d7),不许为了改皮肤
 * 而放松阈值 —— 阈值就是规格。
 *
 * 刻意驱动 wave5 demo(nav-tab-vnext-wave5):它的 chrome 组合最全,
 * 且不吃 ?backend= 参数,不进入双后端矩阵(皮肤与引擎无关)。
 */

async function gotoWave5(page: Page, query = '') {
  guardConsoleErrors(page)
  await page.goto(withEnglishLocale(query))
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('td.cell').first()).toBeVisible({ timeout: 30_000 })
}

/** WCAG 相对亮度对比,输入 getComputedStyle 的 rgb()/rgba() 字符串。 */
async function contrastBetween(page: Page, fgSel: string, bgSel: string): Promise<number> {
  return page.evaluate(
    ([fg, bg]) => {
      const channel = (v: number) => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      const luminance = (color: string) => {
        const parts = color.match(/[\d.]+/g)!.map(Number)
        return 0.2126 * channel(parts[0]) + 0.7152 * channel(parts[1]) + 0.0722 * channel(parts[2])
      }
      const fgEl = document.querySelector(fg)!
      const bgEl = document.querySelector(bg)!
      const l1 = luminance(getComputedStyle(fgEl).color)
      const l2 = luminance(getComputedStyle(bgEl).backgroundColor)
      const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
      return (hi + 0.05) / (lo + 0.05)
    },
    [fgSel, bgSel] as const,
  )
}

test.describe('vnext chrome alignment guards', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('chrome strips are flush and opaque (no host background bleed)', async ({ page }) => {
    await gotoWave5(page)

    const geometry = await page.evaluate(() => {
      const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
      const bg = (sel: string) => getComputedStyle(document.querySelector(sel)!).backgroundColor
      const grid = rect('.spreadsheet-grid')
      const formulaBar = rect('.spreadsheet-formula-bar')
      const bottomRow = rect('.vnext-demo-bottom-row')
      const tabs = rect('.spreadsheet-sheet-tabs')
      return {
        formulaToGridGap: Math.abs(grid.top - formulaBar.bottom),
        gridToBottomGap: Math.abs(bottomRow.top - grid.bottom),
        tabsTopInRow: Math.abs(tabs.top - bottomRow.top),
        backgrounds: [
          bg('.spreadsheet-toolbar'),
          bg('.spreadsheet-formula-bar'),
          bg('.spreadsheet-sheet-tabs'),
          bg('.vnext-demo-bottom-row'),
        ],
      }
    })

    // 缝隙预算 1px(边框归属浮动);历史 bug 是 6px 透明缝。
    expect(geometry.formulaToGridGap).toBeLessThanOrEqual(1)
    expect(geometry.gridToBottomGap).toBeLessThanOrEqual(1)
    // 页签不许再有 margin-top 造成的下沉(历史 bug:6px 漏光)。
    expect(geometry.tabsTopInRow).toBeLessThanOrEqual(1)
    for (const background of geometry.backgrounds) {
      expect(background, 'chrome 条必须铺不透明底色').not.toMatch(/rgba\(.*,\s*0\)|transparent/)
    }
  })

  test('every toolbar control shares the 28px control height', async ({ page }) => {
    await gotoWave5(page)

    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('.spreadsheet-toolbar .spreadsheet-toolbar-button')]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => Math.round(el.getBoundingClientRect().height)),
    )
    expect(heights.length).toBeGreaterThan(10)
    expect(new Set(heights)).toEqual(new Set([28]))
  })

  test('headers show the two-tier Excel selection highlight', async ({ page }) => {
    await gotoWave5(page)

    // 点一个单元格:所在行/列表头 = 浅色触及态。
    await page.locator('td.cell[data-cell-addr="B3"]').click()
    await expect(page.locator('.spreadsheet-grid-col-header[data-col="1"]')).toHaveClass(
      /is-in-selection/,
    )
    await expect(page.locator('.spreadsheet-grid-row-header[data-row="2"]')).toHaveClass(
      /is-in-selection/,
    )

    // 点列字母:整列选中 = 实心选中态。
    await page.locator('.spreadsheet-grid-col-header[data-col="1"]').click()
    await expect(page.locator('.spreadsheet-grid-col-header[data-col="1"]')).toHaveClass(
      /is-selected/,
    )
  })

  test('dark skin keeps cell text readable (AA contrast)', async ({ page }) => {
    await gotoWave5(page, 'theme=dark')

    await expect(page.locator('.app')).toHaveAttribute('data-spreadsheet-theme', 'dark')
    const contrast = await contrastBetween(page, 'td.cell[data-cell-addr="A1"]', 'td.cell[data-cell-addr="A1"]')
    // 历史 bug:暗色宿主下白底白字,对比度 ≈ 1。AA 正文线是 4.5。
    expect(contrast).toBeGreaterThanOrEqual(4.5)

    const stripBg = await page.evaluate(
      () => getComputedStyle(document.querySelector('.vnext-demo-bottom-row')!).backgroundColor,
    )
    expect(stripBg).not.toMatch(/rgba\(.*,\s*0\)|transparent/)
  })
})
