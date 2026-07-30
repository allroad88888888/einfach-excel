import { useLocale, type Locale } from '@einfach/solid-excel/i18n'
import { en } from './locales/en'
import { zh } from './locales/zh'

export { setLocale, useLocale } from '@einfach/solid-excel/i18n'

const dictionaries: Record<Locale, Record<string, string>> = { en, zh }

/**
 * Reactive site-copy translator. Falls back to the raw key when it is
 * missing from the active dictionary, so a typo is visible instead of
 * silently rendering empty.
 */
export function useSiteT(): (key: string) => string {
  const activeLocale = useLocale()
  return (key: string) => dictionaries[activeLocale()][key] ?? key
}
