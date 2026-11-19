import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { openDateFile as openFile } from '../support/conditional-dates'
import { cell, button, stops, gradientWorkbook, openGradient, applyGradient,
  nativeWorkbook, nativeFormat } from '../support/gradient-fill'
import { openPattern, applyPattern } from '../support/pattern-fill'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, gradientWorkbook)
  await select(page, 'B2', '1:1')
})

test('Linear gradient replaces a pattern with one native transaction and one-step undo', async ({ page }) => {
  await openPattern(page, 'darkUp', '#123456', '#abcdef'); await applyPattern(page)
  const before = await nativeWorkbook(page)
  await openGradient(page, 'linear-gradient')
  await page.getByLabel('Start color', { exact: true }).fill('#ff0000')
  await page.getByLabel('End color', { exact: true }).fill('#0000ff')
  await applyGradient(page)
  expect(await nativeFormat(page)).toEqual({ bgColor: '#ff0000', fill: { kind: 'linear-gradient', degree: 0,
    stops: [{ position: 0, color: '#ff0000' }, { position: 1, color: '#0000ff' }] } })
  expect((await nativeWorkbook(page)).cells).toEqual(before.cells)
  await expect(cell(page, '1:2')).toHaveText('C2 kept')
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
  await expect(cell(page, '1:1')).toHaveCSS('background-image', /linear-gradient/)
  await button(page, 'Undo').click()
  expect(await nativeWorkbook(page)).toEqual(before)
})

test('Angle preserves the signed unnormalized value and all imported color stops', async ({ page }) => {
  const before = await nativeWorkbook(page)
  await openGradient(page)
  await page.getByLabel('Angle (degrees)', { exact: true }).fill('-765')
  await applyGradient(page)
  expect((await nativeFormat(page)).fill).toEqual({ kind: 'linear-gradient', degree: -765, stops })
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
  await expect(cell(page, '1:2')).toHaveText('C2 kept')
  await button(page, 'Undo').click(); expect(await nativeWorkbook(page)).toEqual(before)
})

for (const [label, index] of [['Start color', 0], ['End color', 2]] as const)
test(`${label} edits only its endpoint while preserving the imported middle stop`, async ({ page }) => {
  const before = await nativeWorkbook(page)
  await openGradient(page); await page.getByLabel(label, { exact: true }).fill('#abcdef'); await applyGradient(page)
  expect((await nativeFormat(page)).fill.stops).toEqual(stops.map((stop, i) => i === index ? { ...stop, color: '#abcdef' } : stop))
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
  expect((await nativeWorkbook(page)).cells).toEqual(before.cells)
  await button(page, 'Undo').click(); expect(await nativeWorkbook(page)).toEqual(before)
})

test('Rectangular gradient commits four coordinates and retains all imported stops', async ({ page }) => {
  const before = await nativeWorkbook(page)
  await openGradient(page, 'path-gradient'); await applyGradient(page)
  expect((await nativeFormat(page)).fill).toEqual({ kind: 'path-gradient', left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, stops })
  await expect(cell(page, '1:1')).toHaveCSS('background-image', /data:image\/svg\+xml/)
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
  expect((await nativeWorkbook(page)).cells).toEqual(before.cells)
  await button(page, 'Undo').click(); expect(await nativeWorkbook(page)).toEqual(before)
})

test('Gradient type switching preserves both geometry drafts and every imported stop', async ({ page }) => {
  const before = await nativeWorkbook(page)
  await openGradient(page, 'path-gradient')
  await page.getByLabel('Left (%)', { exact: true }).fill('80')
  await page.getByLabel('Right (%)', { exact: true }).fill('20')
  await page.getByLabel('Gradient type', { exact: true }).selectOption('linear-gradient')
  await expect(page.getByLabel('Angle (degrees)', { exact: true })).toHaveValue('-450')
  await page.getByLabel('Angle (degrees)', { exact: true }).fill('810')
  await page.getByLabel('Gradient type', { exact: true }).selectOption('path-gradient')
  await expect(page.getByLabel('Left (%)', { exact: true })).toHaveValue('80')
  await expect(page.getByLabel('Right (%)', { exact: true })).toHaveValue('20')
  await applyGradient(page)
  expect((await nativeFormat(page)).fill).toEqual({ kind: 'path-gradient', left: 0.8, right: 0.2, top: 0.5, bottom: 0.5, stops })
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
  expect((await nativeWorkbook(page)).cells).toEqual(before.cells)
  await button(page, 'Undo').click(); expect(await nativeWorkbook(page)).toEqual(before)
})

for (const [edge, label, value] of [['left', 'Left (%)', '10'], ['right', 'Right (%)', '70'],
  ['top', 'Top (%)', '20'], ['bottom', 'Bottom (%)', '60']] as const)
test(`${label} changes its rectangular coordinate in one undoable transaction`, async ({ page }) => {
  await openGradient(page, 'path-gradient'); await applyGradient(page)
  const before = await nativeWorkbook(page)
  await openGradient(page); await page.getByLabel(label, { exact: true }).fill(value); await applyGradient(page)
  expect((await nativeFormat(page)).fill).toEqual({ kind: 'path-gradient', left: 0.5, right: 0.5,
    top: 0.5, bottom: 0.5, [edge]: Number(value) / 100, stops })
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
  expect((await nativeWorkbook(page)).cells).toEqual(before.cells)
  await button(page, 'Undo').click(); expect(await nativeWorkbook(page)).toEqual(before)
})

for (const [label, index] of [['Inner color', 0], ['Outer color', 2]] as const)
test(`${label} changes the rectangular endpoint without losing intermediate colors`, async ({ page }) => {
  await openGradient(page, 'path-gradient'); await applyGradient(page)
  const before = await nativeWorkbook(page)
  await openGradient(page); await page.getByLabel(label, { exact: true }).fill('#abcdef'); await applyGradient(page)
  expect((await nativeFormat(page)).fill.stops).toEqual(stops.map((stop, i) => i === index ? { ...stop, color: '#abcdef' } : stop))
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
  expect((await nativeWorkbook(page)).cells).toEqual(before.cells)
  await button(page, 'Undo').click(); expect(await nativeWorkbook(page)).toEqual(before)
})
