import { expect, test } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { start, open, selectText, text, dialog, button, save, go } from '../support/rich-baseline'

test('HTML clipboard exports edited inline glyph styles while escaping markup and retaining plain text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await start(page); await go(page, 'D8'); await showRibbonItem(page, 'format.vertical-alignment')
  await page.getByRole('combobox', { name: 'Vertical alignment', exact: true }).selectOption('bottom')
  await open(page, 'D8'); await text(page).fill('A<img>&')
  await selectText(text(page), 1, 5); await button(dialog(page), 'Subscript').click(); await save(page)
  await go(page, 'D8'); await showRibbonItem(page, 'clipboard.copy-as')
  await page.getByRole('combobox', { name: 'Copy as', exact: true }).selectOption('html')
  await expect(page.getByLabel('Clipboard status')).toContainText('as html.')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('A<img>&')
  const result = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read())[0]
    const doc = new DOMParser().parseFromString(await (await item.getType('text/html')).text(), 'text/html')
    const td = doc.querySelector('td')!
    return { text: td.textContent, images: doc.querySelectorAll('img').length,
      align: td.style.verticalAlign, spans: [...td.querySelectorAll('span')].map(span => ({
        text: span.textContent, size: span.style.fontSize, align: span.style.verticalAlign,
      })) }
  })
  expect(result.text).toBe('A<img>&'); expect(result.images).toBe(0)
  expect(result.align).toBe('bottom')
  const sub = result.spans.find(span => span.text === '<img>')!
  expect(sub.size).toBe('10.4pt'); expect(parseFloat(sub.align)).toBeLessThan(0)
  expect(result.spans[0].size).toBe('16pt')
})

test('HTML clipboard retains explicit normal over a superscript cell', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await start(page); await go(page, 'D11'); await showRibbonItem(page, 'clipboard.copy-as')
  await page.getByRole('combobox', { name: 'Copy as', exact: true }).selectOption('html')
  await expect(page.getByLabel('Clipboard status')).toContainText('as html.')
  const result = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read())[0]
    const doc = new DOMParser().parseFromString(await (await item.getType('text/html')).text(), 'text/html')
    return [...doc.querySelectorAll('td span')].map(span => {
      const node = span as HTMLElement
      return { text: node.textContent, size: node.style.fontSize, align: node.style.verticalAlign }
    })
  })
  expect(result[0].size).toBe('10.4pt'); expect(parseFloat(result[0].align)).toBeGreaterThan(0)
  expect(result[1]).toEqual({ text: 'B', size: '16pt', align: 'baseline' })
})
