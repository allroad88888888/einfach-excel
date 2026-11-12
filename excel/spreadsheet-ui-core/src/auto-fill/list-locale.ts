import type { FillSeriesListWitness, FillSeriesLocaleOptions } from './types'

export const FILL_SERIES_LIST_MAX_ITEMS = 512
export const FILL_SERIES_LIST_MAX_CHARS = 16_384
export const FILL_SERIES_CUSTOM_LIST_LIMIT = 32
export const FILL_SERIES_CANDIDATE_LIMIT = 66
export const FILL_SERIES_CANDIDATE_MAX_CHARS = 1_100_000
export const DEFAULT_FILL_SERIES_LOCALE = 'en'
const SUPPORTED_FILL_SERIES_LOCALE_LANGUAGES = new Set(['en', 'zh', 'tr', 'az'])

export function isReservedFillSeriesListName(listName: string): boolean {
  // These prefixes are protocol identifiers, not user-facing language.
  const normalized = listName.toLowerCase()
  return normalized.startsWith('builtin-') || normalized.startsWith('locale-')
}

export function canonicalizeFillSeriesLocale(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  try {
    const canonical = Intl.getCanonicalLocales(value)
    if (canonical.length !== 1) return null

    const [language, ...remaining] = canonical[0].split('-')
    if (!SUPPORTED_FILL_SERIES_LOCALE_LANGUAGES.has(language)) return null

    const isCanonicalScript = (part: string) => /^[A-Z][a-z]{3}$/.test(part)
    const isCanonicalRegion = (part: string) => /^(?:[A-Z]{2}|\d{3})$/.test(part)
    const hasSupportedShape =
      remaining.length === 0 ||
      (remaining.length === 1 &&
        (isCanonicalScript(remaining[0]) || isCanonicalRegion(remaining[0]))) ||
      (remaining.length === 2 && isCanonicalScript(remaining[0]) && isCanonicalRegion(remaining[1]))

    return hasSupportedShape ? canonical[0] : null
  } catch {
    return null
  }
}

/** Shared detector/backend text fold. Callers must pass a supported canonical locale. */
export function foldFillSeriesText(value: string, locale: string): string {
  return value.toLocaleLowerCase(locale)
}

export function normalizeFillSeriesListWitness(
  value: unknown,
): (FillSeriesListWitness & { readonly locale: string }) | null {
  if (
    !isLocaleRecord(value) ||
    typeof value.listName !== 'string' ||
    value.listName.trim().length === 0 ||
    typeof value.locale !== 'string' || value.listName.length > 80 ||
    !Array.isArray(value.values) ||
    value.values.length < 2 ||
    value.values.length > FILL_SERIES_LIST_MAX_ITEMS ||
    !value.values.every((item) => typeof item === 'string' && item.trim().length > 0)
  ) {
    return null
  }

  const locale = canonicalizeFillSeriesLocale(value.locale)
  // Wire witnesses are already normalized by the locale command. Reject a
  // rewritten/non-canonical locale rather than silently changing semantics.
  if (locale === null || locale !== value.locale) return null

  const values = [...value.values] as string[]
  if (values.reduce((sum, item) => sum + item.length, 0) > FILL_SERIES_LIST_MAX_CHARS) return null
  const normalizedValues = values.map((item) => foldFillSeriesText(item, locale))
  if (new Set(normalizedValues).size !== normalizedValues.length) {
    return null
  }

  return Object.freeze({
    listName: value.listName,
    values: Object.freeze(values),
    locale,
  })
}

export function normalizeCustomFillSeriesListWitness(
  value: unknown,
): (FillSeriesListWitness & { readonly locale: string }) | null {
  const witness = normalizeFillSeriesListWitness(value)
  return witness && !isReservedFillSeriesListName(witness.listName) ? witness : null
}

function normalizeOptionalLocaleList(
  listName: string,
  value: unknown,
  locale: string,
): string[] | null {
  if (Array.isArray(value) && value.length === 0) {
    return Object.freeze([]) as unknown as string[]
  }
  const witness = normalizeFillSeriesListWitness({ listName, values: value, locale })
  return witness ? (witness.values as string[]) : null
}

function isLocaleRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function normalizeFillSeriesLocale(value: unknown): FillSeriesLocaleOptions | null {
  try {
    if (!isLocaleRecord(value)) return null
    const locale = canonicalizeFillSeriesLocale(
      value.locale === undefined ? DEFAULT_FILL_SERIES_LOCALE : value.locale,
    )
    if (locale === null) return null
    const weekdayNames = normalizeOptionalLocaleList(
      'locale-weekday',
      value.weekdayNames === undefined ? [] : value.weekdayNames,
      locale,
    )
    const monthNames = normalizeOptionalLocaleList(
      'locale-month',
      value.monthNames === undefined ? [] : value.monthNames,
      locale,
    )
    const rawCustomLists = value.customLists === undefined ? {} : value.customLists

    if (weekdayNames === null || monthNames === null || !isLocaleRecord(rawCustomLists)) {
      return null
    }

    const customLists: Record<string, string[]> = {}
    const entries = Object.entries(rawCustomLists)
    if (entries.length > FILL_SERIES_CUSTOM_LIST_LIMIT) return null
    const names = new Set<string>()
    for (const [name, rawList] of entries) {
      const key = foldFillSeriesText(name.trim(), locale)
      if (name.length > 64 || names.has(key)) return null
      names.add(key)
      const witness = normalizeCustomFillSeriesListWitness({
        listName: name,
        values: rawList,
        locale,
      })
      if (witness === null) return null
      Object.defineProperty(customLists, name, {
        configurable: false,
        enumerable: true,
        value: witness.values,
        writable: false,
      })
    }

    return Object.freeze({
      locale,
      weekdayNames,
      monthNames,
      customLists: Object.freeze(customLists),
    })
  } catch {
    return null
  }
}

