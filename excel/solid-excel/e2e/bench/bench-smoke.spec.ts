import { expect, test } from '@playwright/test'

import { expectNoConsoleErrors, guardConsoleErrors } from '../helpers'

const PUBLIC_SCENARIO_IDS = [
  'scroll-large',
  'recalc-chain-large',
  'first-screen-smoke',
] as const

test('the public benchmark route exposes its registered scenarios', async ({ page }) => {
  guardConsoleErrors(page)

  await page.goto('/?bench=1')

  expect(new URL(page.url()).searchParams.get('bench')).toBe('1')
  await expect(page.getByRole('heading', { name: /einfach-excel 性能基准页/ })).toBeVisible()
  await expect(page.getByTestId('bench-no-scenario')).toHaveCount(0)
  await expect(page.getByTestId('bench-stage')).toBeAttached()

  for (const scenarioId of PUBLIC_SCENARIO_IDS) {
    await expect(page.getByTestId(`bench-scenario-${scenarioId}`)).toBeVisible()
    await expect(page.getByTestId(`bench-run-${scenarioId}`)).toBeEnabled()
  }

  await expectNoConsoleErrors(page)
})
