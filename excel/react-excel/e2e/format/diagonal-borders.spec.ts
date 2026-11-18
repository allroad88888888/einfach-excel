import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { diagonalCell as cell, diagonalButton as button, diagonalLines, diagonalWorkbook,
  openDiagonal, applyDiagonal, expectDiagonalGeometry } from '../support/diagonal-borders'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, diagonalWorkbook)
  await expect(cell(page, '0:0')).toHaveText('Diagonal fixture')
})

for (const [name, preset, sides] of [
  ['Diagonal down', 'diagonal-down', ['diagDown']],
  ['Diagonal up', 'diagonal-up', ['diagUp']],
  ['Both diagonals', 'diagonal', ['diagDown', 'diagUp']],
  ['No diagonal borders', 'diagonal-none', []],
] as const) test(`${name} changes each selected cell and undoes in one step`, async ({ page }) => {
  await select(page, 'B2:C3', '1:1')
  await openDiagonal(page, 'outside', 'medium', '#123abc'); await applyDiagonal(page)
  if (preset === 'diagonal-none') { await openDiagonal(page, 'diagonal'); await applyDiagonal(page) }
  const before = JSON.parse((await downloadFile(page)).toString()).workbook
  await openDiagonal(page, preset); await applyDiagonal(page)
  for (const coord of ['1:1', '1:2', '2:1', '2:2']) {
    await expectDiagonalGeometry(cell(page, coord), sides)
    await expect(cell(page, coord)).toHaveText(coord === '1:1' ? 'B2 kept'
      : coord === '1:2' ? 'C2 kept' : coord === '2:1' ? 'B3 kept' : 'C3 kept')
  }
  for (const coord of ['0:1', '1:0', '1:3', '3:1']) await expect(diagonalLines(cell(page, coord))).toHaveCount(0)
  await expect(cell(page, '2:2')).toHaveCSS('border-right-color', 'rgb(18, 58, 188)')
  const after = JSON.parse((await downloadFile(page)).toString()).workbook
  expect(after.cells).toEqual(before.cells)
  await button(page, 'Undo').click()
  expect(JSON.parse((await downloadFile(page)).toString()).workbook).toEqual(before)
  await button(page, 'Redo').click()
  expect(JSON.parse((await downloadFile(page)).toString()).workbook).toEqual(after)
})

for (const style of ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'])
  test(`diagonal ${style} uses actual rectangular bounds without resizing the text`, async ({ page }, info) => {
    await select(page, 'B2', '1:1')
    const target = cell(page, '1:1'), original = await target.boundingBox()
    await openDiagonal(page, 'diagonal', style, '#123abc'); await applyDiagonal(page)
    await expectDiagonalGeometry(target, ['diagDown', 'diagUp'], style === 'double' ? 2 : 1)
    expect(await target.boundingBox()).toEqual(original)
    await expect(target).toHaveCSS('font-size', '12px')
    const lines = diagonalLines(target)
    await expect(lines.first()).toHaveAttribute('stroke', '#123abc')
    await expect(lines.first()).toHaveAttribute('stroke-width', style === 'thick' ? '3' : style === 'medium' ? '2' : '1')
    await expect(lines.first()).toHaveAttribute('stroke-dasharray', style === 'dashed' ? '4 3' : style === 'dotted' ? '1 2' : '')
    await info.attach(`${style}.png`, { body: await target.screenshot(), contentType: 'image/png' })
    await button(page, 'Undo').click(); await expect(lines).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
  })

test('physical border presets keep diagonals and both clear-all entries remove them', async ({ page }) => {
  await select(page, 'B2', '1:1')
  await openDiagonal(page, 'diagonal'); await applyDiagonal(page)
  await openDiagonal(page, 'all'); await applyDiagonal(page)
  await expectDiagonalGeometry(cell(page, '1:1'), ['diagDown', 'diagUp'])
  await openDiagonal(page, 'none'); await applyDiagonal(page)
  await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(0)
  await button(page, 'Undo').click()
  await showRibbonItem(page, 'format.borders')
  // The quick toggle first installs its own thin grey preset over custom-colour physical edges.
  await button(page, 'Borders').click()
  await expect(cell(page, '1:1')).toHaveCSS('border-bottom-color', 'rgb(127, 127, 127)')
  await expectDiagonalGeometry(cell(page, '1:1'), ['diagDown', 'diagUp'])
  await button(page, 'Borders').click()
  await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(0)
  await button(page, 'Undo').click()
  await expectDiagonalGeometry(cell(page, '1:1'), ['diagDown', 'diagUp'])
})
