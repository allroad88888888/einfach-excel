import { expect, test } from '@playwright/test'
import { start, open, save, threshold, icon, cell, button, cleanNeighbor, addIcons, go, input } from './support'

const cases = [
  { kind: 'min', position: 'Lower icon', value: undefined, expected: ['1', '1', '2'] },
  { kind: 'max', position: 'Upper icon', value: undefined, expected: ['0', '0', '2'] },
  { kind: 'number', position: 'Lower icon', value: '10', expected: ['0', '1', '2'] },
  { kind: 'percent', position: 'Lower icon', value: '10', expected: ['0', '1', '2'] },
  { kind: 'percentile', position: 'Lower icon', value: '50', expected: ['0', '1', '2'] },
  { kind: 'formula', position: 'Lower icon', value: '=$B$1/2', expected: ['0', '1', '2'] },
]

for (const width of [1280, 390]) {
  for (const scenario of cases) test(`icon set ${scenario.kind} threshold applies and undoes once at ${width}px`, async ({ page }) => {
    await start(page, width); await open(page, 'icon-set')
    await threshold(page, scenario.position, scenario.kind, scenario.value); await save(page)
    for (const [row, index] of scenario.expected.entries())
      await expect(icon(page, `${row}:0`)).toHaveAttribute('data-icon-index', index)
    await cleanNeighbor(page); await button(page, 'Undo').click()
    for (const row of [0, 1, 2]) await expect(icon(page, `${row}:0`)).toHaveCount(0)
    await button(page, 'Redo').click()
    await expect(icon(page, '1:0')).toHaveAttribute('data-icon-index', scenario.expected[1]!)
  })

  for (const style of ['three-arrows', 'three-traffic-lights', 'three-flags'])
    test(`choose ${style} icon style at ${width}px`, async ({ page }) => {
      await start(page, width); await open(page, 'icon-set')
      await page.getByLabel('Icon style', { exact: true }).selectOption(style); await save(page)
      await expect(icon(page, '0:0')).toHaveAttribute('data-icon-set', style)
      await expect(icon(page, '2:0')).toHaveAttribute('data-icon-index', '2')
      await expect(cell(page, '1:0')).toContainText('10'); await cleanNeighbor(page)
      await button(page, 'Undo').click(); await expect(icon(page, '0:0')).toHaveCount(0)
    })

  test(`reverse icon order preserves values and undoes once at ${width}px`, async ({ page }) => {
    await start(page, width); await addIcons(page); await open(page)
    await button(page, 'Edit rule 1').click(); await page.getByLabel('Reverse icon order', { exact: true }).check()
    await save(page, true)
    await expect(icon(page, '0:0')).toHaveAttribute('data-icon-index', '2')
    await expect(icon(page, '2:0')).toHaveAttribute('data-icon-index', '0')
    await expect(cell(page, '1:0')).toContainText('10'); await cleanNeighbor(page)
    await button(page, 'Undo').click(); await expect(icon(page, '0:0')).toHaveAttribute('data-icon-index', '0')
  })

  test(`show icon only preserves the raw value and undoes once at ${width}px`, async ({ page }) => {
    await start(page, width); await addIcons(page); await open(page)
    await button(page, 'Edit rule 1').click(); await page.getByLabel('Show icon only', { exact: true }).check()
    await save(page, true); await go(page, 'A2')
    await expect(input(page)).toHaveValue('10')
    await expect(icon(page, '1:0')).toHaveCount(1)
    await expect(cell(page, '1:0').locator('[data-conditional-icon-value="hidden"]')).toHaveCSS('opacity', '0')
    await cleanNeighbor(page); await button(page, 'Undo').click()
    await expect(cell(page, '1:0')).toContainText('10')
  })
}
