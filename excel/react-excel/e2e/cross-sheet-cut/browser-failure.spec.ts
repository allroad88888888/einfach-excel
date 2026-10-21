import { expect, test } from '@playwright/test'
import { button, cell, copy, paste, select, sheet, start } from './support'

test('XSCUT-08 failed browser cut write leaves the source untouched and preserves the previous copy across tabs', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await start(page)
  await select(page, 'A20', '19:0')
  await copy(page)
  await select(page, 'A7', '6:0')
  await page.evaluate(() => {
    const write = navigator.clipboard.write.bind(navigator.clipboard)
    Object.defineProperty(navigator.clipboard, 'write', { configurable: true, value: () => {
      Object.defineProperty(navigator.clipboard, 'write', { configurable: true, value: write })
      return Promise.reject(new DOMException('Test permission denied', 'NotAllowedError'))
    } })
  })
  await button(page, 'Cut').click()
  await expect(page.getByLabel('Clipboard status')).toContainText('permission')
  await expect(cell(page, '6:0')).toHaveText('20')
  await expect(button(page, 'Undo')).toBeDisabled()
  await sheet(page, "Target O'Brien")
  await select(page, 'C20', '19:2')
  await paste(page)
  await expect(cell(page, '19:2')).toHaveText('linked')
  await expect(cell(page, '19:2').locator('[data-cell-hyperlink]')).toHaveAttribute('href', 'https://source.example/')
  await sheet(page, 'Cut Source')
  await expect(await select(page, 'A7', '6:0')).toHaveText('20')
  await expect(await select(page, 'A20', '19:0')).toHaveText('linked')
})
