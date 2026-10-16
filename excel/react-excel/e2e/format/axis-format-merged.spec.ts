import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

// 整行／整列穿过合并格时，仍只修改这一条轴；不能扩选到另一行／列。
const cases = [
  { role: 'button', name: 'Select row 17', target: '16:2', outside: '17:2', anchor: true },
  { role: 'button', name: 'Select row 18', target: '17:2', outside: '16:2', anchor: false },
  { role: 'columnheader', name: 'Select column A', target: '18:0', outside: '18:1', anchor: true },
  { role: 'columnheader', name: 'Select column B', target: '18:1', outside: '18:0', anchor: false },
] as const

for (const width of [1280, 390]) for (const scenario of cases) {
  test(`${scenario.name} formats through a merge and undoes once at ${width}px`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'A17', '16:0')
    const anchor = page.locator('[data-merged-cell][data-cell="16:0"]')
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    await expect(anchor).toHaveText('Two-row merged cell')
    await expect(anchor).toHaveAttribute('aria-rowspan', '2')
    await expect(anchor).toHaveAttribute('aria-colspan', '2')
    await expect(undo).toBeDisabled()
    // 窄屏不会挂载屏外 C 列；逐格用真实名称框定位，不把未渲染当成格式失败。
    const inspect = async () => {
      const result = []
      for (const coord of [scenario.target, scenario.outside, '16:0']) {
        const [row, col] = coord.split(':').map(Number)
        const selected = await select(page, `${String.fromCharCode(65 + col)}${row + 1}`, coord)
        result.push(await (coord === '16:0' ? anchor : selected).evaluate((node) => ({
          color: getComputedStyle(node).backgroundColor, text: node.textContent,
          rows: node.getAttribute('aria-rowspan'), columns: node.getAttribute('aria-colspan'),
        })))
      }
      return result
    }
    const originals = await inspect()
    await page.getByRole(scenario.role, { name: scenario.name, exact: true }).click()
    await page.getByRole('button', { name: 'Fill color', exact: true }).click()
    const yellow = 'rgb(255, 242, 204)'
    const formatted = originals.map((entry, index) => ({ ...entry,
      color: index === 0 || (index === 2 && scenario.anchor) ? yellow : entry.color,
    }))
    await expect(undo).toBeEnabled()
    expect(await inspect()).toEqual(formatted)
    await undo.click()
    await expect(undo).toBeDisabled()
    expect(await inspect()).toEqual(originals)
    await redo.click()
    await expect(redo).toBeDisabled()
    expect(await inspect()).toEqual(formatted)
    if (scenario.name === 'Select row 17') {
      await page.screenshot({ path: `/tmp/excel-axis-merge-format-${width}.png` })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true)
    }
    expect(errors).toEqual([])
  })
}
