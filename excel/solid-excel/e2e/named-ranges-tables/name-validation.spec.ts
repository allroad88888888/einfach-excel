import { expect, test, type Locator, type Page } from '@playwright/test'
import { guardConsoleErrors, withEnglishLocale } from '../helpers'

/**
 * Name Manager draft validation on the Wave 5 static demo.
 *
 * `saveNameManagerAtom` (spreadsheet-ui-core/src/named-ranges/index.ts)
 * normalizes the draft through `normalizeNamedRangeName` — pattern
 * `^[A-Za-z_][A-Za-z0-9_]*$`, 1..255 chars — and BLOCKS the mutation
 * before any backend round-trip when the draft is invalid. The dialog
 * (SpreadsheetNameManagerDialog) maps the blocked state to a targeted
 * message: empty name → "Name is required", empty refers-to →
 * "Refers to is required", otherwise "The name or reference is invalid.".
 * A blocked save must keep the dialog open with the draft intact so the
 * user can correct it in place.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

function dialog(page: Page): Locator {
  return page.getByTestId('wave5-name-manager')
}

async function openNameManager(page: Page): Promise<Locator> {
  await page.getByTestId('toolbar-btn-name-manager').click()
  const box = dialog(page)
  await expect(box).toBeVisible()
  return box
}

async function fillAndSave(box: Locator, name: string, refersTo: string) {
  await box.getByTestId('name-input').fill(name)
  await box.getByTestId('name-refers-to').fill(refersTo)
  await box.getByTestId('name-save-button').click()
}

test.describe('Wave 5 Name Manager — draft validation', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('a name starting with a digit (1A) is rejected and the draft survives', async ({ page }) => {
    await gotoWave5(page)
    const box = await openNameManager(page)

    await fillAndSave(box, '1A', 'sheet-1!A1:B2')

    const error = box.getByTestId('name-error-text')
    await expect(error).toBeVisible()
    await expect(error).toHaveText('The name or reference is invalid.')
    // Blocked before transport: dialog stays open, draft intact, no new entry.
    await expect(box).toBeVisible()
    await expect(box.getByTestId('name-input')).toHaveValue('1A')
    await expect(box.getByTestId('name-list')).not.toContainText('1A')
  })

  test('a name containing a space is rejected with the same diagnostic', async ({ page }) => {
    await gotoWave5(page)
    const box = await openNameManager(page)

    await fillAndSave(box, 'My Range', 'sheet-1!A1:B2')

    const error = box.getByTestId('name-error-text')
    await expect(error).toBeVisible()
    await expect(error).toHaveText('The name or reference is invalid.')
    await expect(box.getByTestId('name-input')).toHaveValue('My Range')
    await expect(box.getByTestId('name-list')).not.toContainText('My Range')
  })

  test('empty name and empty refers-to get targeted messages', async ({ page }) => {
    await gotoWave5(page)
    const box = await openNameManager(page)

    // Empty name, refers-to filled.
    await fillAndSave(box, '', 'sheet-1!A1:B2')
    await expect(box.getByTestId('name-error-text')).toHaveText('Name is required')

    // Valid name, empty refers-to.
    await fillAndSave(box, 'ValidName1', '')
    await expect(box.getByTestId('name-error-text')).toHaveText('Refers to is required')
    await expect(box).toBeVisible()
  })

  test('correcting a rejected draft saves without retyping the reference', async ({ page }) => {
    await gotoWave5(page)
    const box = await openNameManager(page)

    await fillAndSave(box, '1A', 'sheet-1!A1:B2')
    await expect(box.getByTestId('name-error-text')).toBeVisible()

    // Fix only the name — the refers-to draft survived the block.
    await box.getByTestId('name-input').fill('FixedName1')
    await box.getByTestId('name-save-button').click()
    await expect(box).toHaveCount(0)

    // Reopening lists the saved entry with a clean draft.
    const reopened = await openNameManager(page)
    await expect(reopened.getByTestId('name-list')).toContainText('FixedName1')
    await expect(reopened.getByTestId('name-input')).toHaveValue('')
  })
})
