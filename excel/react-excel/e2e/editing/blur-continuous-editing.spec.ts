import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // 只延迟用户指定的真实写入；其余请求仍由同一个 Rust Worker 处理。
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let held: (() => void) | null = null
    let armed = false
    const writes: Array<{ row: number; col: number; input: string }> = []
    Object.defineProperties(window, {
      holdCellWrite: { value: () => { armed = true } },
      releaseCellWrite: { value: () => { const send = held; held = null; send?.() } },
      cellWrites: { value: writes },
    })
    Worker.prototype.postMessage = function (
      message: {
        command?: string; payload?: { request: { row: number; col: number; input: string } }
      },
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const send = () =>
        post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (message.command === 'cell.setInput') {
        writes.push(message.payload!.request)
        if (armed) { armed = false; held = send; return }
      }
      send()
    }
  })
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

for (const source of ['cell', 'formula'] as const) {
  test(`${source} valid blur opens the next double-clicked cell without a second click`, async ({ page }) => {
    const first = page.locator('td[data-cell="2:1"]')
    const next = page.locator('td[data-cell="3:2"]')
    const before = await next.innerText()
    await first.click()
    if (source === 'cell') await first.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value', exact: true,
    })
    await input.fill('Saved first')
    await next.dblclick()
    await expect(first).toHaveText('Saved first')
    const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
    await expect(editor).toHaveValue(before)
    await expect(editor).toBeFocused()
    await editor.fill('Saved second')
    await page.keyboard.press('Enter')
    await expect(next).toHaveText('Saved second')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(next).toHaveText(before)
    await expect(first).toHaveText('Saved first')
    const writes = await page.evaluate(() => Reflect.get(window, 'cellWrites'))
    expect(writes.map(({ row, col, input: value }: { row: number; col: number; input: string }) =>
      [row, col, value])).toEqual([[2, 1, 'Saved first'], [3, 2, 'Saved second']])
  })

  test(`${source} delayed Enter does not steal focus from the next double-clicked editor`, async ({ page }) => {
    const first = page.locator('td[data-cell="2:1"]')
    const next = page.locator('td[data-cell="3:2"]')
    const before = await next.innerText()
    await first.click()
    if (source === 'cell') await first.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value', exact: true,
    })
    await input.fill('Held Enter')
    await page.evaluate(() => Reflect.get(window, 'holdCellWrite')())
    await input.press('Enter')
    await next.dblclick()
    await page.evaluate(() => Reflect.get(window, 'releaseCellWrite')())
    await expect(first).toHaveText('Held Enter')
    const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
    await expect(editor).toHaveValue(before)
    await expect(editor).toBeFocused()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('C4')
    await page.keyboard.type('Continued')
    await page.keyboard.press('Enter')
    await expect(next).toHaveText('Continued')
    expect(await page.evaluate(() => Reflect.get(window, 'cellWrites').length)).toBe(2)
  })
}

test('a double-click during a held blur write starts only after that write finishes', async ({ page }) => {
  const first = page.locator('td[data-cell="2:1"]')
  const next = page.locator('td[data-cell="3:2"]')
  const before = await next.innerText()
  await first.dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('Held first')
  await page.evaluate(() => Reflect.get(window, 'holdCellWrite')())
  await next.dblclick()
  await expect(editor).toBeDisabled()
  await expect(editor).toHaveValue('Held first')
  await page.evaluate(() => Reflect.get(window, 'releaseCellWrite')())
  await expect(first).toHaveText('Held first')
  await expect(editor).toHaveValue(before)
  await expect(editor).toBeFocused()
  await editor.fill('Next after held write')
  await editor.press('Enter')
  await expect(next).toHaveText('Next after held write')
  expect(await page.evaluate(() => Reflect.get(window, 'cellWrites').length)).toBe(2)
})

test('a name-box draft cancels the delayed double-click intent without stealing focus', async ({ page }) => {
  const first = page.locator('td[data-cell="2:1"]')
  const next = page.locator('td[data-cell="3:2"]')
  const before = await next.innerText()
  await first.dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('Held first')
  await page.evaluate(() => Reflect.get(window, 'holdCellWrite')())
  await next.dblclick()
  await expect(editor).toBeDisabled()
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('C300')
  await page.evaluate(() => Reflect.get(window, 'releaseCellWrite')())
  await expect(first).toHaveText('Held first')
  await expect(editor).toHaveCount(0)
  await expect(next).toHaveText(before)
  await expect(name).toBeFocused()
  await expect(name).toHaveValue('C300')
  await name.press('Enter')
  await expect(name).toHaveValue('C300')
  await expect(page.locator('td[data-cell="299:2"]')).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, 'cellWrites').length)).toBe(1)
})

for (const source of ['cell', 'formula'] as const) {
  test(`${source} rejected held blur returns to its own draft instead of opening the next cell`, async ({ page }) => {
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    const name = page.getByRole('textbox', { name: 'Name box' })
    await name.fill('H45')
    await name.press('Enter')
    const first = page.locator('td[data-cell="44:7"]')
    const next = page.locator('td[data-cell="43:7"]')
    const before = await next.innerText()
    if (source === 'cell') await first.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value', exact: true,
    })
    await input.fill('5.5')
    await page.evaluate(() => Reflect.get(window, 'holdCellWrite')())
    await next.dblclick()
    await expect(input).toBeDisabled()
    await page.evaluate(() => Reflect.get(window, 'releaseCellWrite')())
    await expect(page.getByRole('alert')).toContainText('data validation rule')
    await expect(input).toHaveValue('5.5')
    await expect(input).toBeFocused()
    await expect(name).toHaveValue('H45')
    await expect(next).toHaveText(before)
    await input.fill('8')
    await input.press('Enter')
    await expect(first).toHaveText('8')
    await expect(next).toHaveText(before)
    expect(await page.evaluate(() => Reflect.get(window, 'cellWrites').length)).toBe(2)
  })
}

test('a newer grid selection discards the delayed double-click without opening the old target', async ({ page }) => {
  const first = page.locator('td[data-cell="2:1"]')
  const next = page.locator('td[data-cell="3:2"]')
  const later = page.locator('td[data-cell="5:3"]')
  await first.dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('Held first')
  await page.evaluate(() => Reflect.get(window, 'holdCellWrite')())
  await next.dblclick()
  await expect(editor).toBeDisabled()
  await later.click()
  await page.evaluate(() => Reflect.get(window, 'releaseCellWrite')())
  await expect(first).toHaveText('Held first')
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('D6')
  expect(await page.evaluate(() => Reflect.get(window, 'cellWrites').length)).toBe(1)
})
