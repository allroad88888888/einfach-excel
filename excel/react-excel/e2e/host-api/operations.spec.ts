import { expect, test } from '@playwright/test'
import { call, cell, ok, start } from './support'

test.beforeEach(async ({ page }) => start(page))

test('host formats an inactive sheet and reads its native display without changing selection', async ({ page }) => {
  const before = await call(page, 'Inspect')
  await ok(page, 'Format')
  const after = await call(page, 'Inspect')
  expect(after.selection).toEqual(before.selection)
  expect(after.lastChange).toMatchObject({ source: 'api', kind: 'host.format' })
  expect(after.display.snapshot.cells[0].format.bold).toBe(true)
  await ok(page, 'Select other')
  await expect(cell(page, '2:2')).toHaveCSS('font-weight', '700')
})

test('host clears an explicit range while keeping its neighbor', async ({ page }) => {
  await ok(page, 'Clear'); await ok(page, 'Select other')
  await expect(cell(page, '2:2')).toHaveText('')
  await expect(cell(page, '2:3')).toHaveText('Neighbor')
})

test('host shifts cells through native range insertion', async ({ page }) => {
  await ok(page, 'Shift'); await ok(page, 'Select other')
  await expect(cell(page, '2:2')).toHaveText('')
  await expect(cell(page, '2:3')).toHaveText('Target')
  await expect(cell(page, '2:4')).toHaveText('Neighbor')
})

test('host resizes columns and hides rows outside the active sheet', async ({ page }) => {
  await ok(page, 'Resize'); await ok(page, 'Select other')
  await expect.poll(async () => (await cell(page, '2:2').boundingBox())?.width).toBe(180)
  await ok(page, 'Hide row')
  await expect(cell(page, '2:2')).toHaveCount(0)
})

test('host inserts rows and publishes structural events with updated bounds', async ({ page }) => {
  await ok(page, 'Insert row')
  const result = await call(page, 'Inspect')
  expect(result.document.sheets.find((s: { id: string }) => s.id === 'other').rowCount).toBe(201)
  expect(result.counts.structure).toBe(1)
  await ok(page, 'Select other')
  await expect(cell(page, '3:2')).toHaveText('Target')
})

test('host freezes and merges a named worksheet', async ({ page }) => {
  await ok(page, 'Freeze'); await ok(page, 'Merge'); await ok(page, 'Select other')
  const merged = page.locator('.merged-cell[data-cell="2:2"]')
  await expect(merged).toHaveText('Target')
  await expect.poll(async () => (await merged.boundingBox())?.height).toBe(56)
  await expect(page.locator('.frozen-viewport')).toBeVisible()
})

test('host sorts a range without sorting its header', async ({ page }) => {
  await ok(page, 'Sort'); await ok(page, 'Select other')
  await expect(cell(page, '0:0')).toHaveText('Numbers')
  for (const row of [1, 2, 3]) await expect(cell(page, `${row}:0`)).toHaveText(String(row))
})

test('host filters an explicit range using native predicates', async ({ page }) => {
  await ok(page, 'Filter'); await ok(page, 'Select other')
  await expect(cell(page, '1:0')).toHaveText('3')
  await expect(cell(page, '2:0')).toHaveCount(0)
  await expect(cell(page, '3:0')).toHaveText('2')
})

test('host creates conditional formatting evaluated by Rust', async ({ page }) => {
  await ok(page, 'Conditional format'); await ok(page, 'Select other')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '2:0')).toHaveCSS('font-weight', '400')
})

test('host installs validation enforced during real cell editing', async ({ page }) => {
  await ok(page, 'Validation'); await ok(page, 'Select other')
  await cell(page, '2:2').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('Invalid'); await editor.press('Enter')
  await expect(cell(page, '2:2')).toHaveText('Target')
  await expect(page.getByRole('alert')).toContainText(/list|valid/i)
})

test('host changes sheet names order visibility colors and copies native data', async ({ page }) => {
  await ok(page, 'Rename sheet'); await ok(page, 'Color sheet'); await ok(page, 'Move sheet')
  await ok(page, 'Copy sheet'); await ok(page, 'Hide sheet'); await ok(page, 'Add sheet')
  const result = await call(page, 'Inspect')
  expect(result.document.sheets[0]).toMatchObject({ id: 'other', name: 'Renamed', hidden: true, tabColor: '#FF0000' })
  expect(result.document.sheets).toHaveLength(4)
  expect(result.counts.structure).toBe(6)
  await ok(page, 'Delete sheet')
  expect((await call(page, 'Inspect')).document.sheets).toHaveLength(3)
})

test('host undo and redo share the workbook native history', async ({ page }) => {
  await ok(page, 'Clear'); await ok(page, 'Undo'); await ok(page, 'Select other')
  await expect(cell(page, '2:2')).toHaveText('Target')
  await ok(page, 'Redo'); await expect(cell(page, '2:2')).toHaveText('')
})

test('host finds and replaces with an explicit native revision', async ({ page }) => {
  expect(await ok(page, 'Find')).toMatchObject({ total: 1 })
  await ok(page, 'Replace'); await ok(page, 'Select other')
  await expect(cell(page, '2:2')).toHaveText('Replaced')
})

test('host operation policy rejects invalid targets and structural bypasses', async ({ page }) => {
  expect(await call(page, 'Invalid target')).toMatchObject({ status: 'error' })
  await call(page, 'Busy'); await ok(page, 'Format')
  await call(page, 'Lock structure')
  expect(await call(page, 'Insert row')).toMatchObject({ status: 'error', error: { code: 'HOST_STRUCTURE_DISABLED' } })
  await call(page, 'Read only')
  expect(await call(page, 'Clear')).toMatchObject({ status: 'error', error: { code: 'HOST_READ_ONLY' } })
})
