import { atom } from '@einfach/core'
import type { SelectionNumbers } from './types'

export type SelectionStatistic = keyof SelectionNumbers
export const selectionStatisticLabels: Readonly<Record<SelectionStatistic, string>> =
Object.freeze({
  count: 'Count', numericCount: 'Numerical count', sum: 'Sum', average: 'Average', min: 'Min', max: 'Max',
})
const defaults = Object.freeze(Object.keys(selectionStatisticLabels) as SelectionStatistic[])
const preferencesAtom = atom<{
  readonly open: boolean; readonly visible: readonly SelectionStatistic[]
}>({
  open: false, visible: defaults,
})

/** 只存当前工作簿会话的显示偏好，不属于 Rust 数据或撤销历史。 */
export const selectionStatisticsPreferencesAtom = atom((get) => get(preferencesAtom))
export const configureSelectionStatisticsAtom = atom(null, (get, set, action:
  | 'open' | 'close' | 'reset'
  | { readonly statistic: SelectionStatistic; readonly visible: boolean },
) => {
  const state = get(preferencesAtom)
  if (action === 'open' || action === 'close') {
    set(preferencesAtom, { ...state, open: action === 'open' })
  } else if (action === 'reset') {
    set(preferencesAtom, { ...state, visible: defaults })
  } else if (defaults.includes(action.statistic)) {
    const visible = defaults.filter((key) => key === action.statistic
      ? action.visible : state.visible.includes(key))
    set(preferencesAtom, { ...state, visible: Object.freeze(visible) })
  }
})
