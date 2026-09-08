import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test('a rejected fixed-cell edit keeps its feedback visible outside the cell', async ({ page }) => {
  await page.goto('/')
  await select(page, 'B3', '2:1')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await (await select(page, 'A2', '1:0')).dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('=SUM(')
  await editor.press('Enter')
  const error = page.getByRole('alert')
  await expect(error).toHaveText('That edit was not saved.')
  const editorBox = (await editor.boundingBox())!
  const errorBox = (await error.boundingBox())!
  expect(errorBox.y).toBeGreaterThanOrEqual(editorBox.y + editorBox.height)
  expect(
    await error.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      return node.contains(
        document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
      )
    }),
  ).toBe(true)
  await expect(editor).toBeFocused()
  await editor.press('Escape')
  await expect(error).toHaveCount(0)
})

for (const frozen of [false, true]) {
  for (const axis of ['row', 'column'] as const) {
    test(`editing preserves the draft without covering ${frozen ? 'frozen cells' : 'headers'} on ${axis} scroll`, async ({
      page,
    }) => {
      await page.goto('/')
      if (frozen) {
        await select(page, 'B3', '2:1')
        await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
      }
      const cell = await select(page, 'D5', '4:3')
      await cell.dblclick()
      const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
      await editor.fill('Uncommitted draft')
      const scroll = page.getByTestId('sheet-scroll')
      const box = (await editor.boundingBox())!
      await scroll.evaluate(
        (node, options) => {
          const bounds = node.getBoundingClientRect()
          if (options.axis === 'row') {
            node.scrollTop +=
              options.box.y + options.box.height / 2 - bounds.top - (options.frozen ? 38 : 14)
          } else {
            node.scrollLeft +=
              options.box.x + options.box.width / 2 - bounds.left - (options.frozen ? 66 : 20)
          }
        },
        { axis, frozen, box },
      )
      // 命中测试检查实际绘制／点击层，boundingBox 本身不会扣掉 CSS 裁剪区。
      await expect
        .poll(async () =>
          editor.evaluate((node) => {
            const rect = node.getBoundingClientRect()
            return (
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === node
            )
          }),
        )
        .toBe(false)
      await expect(editor).toBeFocused()
      await expect(editor).toHaveValue('Uncommitted draft')
      await scroll.evaluate((node) => {
        node.scrollTop = 0
        node.scrollLeft = 0
      })
      await expect
        .poll(async () =>
          editor.evaluate((node) => {
            const rect = node.getBoundingClientRect()
            return (
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === node
            )
          }),
        )
        .toBe(true)
      await editor.press('Enter')
      await expect(cell).toHaveText('Uncommitted draft')
    })
  }
}
