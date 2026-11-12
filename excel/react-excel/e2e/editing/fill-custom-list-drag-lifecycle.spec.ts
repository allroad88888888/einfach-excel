import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import {
  begin,
  button,
  cell,
  close,
  drag,
  finish,
  handle,
  move,
  open,
  panel,
  save,
  start,
  write,
} from '../support/custom-list-drag'

test.beforeEach(async ({ page }) => start(page))

test('unsaved draft and Cancel keep ordinary drag copy; Escape cancels a saved-list drag', async ({
  page,
}) => {
  await open(page)
  await panel(page).getByLabel('Custom list items').fill('Low\nMedium\nHigh')
  await close(page)
  await drag(page, 'D56', '57:3')
  await expect(cell(page, '56:3')).toHaveText('High')
  await expect(cell(page, '57:3')).toHaveText('High')
  await button(page, 'Undo').click()
  await open(page)
  await save(page)
  await close(page)
  await begin(page, 'D56')
  await move(page, '57:3')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.getByTestId('fill-preview')).toHaveCount(0)
  await expect(cell(page, '56:3')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('saved entries survive unsaved edits and closing; single-source and reverse drag use canonical labels', async ({
  page,
}) => {
  await open(page)
  await save(page)
  await panel(page).getByLabel('Custom list items').fill('High\nUnsaved')
  await close(page)
  await drag(page, 'D56', '57:3')
  await expect(cell(page, '56:3')).toHaveText('Low')
  await expect(cell(page, '57:3')).toHaveText('Medium')
  await button(page, 'Undo').click()
  await drag(page, 'D56', '53:3')
  await expect(cell(page, '53:3')).toHaveText('Low')
  await expect(cell(page, '54:3')).toHaveText('Medium')
  await expect(cell(page, '55:3')).toHaveText('High')
})

test('Save reorder changes the next drag and Delete restores ordinary copy', async ({ page }) => {
  await open(page)
  await save(page)
  await save(page, 'Low\nHigh\nMedium')
  await close(page)
  await drag(page, 'D56', '57:3')
  await expect(cell(page, '56:3')).toHaveText('Medium')
  await expect(cell(page, '57:3')).toHaveText('Low')
  await button(page, 'Undo').click()
  await open(page)
  await panel(page).getByRole('button', { name: 'Delete list', exact: true }).click()
  await expect(panel(page).getByRole('status')).toHaveText('List deleted.')
  await close(page)
  await drag(page, 'D56', '57:3')
  await expect(cell(page, '56:3')).toHaveText('High')
  await expect(cell(page, '57:3')).toHaveText('High')
})

for (const modifier of ['Control', 'Meta']) {
  test(`${modifier} forces copy instead of a saved-list sequence`, async ({ page }) => {
    await open(page)
    await save(page)
    await close(page)
    await begin(page, 'D56')
    await move(page, '57:3')
    await page.keyboard.down(modifier)
    await expect(handle(page)).toHaveAttribute('data-mode', 'copy')
    await finish(page)
    await page.keyboard.up(modifier)
    await expect(cell(page, '56:3')).toHaveText('High')
    await expect(cell(page, '57:3')).toHaveText('High')
  })
}

test('saved numbered labels take priority over text-number inference', async ({ page }) => {
  await write(page, 'D55', '54:3', 'Stage1')
  await write(page, 'D56', '55:3', 'Stage3')
  await open(page)
  await save(page, 'Stage1\nStage3\nStage9', 'Stages')
  await close(page)
  await drag(page, 'D55:D56', '57:3')
  await expect(cell(page, '56:3')).toHaveText('Stage9')
  await expect(cell(page, '57:3')).toHaveText('Stage1')
})

test('mixed matrix lanes infer native months and saved priority independently with one undo', async ({
  page,
}) => {
  await write(page, 'C56', '55:2', 'Dec')
  await open(page)
  await save(page)
  await close(page)
  await drag(page, 'C55:D56', '57:3')
  await expect(cell(page, '56:2')).toHaveText('Jan')
  await expect(cell(page, '57:2')).toHaveText('Feb')
  await expect(cell(page, '56:3')).toHaveText('Low')
  await expect(cell(page, '57:3')).toHaveText('Medium')
  await button(page, 'Undo').click()
  for (const coord of ['56:2', '57:2', '56:3', '57:3'])
    await expect(cell(page, coord)).toHaveText('')
  await expect(cell(page, '55:2')).toHaveText('Dec')
})

test('double-click uses the saved list and native neighboring guide', async ({ page }) => {
  await open(page)
  await save(page)
  await close(page)
  for (const [address, coord, value] of [
    ['C56', '55:2', 'a'],
    ['C57', '56:2', 'b'],
    ['C58', '57:2', 'c'],
  ])
    await write(page, address, coord, value)
  await select(page, 'D55:D56', '55:3')
  await handle(page).dblclick()
  await expect(page.getByLabel('Fill status')).toContainText('Filled')
  await expect(cell(page, '56:3')).toHaveText('Low')
  await expect(cell(page, '57:3')).toHaveText('Medium')
  await expect(cell(page, '58:3')).toHaveText('901')
})

test('Chinese Save and Delete immediately control actual fill-handle inference', async ({
  page,
}, info) => {
  await page.goto('/?locale=zh')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: '名称框' })
  const dialog = page.getByRole('dialog', { name: '填充序列', exact: true })
  const go = async (address: string) => {
    await name.fill(address)
    await name.press('Enter')
    await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
      'data-projection-retained',
      'false',
    )
  }
  const openChinese = async () => {
    await go('D55:D58')
    await page.getByRole('button', { name: '填充序列', exact: true }).click()
    await dialog.getByLabel('序列类型').selectOption('custom-list')
  }
  const dragChinese = async (source: string) => {
    await go(source)
    await page.getByRole('button', { name: '拖动填充', exact: true }).hover()
    await page.mouse.down()
    await move(page, '57:3')
    await page.mouse.up()
    await expect(page.getByTestId('fill-preview')).toHaveCount(0)
  }
  await openChinese()
  await dialog.getByLabel('列表名称', { exact: true }).fill('builtin-fake')
  await dialog.getByLabel('自定义列表项', { exact: true }).fill('Low\nMedium\nHigh')
  await dialog.getByRole('button', { name: '保存列表', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('列表名称不能以 builtin- 或 locale- 开头。')
  await dialog.getByLabel('列表名称', { exact: true }).fill('优先级')
  await dialog.getByRole('button', { name: '保存列表', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('列表已保存。')
  await page.screenshot({ path: info.outputPath('custom-list-drag-chinese-dialog.png') })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await dragChinese('D55:D56')
  await expect(cell(page, '56:3')).toHaveText('Low')
  await expect(cell(page, '57:3')).toHaveText('Medium')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await openChinese()
  await dialog.getByRole('button', { name: '删除列表', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('列表已删除。')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await dragChinese('D56')
  await expect(cell(page, '56:3')).toHaveText('High')
  await expect(cell(page, '57:3')).toHaveText('High')
})
