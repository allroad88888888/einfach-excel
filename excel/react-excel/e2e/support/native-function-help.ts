import { fileURLToPath } from 'node:url'
import { expect, type Locator, type Page } from '@playwright/test'

/** Loads the real WASM function catalog in the page and checks picker help against it. */
export type NativeHelp = {
  summary: string; summary_zh: string
  args: {
    name: string; description: string; description_zh: string; optional: boolean; repeats: boolean
  }[]
  examples: string[]; limitations: { en: string; zh: string }[]
}
export type NativeCatalog = { version: number; functions: { name: string; help: NativeHelp }[] }

const wasmBase = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
const validatorUrl = `/@fs${fileURLToPath(new URL('../../../spreadsheet-ui-core/src/formula-functions/native-catalog.ts', import.meta.url))}`

export async function nativeCatalog(page: Page, variant: string): Promise<NativeCatalog> {
  return page.evaluate(async ({ url, validator }) => {
    const wasm = await import(url)
    await wasm.default()
    const native = wasm.function_catalog()
    const { validateFunctionCatalog } = await import(validator)
    validateFunctionCatalog(native)
    validateFunctionCatalog(JSON.parse(JSON.stringify(native)))
    return native
  }, { url: `${wasmBase}${variant}/einfach_wasm.js`, validator: validatorUrl })
}

/** Name-sorted slice `part` (0-based) of `parts`; the slices partition the catalog. */
export function catalogPart(native: NativeCatalog, part: number, parts: number) {
  const sorted = [...native.functions].sort((a, b) => (a.name < b.name ? -1 : +(a.name > b.name)))
  const size = Math.ceil(sorted.length / parts)
  return sorted.slice(part * size, (part + 1) * size)
}

export async function expectPickerHelp(
  dialog: Locator, list: Locator, name: string, help: NativeHelp,
) {
  await list.selectOption(name)
  const section = dialog.locator(`[data-formula-help="${name}"]`)
  await expect(section).toBeVisible()
  await expect(section.locator('.formula-help-summary')).toHaveText(help.summary)
  await expect(section.locator('[data-parameter]')).toHaveCount(help.args.length)
  await expect(section.locator('dd')).toHaveText(help.args.map((arg) => arg.description))
  await expect(section.locator('.formula-help-examples code')).toHaveText(help.examples)
  await expect(section.locator('.formula-help-limitations li')).toHaveText(help.limitations.map((item) => item.en))
}
