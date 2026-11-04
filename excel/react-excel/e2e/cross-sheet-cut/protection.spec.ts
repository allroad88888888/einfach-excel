import { expect, test } from '@playwright/test'
import { closeProtection, openProtection, protect } from '../protection/support'
import { button, cell, copy, paste, select, sheet, start } from './support'

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await start(page)
})

test('XSCUT-07 a protected third-sheet dependent follows a cross-sheet cut and its undo', async ({ page }) => {
  // 与插删行列一致：引用方只被动改写（#16），受保护的第三表不阻止剪切，自身仍保持保护。
  await sheet(page, 'Cut Audit')
  await openProtection(page)
  await protect(page)
  await closeProtection(page)
  await sheet(page, 'Cut Source')
  await select(page, 'A1:B1', '0:0')
  await copy(page, 'Cut')
  await sheet(page, "Target O'Brien")
  await select(page, 'C4', '3:2')
  await paste(page)
  await expect(cell(page, '3:2')).toHaveText('4')
  await expect(cell(page, '3:3')).toHaveText('19')
  await sheet(page, 'Cut Source')
  await expect(await select(page, 'A1', '0:0')).toHaveText('')
  await sheet(page, 'Cut Audit')
  await expect(await select(page, 'A1', '0:0')).toHaveText('23')
  await openProtection(page)
  await expect(button(page, 'Unprotect worksheet')).toBeVisible()
  await closeProtection(page)
  await button(page, 'Undo').click()
  await expect(cell(page, '0:0')).toHaveText('23')
  await sheet(page, 'Cut Source')
  await expect(await select(page, 'A1', '0:0')).toHaveText('4')
  await expect(cell(page, '0:1')).toHaveText('19')
  await sheet(page, "Target O'Brien")
  await expect(cell(page, '3:2')).toHaveText('9')
  await expect(cell(page, '3:3')).toHaveText('99')
})
