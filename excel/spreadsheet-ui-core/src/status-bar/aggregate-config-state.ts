import { atom } from '@einfach/core'
import type { Atom, WritableAtom } from '@einfach/core'
import {
  DEFAULT_STATUS_BAR_AGGREGATE_CONFIG,
  STATUS_BAR_AGGREGATE_KEYS,
  type StatusBarAggregateConfig,
  type StatusBarAggregateKey,
} from './types'

/** Owns which aggregates the user has ticked on. */

function snapshotStatusBarAggregateConfig(
  config: StatusBarAggregateConfig,
): StatusBarAggregateConfig {
  const next: Record<StatusBarAggregateKey, boolean> = {
    ...DEFAULT_STATUS_BAR_AGGREGATE_CONFIG,
  }
  for (const key of STATUS_BAR_AGGREGATE_KEYS) {
    if (typeof config[key] === 'boolean') next[key] = config[key]
  }
  return Object.freeze(next)
}

const statusBarAggregateConfigBackingAtom = atom<StatusBarAggregateConfig>(
  snapshotStatusBarAggregateConfig(DEFAULT_STATUS_BAR_AGGREGATE_CONFIG),
)
statusBarAggregateConfigBackingAtom.debugLabel = 'spreadsheet.statusBar.aggregateConfigBacking'

export const statusBarAggregateConfigAtom: Atom<StatusBarAggregateConfig> = atom((get) =>
  get(statusBarAggregateConfigBackingAtom),
)
statusBarAggregateConfigAtom.debugLabel = 'spreadsheet.statusBar.aggregateConfig'

export const toggleStatusBarAggregateAtom: WritableAtom<
  StatusBarAggregateConfig,
  [StatusBarAggregateKey],
  void
> = atom(
  (get) => get(statusBarAggregateConfigBackingAtom),
  (get, set, key: StatusBarAggregateKey) => {
    const current = get(statusBarAggregateConfigBackingAtom)
    set(
      statusBarAggregateConfigBackingAtom,
      snapshotStatusBarAggregateConfig({ ...current, [key]: !current[key] }),
    )
  },
)
toggleStatusBarAggregateAtom.debugLabel = 'spreadsheet.statusBar.toggleAggregate'

export const setStatusBarAggregateConfigAtom: WritableAtom<
  StatusBarAggregateConfig,
  [StatusBarAggregateConfig],
  void
> = atom(
  (get) => get(statusBarAggregateConfigBackingAtom),
  (_get, set, config: StatusBarAggregateConfig) => {
    set(statusBarAggregateConfigBackingAtom, snapshotStatusBarAggregateConfig(config))
  },
)
setStatusBarAggregateConfigAtom.debugLabel = 'spreadsheet.statusBar.setAggregateConfig'
