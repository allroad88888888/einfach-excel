import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { button, cell, configure, edit, start } from './support'

for (const width of [1280, 390]) test.describe(`${width}px validation file and language`, () => {
  test.use({ viewport: { width, height: 850 } })
  test.beforeEach(async ({ page }) => { await start(page) })

  test(`native workbook file preserves custom validation prompts and error level at ${width}px`, async ({ page }) => {
    await configure(page, { prompt: true, style: 'warning' })
    await button(page, 'File').click()
    const downloading = page.waitForEvent('download')
    await button(page, 'Download workbook').click()
    const path = await (await downloading).path()
    const text = await readFile(path!, 'utf8')
    expect(text).toContain('custom-formula'); expect(text).toContain('请输入正数。')
    await button(page, 'Close').click()
    await button(page, 'File').click()
    page.once('dialog', dialog => dialog.accept())
    await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
      name: 'Validation.einfach.json', mimeType: 'application/json', buffer: Buffer.from(text),
    })
    await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'D45', '44:3')
    await expect(page.getByLabel('Validation input message')).toContainText('Quantity')
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Data validation').click()
    await expect(page.getByLabel('Validation formula')).toHaveValue('=D45>0')
    await expect(page.getByLabel('Error alert', { exact: true })).toHaveValue('warning')
    await button(page, 'Cancel').click()
    await edit(page, 'D45', '44:3', '-1')
    await page.getByRole('dialog', { name: 'Check quantity' }).getByRole('button', { name: 'Continue' }).click()
    await expect(cell(page, '44:3')).toHaveText('-1')
    await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
    await expect(cell(page, '44:3')).toHaveText(''); await expect(cell(page, '45:3')).toHaveText('')
  })

  test(`Chinese advanced validation controls preserve the same native rule at ${width}px`, async ({ page }, info) => {
    await configure(page, { prompt: true, style: 'information' })
    await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh')
    await page.getByRole('button', { name: '数据验证', exact: true }).click()
    await expect(page.getByLabel('验证公式', { exact: true })).toHaveValue('=D45>0')
    await expect(page.getByLabel('错误提示', { exact: true })).toHaveValue('information')
    const dialog = page.getByRole('dialog', { name: '数据验证', exact: true })
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    const fields = await dialog.locator('fieldset').evaluate(fieldset =>
      Array.from(fieldset.querySelectorAll('label')).map(label => {
        const control = document.getElementById(label.htmlFor)!
        const text = label.getBoundingClientRect()
        const input = control.getBoundingClientRect()
        return { label: label.textContent, text: { top: text.top, bottom: text.bottom, right: text.right },
          input: { top: input.top, bottom: input.bottom, left: input.left, right: input.right },
          viewportWidth: innerWidth }
      }))
    for (const field of fields) {
      expect(field.input.right, field.label ?? '').toBeLessThanOrEqual(field.viewportWidth)
      if (width === 1280) {
        expect(field.text.top, field.label ?? '').toBeLessThan(field.input.bottom)
        expect(field.input.top, field.label ?? '').toBeLessThan(field.text.bottom)
        expect(field.text.right, field.label ?? '').toBeLessThanOrEqual(field.input.left)
      } else expect(field.text.bottom, field.label ?? '').toBeLessThanOrEqual(field.input.top)
    }
    const explanation = dialog.locator('fieldset > p').first()
    expect(await explanation.evaluate(node => {
      const text = node.getBoundingClientRect()
      const fieldset = node.parentElement!.getBoundingClientRect()
      return Math.abs(text.width - fieldset.width)
    })).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`validation-chinese-${width}.png`) })
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('combobox', { name: '界面语言' }).selectOption('en')
    await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
    await expect(cell(page, '44:3')).toHaveText('')
  })
})
