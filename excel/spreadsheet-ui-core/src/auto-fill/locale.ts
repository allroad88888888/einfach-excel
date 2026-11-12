import { atom, type Atom } from '@einfach/core'
import type { FillSeriesLocaleOptions } from './types'
import type { RustFillNamedList } from '../rust-workbook/fill-types'
import { BUILTIN_FILL_SERIES_WEEKDAY_NAMES, BUILTIN_FILL_SERIES_MONTH_NAMES } from './builtin-lists'
import { normalizeFillSeriesLocale, normalizeFillSeriesListWitness,
  foldFillSeriesText } from './list-locale'
import { savedFillListsBackingAtom, type SavedFillList } from './saved-list-state'

const initial = normalizeFillSeriesLocale({ locale: 'en',
  weekdayNames: BUILTIN_FILL_SERIES_WEEKDAY_NAMES, monthNames: BUILTIN_FILL_SERIES_MONTH_NAMES })!
const hostLocaleAtom = atom<FillSeriesLocaleOptions>(initial)
hostLocaleAtom.debugLabel = 'spreadsheet.autoFill.hostLocale'

export function savedListsValidForLocale(lists: readonly SavedFillList[], locale: string): boolean {
  const names = new Set<string>()
  return lists.every(list => {
    const key = foldFillSeriesText(list.name, locale)
    if (names.has(key)) return false
    names.add(key)
    return normalizeFillSeriesListWitness({ listName: `user:${list.name}`,
      values: list.text.split('\n'), locale }) !== null
  })
}

/** 两个来源只合成只读事实；跨来源同名由用户覆盖，来源内部冲突不允许进入状态。 */
const effectiveListsAtom = atom(get => {
  const host = get(hostLocaleAtom)
  const saved = get(savedFillListsBackingAtom)
  const locale = host.locale ?? 'en'
  const userNames = new Set(saved.map(list => foldFillSeriesText(list.name, locale)))
  const customLists: Record<string, string[]> = {}
  const candidates: RustFillNamedList[] = []
  if (host.weekdayNames?.length) candidates.push({ kind: 'weekday-name',
    listName: 'locale-weekday', values: host.weekdayNames, locale })
  if (host.monthNames?.length) candidates.push({ kind: 'month-name',
    listName: 'locale-month', values: host.monthNames, locale })
  const entries = Object.entries(host.customLists ?? {})
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  for (const [name, values] of entries) {
    if (userNames.has(foldFillSeriesText(name.trim(), locale))) continue
    Object.defineProperty(customLists, name, { enumerable: true, value: values })
    candidates.push({ kind: 'custom-list', listName: `host:${name}`, values, locale })
  }
  for (const list of saved) {
    const values = Object.freeze(list.text.split('\n')) as unknown as string[]
    Object.defineProperty(customLists, list.name, { enumerable: true, value: values })
    candidates.push({ kind: 'custom-list', listName: `user:${list.name}`, values, locale })
  }
  return { options: Object.freeze({ ...host, customLists: Object.freeze(customLists) }),
    candidates: Object.freeze(candidates.map(candidate => Object.freeze(candidate))) }
})
effectiveListsAtom.debugLabel = 'spreadsheet.autoFill.effectiveLists'

export const fillSeriesLocaleAtom: Atom<FillSeriesLocaleOptions> = atom(get =>
  get(hostLocaleAtom))
fillSeriesLocaleAtom.debugLabel = 'spreadsheet.autoFill.locale'
export const effectiveFillSeriesLocaleAtom = atom(get => get(effectiveListsAtom).options)
effectiveFillSeriesLocaleAtom.debugLabel = 'spreadsheet.autoFill.effectiveLocale'
export const nativeFillNamedListsAtom = atom(get => get(effectiveListsAtom).candidates)
nativeFillNamedListsAtom.debugLabel = 'spreadsheet.autoFill.nativeNamedLists'

/** 无效配置整体拒绝；新locale不能把任何已保存值或目录名变成隐藏冲突。 */
export const setFillSeriesLocaleAtom = atom(get => get(fillSeriesLocaleAtom),
  (get, set, input: FillSeriesLocaleOptions): boolean => {
    const normalized = normalizeFillSeriesLocale(input)
    if (!normalized ||
      !savedListsValidForLocale(get(savedFillListsBackingAtom), normalized.locale!))
      return false
    set(hostLocaleAtom, normalized)
    return true
  })
setFillSeriesLocaleAtom.debugLabel = 'spreadsheet.autoFill.setLocale'
