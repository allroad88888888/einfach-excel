import { expect, test } from '@playwright/test'
import { start, cell, book, select, edit, snapshot } from './support'

for (const bundler of ['vite', 'rspack']) {
  test(`installed ${bundler} unmount terminates its Worker and sibling editing remains independent`, async ({
    page,
  }) => {
    const errors = await start(page, bundler)
    await page.getByRole('button', { name: 'Unmount first', exact: true }).click()
    await expect(book(page)).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.packageHost.workers.live)).toBe(1)
    const second = page.locator('#second')
    await second.locator('td[data-cell="0:0"]').dblclick()
    const editor = second.getByRole('textbox', { name: '单元格编辑器', exact: true })
    await editor.fill('9')
    await editor.press('Enter')
    await expect(second.locator('td[data-cell="0:0"]')).toHaveText('9')
    await page.getByRole('button', { name: 'Remount first', exact: true }).click()
    await expect(cell(page, '0:0')).toHaveText('1')
    expect(await page.evaluate(() => window.packageHost.workers)).toMatchObject({
      created: 3,
      terminated: 1,
      live: 2,
    })
    await expect(second.locator('td[data-cell="0:0"]')).toHaveText('9')
    expect(errors).toEqual([])
  })

  test(`installed ${bundler} failed Worker factory recovers without retaining the prior workbook`, async ({
    page,
  }) => {
    await start(page, bundler)
    await page.getByRole('button', { name: 'Fail first factory', exact: true }).click()
    await expect(page.locator('#first').getByRole('alert')).toContainText('Host factory failure')
    await expect.poll(() => page.evaluate(() => window.packageHost.workers.live)).toBe(1)
    await page.getByRole('button', { name: 'Remount first', exact: true }).click()
    await expect(cell(page, '0:0')).toHaveText('1')
    await select(page, 'A1', '0:0')
    await edit(page, '12')
    await expect(cell(page, '0:0')).toHaveText('12')
    expect(await snapshot(page, 'orders', 0, 0)).toMatchObject({
      value: { kind: 'number', value: 12 },
    })
    await expect(page.locator('#second td[data-cell="0:0"]')).toHaveText('1')
    expect(await page.evaluate(() => window.packageHost.workers.live)).toBe(2)
  })

  test(`installed ${bundler} failed native initialization terminates its Worker and remount recovers`, async ({
    page,
  }) => {
    await start(page, bundler)
    await page.getByRole('button', { name: 'Fail first initialization', exact: true }).click()
    await expect(page.locator('#first').getByRole('alert')).toContainText('Host import failure')
    expect(await page.evaluate(() => window.packageHost.workers)).toMatchObject({
      created: 3,
      terminated: 2,
      live: 1,
    })
    await page.getByRole('button', { name: 'Remount first', exact: true }).click()
    await expect(cell(page, '0:0')).toHaveText('1')
    expect(await page.evaluate(() => window.packageHost.workers)).toMatchObject({
      created: 4,
      terminated: 2,
      live: 2,
    })
    await expect(page.locator('#second td[data-cell="0:1"]')).toHaveText('Order 1')
  })

  test(`installed ${bundler} frozen window keeps actual row header identity and inserts within its band`, async ({
    page,
  }) => {
    const errors = await start(page, bundler)
    await select(page, 'C4', '3:2')
    const first = book(page)
    const header = (row: number) => first.getByRole('button', {
      name: `Select row ${row}`, exact: true,
    })
    const priorRow2 = (await header(2).elementHandle())!
    const priorRow5 = (await header(5).elementHandle())!
    await first.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
    await expect(first.locator('.sheet-grid-frame')).toHaveAttribute('data-frozen-rows', '3')
    await expect(first.locator('[data-workbook-grid]'))
      .toHaveAttribute('data-projection-retained', 'false')
    // 旧slot key会把原row2节点变为普通row5；不只检查新标签或限定冻结选择器。
    await expect.poll(() => priorRow2.evaluate(node => node.isConnected)).toBe(false)
    expect(await priorRow5.evaluate(node => node.isConnected)).toBe(true)
    expect(await priorRow5.getAttribute('aria-label')).toBe('Select row 5')
    expect(await header(5).evaluate((node, previous) => node === previous, priorRow5)).toBe(true)
    await header(2).click()
    await expect(first.getByRole('textbox', { name: 'Name box', exact: true }))
      .toHaveValue('A2:T2')
    await first.getByRole('combobox', { name: 'Insert or delete rows and columns' })
      .selectOption('insert-rows')
    await expect(first.locator('.sheet-grid-frame')).toHaveAttribute('data-frozen-rows', '4')
    await first.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(first.locator('.sheet-grid-frame')).toHaveAttribute('data-frozen-rows', '3')
    await expect(cell(page, '1:0')).toHaveText('2')
    await expect(cell(page, '0:0')).toHaveText('1')
    await expect(page.locator('#second td[data-cell="1:0"]')).toHaveText('2')
    expect(await page.evaluate(() => window.packageHost.workers.live)).toBe(2)
    expect(errors).toEqual([])
    await priorRow2.dispose()
    await priorRow5.dispose()
  })
}
