import { expect, test } from '@playwright/test'
import { cell, controlledJson, formula, openAsyncDemo, write } from './fixtures'

test.beforeEach(async ({ page }) => openAsyncDemo(page))

for (const [index, token] of ['#N/A', '#VALUE!', '#BUSY!'].entries())
  test(`JSON string ${token} remains literal text through real Worker HTTP and WASM settlement`, async ({ page }) => {
    const name = `literal-${index}`
    const http = await controlledJson(page, name)
    await write(page, 'B12', '11:1', formula(name))
    await write(page, 'C12', '11:2', '=ISTEXT(B12)')
    await write(page, 'D12', '11:3', '=ISERROR(B12)')
    await http.release(0, token)
    await expect(cell(page, '11:1')).toHaveText(token)
    await expect(cell(page, '11:2')).toHaveText('TRUE')
    await expect(cell(page, '11:3')).toHaveText('FALSE')
  })

test('JSON array error-looking strings remain text inside the native two-dimensional spill', async ({ page }) => {
  const http = await controlledJson(page, 'literal-array')
  await write(page, 'B12', '11:1', formula('literal-array'))
  await write(page, 'E12', '11:4', '=AND(ISTEXT(B12),ISTEXT(C12),ISTEXT(B13),ISTEXT(C13))')
  await write(page, 'F12', '11:5', '=OR(ISERROR(B12),ISERROR(C12),ISERROR(B13),ISERROR(C13))')
  await http.release(0, [['#N/A', '#VALUE!'], ['#BUSY!', '#DIV/0!']])
  await expect(cell(page, '11:1')).toHaveText('#N/A')
  await expect(cell(page, '11:2')).toHaveText('#VALUE!')
  await expect(cell(page, '12:1')).toHaveText('#BUSY!')
  await expect(cell(page, '12:2')).toHaveText('#DIV/0!')
  await expect(cell(page, '11:4')).toHaveText('TRUE')
  await expect(cell(page, '11:5')).toHaveText('FALSE')
})
