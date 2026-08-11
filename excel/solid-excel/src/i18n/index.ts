import { i18n } from '@lingui/core'
import { atom, createStore } from '@einfach/core'
import { useAtomValue } from '@einfach/solid'
import { messages as enMessages } from './locales/en'
import { messages as zhMessages } from './locales/zh'

/**
 * Locale switcher built on `@lingui/core`. The Lingui `i18n` instance owns
 * catalog loading + lookup; an Einfach source atom owns the locale and the
 * Solid adapter subscribes to that atom for reactive re-translation.
 *
 *   const t = useT()
 *   <h3>{t('demo.blank.title')}</h3>
 *
 *   setLocale('zh') // every JSX site reading `t(...)` re-renders
 */

/** Catalogs bundled with this client. Keep distinct from a formatting locale. */
export type Locale = 'en' | 'zh'

/** A canonical BCP-47 tag used by Intl and workbook display formatting. */
export type LocaleTag = string

const DEFAULT_LOCALE: Locale = 'zh'

/**
 * A canonical BCP-47 URL `?locale=…` overrides the bundled default. The tag
 * controls workbook display formatting while catalog selection remains limited
 * to the available English and Chinese Lingui bundles. E2E/dev tooling can use
 * `?locale=en` to force English copy. `null` means the parameter was absent or
 * invalid, so the bundled default is retained.
 */
function canonicalizeLocaleTag(value: string | null): LocaleTag | null {
  if (value === null || value.trim().length === 0) return null
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null
  } catch {
    return null
  }
}

function catalogLocaleFor(displayLocale: LocaleTag): Locale {
  return displayLocale === 'zh' || displayLocale.startsWith('zh-') ? 'zh' : 'en'
}

function readLocaleFromUrl(): LocaleTag | null {
  if (typeof window === 'undefined') return null
  const value = new URLSearchParams(window.location.search).get('locale')
  return canonicalizeLocaleTag(value)
}

const INITIAL_LOCALE: LocaleTag = readLocaleFromUrl() ?? DEFAULT_LOCALE

// Lingui catalog setup happens once at module load. Side effect, but the
// alternative (caller calls a `setupI18n()` initializer) just moves the same
// import-order requirement onto the demo entry point.
i18n.load({ en: enMessages, zh: zhMessages })
i18n.activate(catalogLocaleFor(INITIAL_LOCALE))

/** The application and workbook-display locale; this is the locale authority. */
export const localeAtom = atom<LocaleTag>(INITIAL_LOCALE)
localeAtom.debugLabel = 'spreadsheet.i18n.locale'

/** The nearest bundled Lingui catalog for the active BCP-47 display locale. */
export const catalogLocaleAtom = atom<Locale>((get) => catalogLocaleFor(get(localeAtom)))
catalogLocaleAtom.debugLabel = 'spreadsheet.i18n.catalogLocale'

const localeStore = createStore()

/** Current Lingui catalog for imperative callers that only support bundled copy. */
export function locale(): Locale {
  return localeStore.getter(catalogLocaleAtom)
}

/** Reactive bundled-catalog accessor backed by the dedicated Einfach store. */
export function useLocale(): () => Locale {
  return useAtomValue(catalogLocaleAtom, { store: localeStore })
}

/** Current BCP-47 display locale for imperative formatters and bridges. */
export function localeTag(): LocaleTag {
  return localeStore.getter(localeAtom)
}

/** Reactive BCP-47 display locale backed by the locale authority atom. */
export function useLocaleTag(): () => LocaleTag {
  return useAtomValue(localeAtom, { store: localeStore })
}

/**
 * Switch the active display locale. Lingui receives its matching catalog first,
 * then the Einfach source atom publishes the canonical BCP-47 tag to consumers.
 */
export function setLocale(next: string): void {
  const resolved = canonicalizeLocaleTag(next) ?? DEFAULT_LOCALE
  if (localeStore.getter(localeAtom) === resolved) return
  i18n.activate(catalogLocaleFor(resolved))
  localeStore.setter(localeAtom, resolved)
}

/**
 * Reactive translator factory. The returned function reads the `locale`
 * atom adapter on every call, so Solid's reactive tracking picks it up — JSX
 * sites like `<h3>{t('demo.blank.title')}</h3>` re-evaluate on
 * `setLocale(...)`.
 *
 * Missing keys fall back to the msgId itself (Lingui default), so a typo
 * is visible at runtime rather than silently rendering empty.
 */
export function useT(): (id: string, values?: Record<string, unknown>) => string {
  const activeLocale = useLocaleTag()
  return (id: string, values?: Record<string, unknown>) => {
    activeLocale() // dep — Solid adapter subscription to the core atom
    // Lingui interprets `{name}` as ICU placeholders and strips them when no
    // values are supplied (so `_( 'a {x} b' )` returns `'a  b'`, breaking any
    // downstream `.replace()`). Pass `values` here to let Lingui interpolate.
    return i18n._(id, values)
  }
}
