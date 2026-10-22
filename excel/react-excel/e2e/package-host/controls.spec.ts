import { expect, test } from '@playwright/test'
import {
  start,
  cell,
  book,
  button,
  select,
  edit,
  snapshot,
  eventCount,
  noNewEvents,
} from './support'

for (const bundler of ['vite', 'rspack']) {
  for (const locale of ['en', 'zh'] as const) {
    const instance: 'first' | 'second' = locale === 'en' ? 'first' : 'second'
    const messages =
      locale === 'en'
        ? {
            readOnly: 'This workbook is read-only.',
            busy: 'The workbook is busy. Try again when it is ready.',
            structure: 'Worksheet structure changes are disabled.',
          }
        : {
            readOnly: '此工作簿为只读。',
            busy: '工作簿正忙，请在就绪后重试。',
            structure: '已禁用工作表结构修改。',
          }

    test(`installed ${bundler} read-only rejects keyboard edits with ${locale} feedback`, async ({
      page,
    }) => {
      await start(page, bundler)
      const root = page.locator(`#${instance} .workbook[data-runtime-state="ready"]`)
      await page.evaluate(
        async (key) => window.packageHost.controls({ readOnly: true }, key),
        instance,
      )
      const count = await page.evaluate((key) => window.packageHost.events[key].length, instance)
      await root.locator('td[data-cell="0:0"]').dblclick()
      const editor = root.locator('.cell-editor textarea')
      await editor.fill('19')
      await editor.press('Enter')
      await expect(root.locator('.cell-editor-feedback')).toHaveText(messages.readOnly)
      await expect(root.locator('td[data-cell="0:0"]')).toHaveText('1')
      expect(
        await page.evaluate(
          async (key) =>
            (
              await window.packageHost.read(
                {
                  targets: [
                    {
                      sheetId: 'orders',
                      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
                    },
                  ],
                },
                key,
              )
            ).status,
          instance,
        ),
      ).toBe('ok')
      expect(await page.evaluate((key) => window.packageHost.events[key].length, instance)).toBe(
        count,
      )
      await editor.press('Escape')
      await expect(root.locator('.cell-editor-feedback')).toHaveCount(0)
      const formula = root.locator('textarea.formula-value')
      await formula.fill('23')
      await formula.press('Enter')
      await expect(root.locator('.formula-edit-feedback')).toHaveText(messages.readOnly)
      await expect(root.locator('td[data-cell="0:0"]')).toHaveText('1')
      expect(
        await page.evaluate(
          async (key) =>
            window.packageHost.read(
              {
                targets: [
                  { sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } },
                ],
              },
              key,
            ),
          instance,
        ),
      ).toMatchObject({
        status: 'ok',
        ranges: [{ cells: [{ value: { kind: 'number', value: 1 } }] }],
      })
      expect(await page.evaluate((key) => window.packageHost.events[key].length, instance)).toBe(
        count,
      )
      await formula.press('Escape')
      await expect(root.locator('td[data-cell="0:1"]')).toHaveText('Order 1')
    })

    test(`installed ${bundler} busy rejects external keyboard paste with ${locale} feedback`, async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await start(page, bundler)
      const root = page.locator(`#${instance} .workbook[data-runtime-state="ready"]`)
      await root.locator('td[data-cell="0:0"]').click()
      await page.evaluate(async (key) => {
        await navigator.clipboard.writeText('29')
        await window.packageHost.controls({ busy: true }, key)
      }, instance)
      const count = await page.evaluate((key) => window.packageHost.events[key].length, instance)
      await root.locator('[data-workbook-grid]').press('ControlOrMeta+v')
      await expect(root).toContainText(messages.busy)
      await expect(root.locator('td[data-cell="0:0"]')).toHaveText('1')
      expect(await page.evaluate((key) => window.packageHost.events[key].length, instance)).toBe(
        count,
      )
      const api = await page.evaluate(
        (key) =>
          window.packageHost.write(
            {
              source: 'refresh',
              cells: [
                {
                  sheetId: 'orders',
                  row: 0,
                  col: 0,
                  input: { kind: 'literal', value: { kind: 'number', value: 8 } },
                },
              ],
            },
            key,
          ),
        instance,
      )
      expect(api).toMatchObject({ status: 'ok', changed: true })
      await expect(root.locator('td[data-cell="0:0"]')).toHaveText('8')
      await expect(root.locator('td[data-cell="0:1"]')).toHaveText('Order 1')
    })

    test(`installed ${bundler} structure policy rejects New sheet button with ${locale} feedback`, async ({
      page,
    }) => {
      await start(page, bundler)
      const root = page.locator(`#${instance} .workbook[data-runtime-state="ready"]`)
      await page.evaluate(
        (key) => window.packageHost.controls({ allowSheetStructure: false }, key),
        instance,
      )
      const count = await page.evaluate((key) => window.packageHost.events[key].length, instance)
      await root.locator('.add-sheet').click()
      await expect(root).toContainText(messages.structure)
      await expect(root.locator('.sheet-tab-list').getByRole('tab')).toHaveCount(3)
      expect(await page.evaluate((key) => window.packageHost.events[key].length, instance)).toBe(
        count,
      )
      await expect(root.locator('td[data-cell="0:0"]')).toHaveText('1')
    })

    test(`installed ${bundler} structure policy rejects row insertion toolbar with ${locale} feedback`, async ({
      page,
    }) => {
      await start(page, bundler)
      const root = page.locator(`#${instance} .workbook[data-runtime-state="ready"]`)
      await page.evaluate(
        (key) => window.packageHost.controls({ allowSheetStructure: false }, key),
        instance,
      )
      const count = await page.evaluate((key) => window.packageHost.events[key].length, instance)
      await root.locator('td[data-cell="0:0"]').click()
      await root.locator('select:has(option[value="insert-rows"])').selectOption('insert-rows')
      await expect(root).toContainText(messages.structure)
      await expect(root.locator('td[data-cell="0:0"]')).toHaveText('1')
      await expect(root.locator('td[data-cell="1:0"]')).toHaveText('2')
      expect(await page.evaluate((key) => window.packageHost.events[key].length, instance)).toBe(
        count,
      )
    })
  }

  test(`installed ${bundler} native protection keeps its allowed range editable under host controls`, async ({
    page,
  }) => {
    await start(page, bundler)
    await select(page, 'A1', '0:0')
    await button(page, 'Worksheet protection').click()
    await button(page, 'Allow editing in selection A1').click()
    await button(page, 'Protect worksheet').click()
    await button(page, 'Close').click()
    await edit(page, '7')
    await expect(cell(page, '0:0')).toHaveText('7')
    await select(page, 'A2', '1:0')
    const count = await eventCount(page)
    await edit(page, '9')
    await expect(cell(page, '1:0')).toHaveText('2')
    await noNewEvents(page, count)
    await book(page)
      .getByRole('textbox', { name: 'Active cell value', exact: true })
      .press('Escape')
    expect(await snapshot(page, 'orders', 0, 0)).toMatchObject({
      value: { kind: 'number', value: 7 },
    })
    await page.evaluate(() => window.packageHost.controls({ readOnly: true }))
    await select(page, 'A1', '0:0')
    await edit(page, '10')
    await expect(book(page)).toContainText('This workbook is read-only.')
    await expect(cell(page, '0:0')).toHaveText('7')
  })
}
