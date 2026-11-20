import { atom } from '@einfach/core'
import {
  configureNativeFilterAtom, nativeFilterPanelAtom, type ColumnFilterRule,
} from '@einfach-excel/spreadsheet-ui-core'

type TopRule = Extract<ColumnFilterRule, { kind: 'top' }>
type Action = { readonly index: number } & (
  | { readonly type: 'activate' }
  | { readonly type: 'direction'; readonly value: TopRule['direction'] }
  | { readonly type: 'unit'; readonly value: TopRule['unit'] }
  | { readonly type: 'amount'; readonly value: string }
)

/** Edit a typed leaf in the shared dialog draft; never compute ranks in JavaScript. */
export const configureTopFilterAtom = atom(null, (get, set, action: Action) => {
  if (!Number.isSafeInteger(action.index) || action.index < 0) return false
  const condition = get(nativeFilterPanelAtom).conditions[action.index]
  if (!condition) return false
  const previous = condition.nativeRule
  const rule: TopRule | null = action.type === 'activate'
    ? { kind: 'top', colIndex: condition.col, direction: 'top', unit: 'items', value: 10 }
    : condition.kind === 'top' && previous?.kind === 'top' ? previous : null
  if (!rule) return false
  const next = action.type === 'direction' ? { ...rule, direction: action.value }
    : action.type === 'unit' ? { ...rule, unit: action.value }
    : action.type === 'amount' ? { ...rule, value: action.value.trim() ? Number(action.value) : NaN }
    : rule
  return set(configureNativeFilterAtom, {
    type: 'change', index: action.index, patch: { kind: 'top', nativeRule: next },
  })
})
configureTopFilterAtom.debugLabel = 'plugin.dataFilter.configureTop'
