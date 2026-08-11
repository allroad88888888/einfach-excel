import type { Store } from '@einfach/core'
import { setWorkbookLocaleAtom } from '@einfach/spreadsheet-ui-core'

/** Mirrors the host display locale into a Provider-owned workbook atom. */
export function syncWorkbookLocale(store: Store, locale: string): void {
  store.setter(setWorkbookLocaleAtom, locale)
}
