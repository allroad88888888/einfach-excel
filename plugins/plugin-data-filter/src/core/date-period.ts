import { atom } from '@einfach/core'
import {
  configureNativeFilterAtom, nativeFilterPanelAtom, filterDatePeriods, type FilterDatePeriod,
} from '@einfach-excel/spreadsheet-ui-core'

type Action = { readonly index: number } & (
  | { readonly type: 'activate' }
  | { readonly type: 'period'; readonly value: FilterDatePeriod }
)

/** Edit the shared typed leaf; Rust alone resolves calendar boundaries. */
export const configureDatePeriodFilterAtom = atom(null, (get, set, action: Action) => {
  if (!Number.isSafeInteger(action.index) || action.index < 0) return false
  const condition = get(nativeFilterPanelAtom).conditions[action.index]
  if (!condition) return false
  if (action.type === 'period' && (condition.kind !== 'date-period' ||
    !filterDatePeriods.includes(action.value))) return false
  return set(configureNativeFilterAtom, {
    type: 'change', index: action.index, patch: {
      kind: 'date-period', nativeRule: { kind: 'date-period', colIndex: condition.col,
        period: action.type === 'activate' ? 'today' : action.value },
    },
  })
})
configureDatePeriodFilterAtom.debugLabel = 'plugin.dataFilter.configureDatePeriod'
