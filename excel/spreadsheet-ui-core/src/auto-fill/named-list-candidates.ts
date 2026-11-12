import type { RustFillNamedList } from '../rust-workbook/fill-types'
import { normalizeFillSeriesListWitness, isReservedFillSeriesListName, foldFillSeriesText,
  FILL_SERIES_CANDIDATE_LIMIT, FILL_SERIES_CANDIDATE_MAX_CHARS } from './list-locale'
import { BUILTIN_FILL_SERIES_WEEKDAY_NAMES, BUILTIN_FILL_SERIES_WEEKDAY_LONG_NAMES,
  BUILTIN_FILL_SERIES_MONTH_NAMES, BUILTIN_FILL_SERIES_MONTH_LONG_NAMES } from './builtin-lists'

const builtins: Record<string, readonly string[]> = {
  'builtin-weekday-short': BUILTIN_FILL_SERIES_WEEKDAY_NAMES,
  'builtin-weekday-long': BUILTIN_FILL_SERIES_WEEKDAY_LONG_NAMES,
  'builtin-month-short': BUILTIN_FILL_SERIES_MONTH_NAMES,
  'builtin-month-long': BUILTIN_FILL_SERIES_MONTH_LONG_NAMES,
}

/** Request metadata only: source membership and resulting values belong to Rust. */
export function validateFillNamedLists(lists: readonly RustFillNamedList[]): boolean {
  if (!Array.isArray(lists) || lists.length > FILL_SERIES_CANDIDATE_LIMIT) return false
  let chars = 0
  const counts = [0, 0, 0, 0]
  const names = new Set<string>()
  const configuredLocale = lists[0]?.locale
  return lists.every(list => {
    const witness = normalizeFillSeriesListWitness(list)
    if (!witness || witness.locale !== configuredLocale) return false
    chars += witness.listName.length + witness.locale.length +
      witness.values.reduce((sum, value) => sum + value.length, 0)
    if (chars > FILL_SERIES_CANDIDATE_MAX_CHARS) return false
    const { listName, values, locale } = witness
    if (list.kind === 'custom-list') {
      const match = /^(?:host|user):(.+)$/.exec(listName)
      if (!match || !match[1].trim() || match[1].length > 64 ||
        isReservedFillSeriesListName(match[1])) return false
      const source = listName.startsWith('user:') ? 1 : 0
      const key = `${source}:${foldFillSeriesText(match[1].trim(), locale!)}`
      if (++counts[source] > 32 || names.has(key)) return false
      names.add(key)
      return true
    }
    const prefix = list.kind === 'weekday-name' ? 'weekday' :
      list.kind === 'month-name' ? 'month' : null
    if (!prefix || ++counts[prefix === 'weekday' ? 2 : 3] > 1) return false
    if (listName === `locale-${prefix}`) return true
    const canonical = builtins[listName]
    return listName.startsWith(`builtin-${prefix}-`) && locale === 'en' && !!canonical &&
      canonical.length === values.length &&
      canonical.every((value, index) => value === values[index])
  })
}
