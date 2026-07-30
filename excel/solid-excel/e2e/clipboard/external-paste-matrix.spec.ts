import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import {
  expectNoConsoleErrors,
  grantClipboard,
  guardConsoleErrors,
  withEnglishLocale,
} from '../helpers'

/**
 * External-source paste matrix on the vNext Wave 5 static demo.
 *
 * All payloads are injected via `navigator.clipboard.writeText` WITHOUT the
 * `# einfach-clipboard-origin:` marker, so `createClipboardTsvPastePlan`
 * falls back to `originAddr === paste target` → zero shift. That is the
 * contract this spec pins: external TSV lands literally, shape preserved.
 *
 * Targets live in columns J..L (outside the A1:F9 sales seed) so every
 * test starts from empty cells. J is outside the initial 720px projection
 * window (A..G), so each test jumps there via the name box first.
 */

const WAVE5_GRID = '[data-testid="wave5-grid"]'

function cell(page: Page, addr: string) {
  return page.locator(`${WAVE5_GRID} td.cell[data-cell-addr="${addr}"]`)
}

function display(page: Page, addr: string) {
  return cell(page, addr).locator('.cell-display')
}

async function gotoWave5(page: Page, context: BrowserContext) {
  await grantClipboard(context)
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(display(page, 'B2')).toHaveText('120')
}

async function navigateViaNameBox(page: Page, addr: string) {
  const input = page.getByTestId('name-box-input')
  await input.click()
  await input.fill(addr)
  await input.press('Enter')
  await expect(cell(page, addr)).toBeVisible()
}

async function typeIntoCellAddr(page: Page, addr: string, value: string) {
  await cell(page, addr).dblclick()
  const input = cell(page, addr).locator('.cell-input')
  await expect(input).toBeVisible()
  await input.fill(value)
  await input.press('Enter')
  await expect(input).toHaveCount(0)
}

async function pressPaste(page: Page) {
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${meta}+v`)
}

/** Inject a raw external clipboard payload, as if copied from a foreign app. */
async function writeExternalClipboard(page: Page, text: string) {
  await page.evaluate((payload) => navigator.clipboard.writeText(payload), text)
}

test.describe('external paste matrix — unmarked TSV lands literally', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('multi-row multi-column external TSV restores its shape at the anchor', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)
    await navigateViaNameBox(page, 'J1')

    await writeExternalClipboard(page, 'alpha\t42\nbeta\t7')
    await cell(page, 'J1').click()
    await pressPaste(page)

    // 2×2 rectangle, literal values, zero shift.
    await expect(display(page, 'J1')).toHaveText('alpha')
    await expect(display(page, 'K1')).toHaveText('42')
    await expect(display(page, 'J2')).toHaveText('beta')
    await expect(display(page, 'K2')).toHaveText('7')
  })

  test('CRLF line endings normalize to the same rectangle as LF', async ({ page, context }) => {
    await gotoWave5(page, context)
    await navigateViaNameBox(page, 'J5')

    // Windows-style row separators — the plan's row iterator treats \r\n,
    // \r and \n identically, so the shape must match the LF case exactly.
    await writeExternalClipboard(page, '1\t2\r\n3\t4')
    await cell(page, 'J5').click()
    await pressPaste(page)

    await expect(display(page, 'J5')).toHaveText('1')
    await expect(display(page, 'K5')).toHaveText('2')
    await expect(display(page, 'J6')).toHaveText('3')
    await expect(display(page, 'K6')).toHaveText('4')
  })

  test('ragged short row writes only its own fields and leaves neighbours untouched', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)
    await navigateViaNameBox(page, 'K8')

    // Pre-seed the cell a rectangular paste WOULD overwrite. Row 1 of the
    // payload has a single field, so K8 must survive the ragged paste.
    await typeIntoCellAddr(page, 'K8', 'keep')

    await writeExternalClipboard(page, '1\n2\t3')
    await cell(page, 'J8').click()
    await pressPaste(page)

    await expect(display(page, 'J8')).toHaveText('1')
    await expect(display(page, 'K8')).toHaveText('keep')
    await expect(display(page, 'J9')).toHaveText('2')
    await expect(display(page, 'K9')).toHaveText('3')
  })

  test('external formula text pastes verbatim (zero shift) and evaluates', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)
    await navigateViaNameBox(page, 'J12')

    // No origin marker → fallback origin IS the target, so `=B2*2` must not
    // be rewritten. B2 holds 120 in the Wave 5 seed matrix → J12 shows 240.
    await writeExternalClipboard(page, '=B2*2')
    await cell(page, 'J12').click()
    await pressPaste(page)

    await expect(display(page, 'J12')).toHaveText('240')
    await cell(page, 'J12').click()
    await expect(page.getByTestId('formula-bar-input')).toHaveValue('=B2*2')
  })
})
