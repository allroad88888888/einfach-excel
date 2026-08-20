import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { OWNED_DIALOG_STYLE_PATHS } from './dialog-inventory'

const RAW_COLOR = /#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi

test('D01-D19 feature CSS remains token-only', async () => {
  const results = await Promise.all(
    OWNED_DIALOG_STYLE_PATHS.map(async (path) => {
      const url = new URL(`../../../spreadsheet-ui-styles/${path}`, import.meta.url)
      const source = (await readFile(url, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
      return { path, literals: source.match(RAW_COLOR) ?? [] }
    }),
  )
  const violations = results.flatMap(({ path, literals }) =>
    literals.map((literal) => `${path}: ${literal}`),
  )

  expect(OWNED_DIALOG_STYLE_PATHS).toHaveLength(21)
  expect(violations, 'Dialog leaf styles must use chrome tokens, never raw colors').toEqual([])
})
