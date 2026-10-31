import { expect, type Page } from '@playwright/test'
export { select } from '../support/clipboard'

export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const formula = (page: Page) =>
  page.getByRole('textbox', { name: 'Active cell value', exact: true })
export const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' })
export const preview = (page: Page) => page.getByTestId('drag-move-preview')

export async function start(page: Page) {
  await page.goto('/e2e/fixtures/drag-move/')
  await expect(cell(page, '0:1')).toHaveText('20')
  await expect(button(page, 'Undo')).toBeDisabled()
}

/** 与产品同一规则：Mac 用 Option，其余平台用 Ctrl。 */
export async function copyModifier(page: Page): Promise<'Alt' | 'Control'> {
  const apple = await page.evaluate(() => {
    const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    return /Mac|iPhone|iPad/i.test(data?.platform || navigator.platform || '')
  })
  return apple ? 'Alt' : 'Control'
}

export async function center(page: Page, coord: string) {
  const box = (await cell(page, coord).boundingBox())!
  return [box.x + box.width / 2, box.y + box.height / 2] as const
}

/** 按住选区左上格的上边框（抓取偏移为 0），拖到目标格中心；release=false 时停在半途。 */
export async function dragBorder(page: Page, from: string, to: string, options: {
  readonly modifier?: 'Alt' | 'Control'
  readonly release?: boolean
} = {}) {
  const box = (await cell(page, from).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 1)
  await page.mouse.down()
  await page.mouse.move(...await center(page, to), { steps: 8 })
  await expect(preview(page)).toBeVisible()
  if (options.release === false) return
  if (options.modifier) await page.keyboard.down(options.modifier)
  await page.mouse.up()
  if (options.modifier) await page.keyboard.up(options.modifier)
}
