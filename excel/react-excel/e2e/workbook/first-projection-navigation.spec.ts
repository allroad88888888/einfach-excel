import { expect, test } from '@playwright/test'

/** 延迟真实 Worker 的首个切表请求，稳定覆盖用户先定位、原生尺寸后到达的顺序。 */
test('a name-box jump during the first sheet projection keeps the fill handle below frozen rows', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let armed = false
    let release: (() => void) | null = null
    Object.defineProperties(window, {
      holdNextProjection: { value: () => { armed = true } },
      projectionHeld: { value: () => release !== null },
      releaseProjection: { value: () => { const send = release; release = null; send?.() } },
    })
    Worker.prototype.postMessage = function (
      message: { command?: string }, options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const send = () => post.call(this, message,
        Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (armed && message.command === 'projection.readVisible') {
        armed = false
        release = send
      } else send()
    }
  })
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.evaluate(() => Reflect.get(window, 'holdNextProjection')())
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'projectionHeld')())).toBe(true)
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('A40:A41')
  await name.press('Enter')
  await expect(name).toHaveValue('A40:A41')
  await page.evaluate(() => Reflect.get(window, 'releaseProjection')())
  const handle = page.getByRole('button', { name: 'Drag to fill', exact: true })
  await expect(handle).toBeVisible()
  const fixed = page.locator('[data-frozen-pane="top"] td[data-cell="0:0"]')
  await expect(fixed).toHaveText('First order total')
  const frozen = (await fixed.boundingBox())!
  const target = (await page.locator('td[data-cell="39:0"]').boundingBox())!
  expect(target.y).toBeGreaterThanOrEqual(frozen.y + frozen.height - 1)
  await handle.click()
  await expect(name).toHaveValue('A40:A41')
  await expect(page.locator('td[data-cell="41:0"]')).toHaveText('')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})
