import { expect, type Page } from '@playwright/test'
import { showRibbonItem } from './ribbon'
import { patternWorkbookData } from './pattern-fill'
import { downloadDateFile } from './conditional-dates'

export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const stops = [{ position: 0, color: '#ff0000' }, { position: 0.5, color: '#00ff00' },
  { position: 1, color: '#0000ff' }]
export const gradientWorkbookData = {
  ...patternWorkbookData, title: 'Gradients', workbook: { ...patternWorkbookData.workbook,
    formats: [{ ...patternWorkbookData.workbook.formats[0], cellStyles: [
      ...patternWorkbookData.workbook.formats[0].cellStyles,
      { addr: 'B2', format: { fill: { kind: 'linear-gradient', degree: -450, stops }, bgColor: '#ff0000' } },
    ] }],
  },
}
export const gradientWorkbook = Buffer.from(JSON.stringify(gradientWorkbookData))
export async function openGradient(page: Page, mode?: 'linear-gradient' | 'path-gradient') {
  await showRibbonItem(page, 'format.gradient-fill')
  await button(page, 'Gradient fill').click()
  if (mode) await page.getByLabel('Gradient type', { exact: true }).selectOption(mode)
}
export async function applyGradient(page: Page) {
  await button(page, 'Apply fill').click()
  await expect(page.getByRole('dialog', { name: 'Gradient fill', exact: true })).toHaveCount(0)
}
export async function nativeWorkbook(page: Page) {
  return JSON.parse((await downloadDateFile(page)).toString()).workbook
}
export async function nativeFormat(page: Page, addr = 'B2') {
  const native = await nativeWorkbook(page)
  return native.formats.flatMap((f: { cellStyles: { addr: string; format: unknown }[] }) => f.cellStyles)
    .find((style: { addr: string }) => style.addr === addr)?.format
}
