import { expect, test, type CDPSession, type Page } from '@playwright/test'

import { expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

/** Verifies an active grid-cell IME session owns Enter and Escape until finalized. */

const gridSelector = '[data-testid="wave5-grid"]'

function cell(page: Page, address: string) {
  return page.locator(`${gridSelector} td.cell[data-cell-addr="${address}"]`)
}

function cellDisplay(page: Page, address: string) {
  return cell(page, address).locator('.cell-display')
}

function cellInput(page: Page, address: string) {
  return cell(page, address).locator('.cell-input')
}

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'B2')).toHaveText('120')

  const backend = test.info().project.name
  expect(['wasm', 'ts']).toContain(backend)
  expect(new URL(page.url()).searchParams.get('backend')).toBe(backend)
}

async function dispatchCompositionKey(
  session: CDPSession,
  key: 'Enter' | 'Escape',
  keyCode: 13 | 27,
) {
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  })
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  })
}

test.describe('grid cell editor IME command boundary', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('composition keeps Enter and Escape in Chromium, then final Enter commits', async ({
    page,
  }) => {
    await gotoWave5(page)
    await cell(page, 'H2').dblclick()

    const editor = cellInput(page, 'H2')
    await expect(editor).toBeVisible()
    await expect(editor).toBeFocused()

    const session = await page.context().newCDPSession(page)
    await session.send('Input.imeSetComposition', {
      text: '汉',
      selectionStart: 1,
      selectionEnd: 1,
      replacementStart: 0,
      replacementEnd: 0,
    })
    await expect(editor).toHaveValue('汉')

    // CDP drives Chromium's real IME path; spreadsheet handlers must leave
    // both command keys to the browser while this composition remains active.
    await dispatchCompositionKey(session, 'Enter', 13)
    await expect(editor).toBeFocused()
    await expect(editor).toHaveValue('汉')

    await dispatchCompositionKey(session, 'Escape', 27)
    await expect(editor).toBeFocused()
    await expect(editor).toHaveValue('汉')

    // `insertText` finalizes the preedit text. A normal key press afterwards
    // must return to spreadsheet semantics and commit the finalized value.
    await editor.evaluate((input) => {
      input.addEventListener(
        'compositionend',
        () => input.setAttribute('data-e2e-composition-ended', 'true'),
        { once: true },
      )
    })
    await session.send('Input.insertText', { text: '汉' })
    await expect(editor).toHaveAttribute('data-e2e-composition-ended', 'true')
    await expect(editor).toHaveValue('汉')
    await editor.press('Enter')

    await expect(editor).toHaveCount(0)
    await expect(cellDisplay(page, 'H2')).toHaveText('汉')
  })
})
