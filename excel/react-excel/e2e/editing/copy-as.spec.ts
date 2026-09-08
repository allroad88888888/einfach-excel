import { expect, test, type Page } from '@playwright/test'
import { select, copy, paste } from '../support/clipboard'

async function copyAs(page: Page, format: string) {
  const menu = page.getByRole('combobox', { name: 'Copy as' })
  await menu.scrollIntoViewIfNeeded()
  await menu.selectOption(format)
  await expect(page.getByLabel('Clipboard status')).toContainText(`as ${format}.`)
  await expect(menu).toHaveValue('')
  return page.evaluate(() => navigator.clipboard.readText())
}

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

test('plain text copies the formatted result without the internal snapshot marker', async ({
  page,
}) => {
  await select(page, 'P3', '2:15')
  expect(await copyAs(page, 'text')).toBe('$125')
  expect(await page.evaluate(async () => (await navigator.clipboard.read())[0].types)).toEqual([
    'text/plain',
  ])
  await select(page, 'G9', '8:6')
  expect(await copyAs(page, 'text')).toBe('2,632.00')
})

test('Markdown copies a table with bold and italic from the Rust seed', async ({ page }) => {
  await select(page, 'A2:C3', '1:0')
  const text = await copyAs(page, 'markdown')
  expect(text.split('\n')).toHaveLength(3)
  expect(text).toContain('**SO-10001**')
  expect(text).toContain('*Acme Co.*')
  expect(text).toContain('| --- | --- | --- |')
  expect(text).toContain('SO-10002')
})

test('HTML copies a real table with styles and a plain-text alternative', async ({ page }) => {
  await select(page, 'A2:F2', '1:0')
  expect(await copyAs(page, 'html')).toContain('SO-10001\tAcme Co.\tNorth')
  const table = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read())[0]
    const html = await (await item.getType('text/html')).text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const cells = [...doc.querySelectorAll('td')]
    return {
      count: cells.length,
      bold: cells[0].style.fontWeight,
      italic: cells[1].style.fontStyle,
      underline: cells[2].style.textDecoration,
      background: cells[3].style.backgroundColor,
      color: cells[4].style.color,
      align: cells[5].style.textAlign,
      marker: doc.querySelector('[data-einfach-clipboard]') !== null,
    }
  })
  expect(table).toMatchObject({
    count: 6,
    bold: 'bold',
    italic: 'italic',
    align: 'center',
    marker: false,
  })
  expect(table.underline).toContain('underline')
  expect(table.background).toBe('rgb(255, 242, 204)')
  expect(table.color).toBe('rgb(192, 0, 0)')
})

test('whole-column export includes all 1001 rows without changing the mounted viewport', async ({
  page,
}) => {
  await page.getByRole('columnheader', { name: 'Select column A', exact: true }).click()
  const before = await page.locator('td[data-cell]').count()
  const text = await copyAs(page, 'text')
  const rows = text.split('\n')
  expect(rows).toHaveLength(1001)
  expect(rows[0]).toBe('Order')
  expect(rows[1000]).toBe('SO-11000')
  expect(await page.locator('td[data-cell]').count()).toBe(before)
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

test('multi-line seed exports one text cell and preserves line breaks in rich formats', async ({
  page,
}) => {
  await select(page, 'I3', '2:8')
  expect(await copyAs(page, 'text')).toBe('Noah East team')
  expect(await copyAs(page, 'markdown')).toContain('Noah<br>East team')
  await copyAs(page, 'html')
  const html = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read())[0]
    return (await item.getType('text/html')).text()
  })
  expect(html).toContain('<br>')
})

test('HTML treats cell markup as text instead of executable tags', async ({ page }) => {
  const target = await select(page, 'B10', '9:1')
  const payload = '<img src="x" onerror="alert(1)">&'
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill(payload)
  await formula.press('Enter')
  await expect(target).toHaveText(payload)
  await copyAs(page, 'html')
  const result = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read())[0]
    const doc = new DOMParser().parseFromString(
      await (await item.getType('text/html')).text(),
      'text/html',
    )
    return {
      images: doc.querySelectorAll('img').length,
      text: doc.querySelector('td')?.textContent,
    }
  })
  expect(result).toEqual({ images: 0, text: payload })
  const markdown = await copyAs(page, 'markdown')
  expect(markdown).not.toContain('<img')
  expect(markdown).toContain('&lt;img')
})

test('Copy As does not turn a pending cut into a move on the next ordinary paste', async ({
  page,
}) => {
  await select(page, 'A2', '1:0')
  await copy(page, 'Cut')
  await select(page, 'B2', '1:1')
  await copyAs(page, 'text')
  const target = await select(page, 'A10', '9:0')
  await paste(page)
  await expect(target).toHaveText('Acme Co.')
  await expect(await select(page, 'A2', '1:0')).toHaveText('SO-10001')
})

test('Copy As is usable on desktop and narrow viewports with readable failure feedback', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await select(page, 'A2:C3', '1:0')
  await copyAs(page, 'html')
  await page.screenshot({ path: info.outputPath('copy-as-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  const menu = page.getByRole('combobox', { name: 'Copy as' })
  await menu.scrollIntoViewIfNeeded()
  await copyAs(page, 'markdown')
  await expect(menu).toBeInViewport()
  expect(
    await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return (
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        rect.width <= 110 &&
        document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element
      )
    }),
  ).toBe(true)
  await page.evaluate(() => {
    const write = navigator.clipboard.write.bind(navigator.clipboard)
    navigator.clipboard.write = () => {
      navigator.clipboard.write = write
      return Promise.reject(new DOMException('Denied', 'NotAllowedError'))
    }
  })
  await menu.selectOption('text')
  const feedback = page.getByRole('alert', { name: 'Clipboard status' })
  await expect(feedback).toContainText('permission was denied')
  await expect(feedback).toBeInViewport()
  await page.screenshot({ path: info.outputPath('copy-as-narrow.png') })
  await copyAs(page, 'text')
  expect(errors).toEqual([])
})
