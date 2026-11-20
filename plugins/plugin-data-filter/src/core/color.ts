import { atom } from '@einfach/core'
import {
  configureNativeFilterAtom, nativeFilterPanelAtom, validFilterColorSource, type FilterColorSource,
} from '@einfach-excel/spreadsheet-ui-core'

type Action = { readonly index: number } & (
  | { readonly type: 'activate' }
  | { readonly type: 'source'; readonly value: FilterColorSource }
  | { readonly type: 'color'; readonly value: string }
)

/** Update the host's single condition draft; Apply remains a shared command. */
export const configureColorFilterAtom = atom(null, (get, set, action: Action) => {
  if (!Number.isSafeInteger(action.index) || action.index < 0) return false
  const condition = get(nativeFilterPanelAtom).conditions[action.index]
  if (!condition) return false
  const rule = condition.kind === 'color' && condition.nativeRule?.kind === 'color'
    ? condition.nativeRule : undefined
  if (!rule && action.type !== 'activate') return false
  if (action.type === 'source' && !validFilterColorSource(action.value)) return false
  if (action.type === 'color' && (typeof action.value !== 'string' ||
    (action.value.length > 7 && action.value !== 'automatic'))) return false
  const source = action.type === 'source' ? action.value : rule?.source ?? 'fill'
  const color = action.type === 'color' ? action.value.toLowerCase()
    : action.type === 'source' && action.value === rule?.source ? rule?.color ?? 'automatic' : 'automatic'
  return set(configureNativeFilterAtom, {
    type: 'change', index: action.index, patch: {
      kind: 'color', nativeRule: { kind: 'color', colIndex: condition.col, source, color },
    },
  })
})
configureColorFilterAtom.debugLabel = 'plugin.dataFilter.configureColor'
