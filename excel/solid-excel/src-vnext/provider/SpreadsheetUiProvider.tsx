import { createStore } from '@einfach/core'
import { Provider as SolidProvider } from '@einfach/solid'
import {
  capturePasteSpecialCapabilityAtom,
  captureSpillRegionCapabilityAtom,
  createSpreadsheetUi,
  normalizeCustomFillSeriesListWitness,
  setFillSeriesLocaleAtom,
} from '@einfach/spreadsheet-ui-core'
import { createEffect, onCleanup } from 'solid-js'
import { useLocale, type Locale } from '../../src/i18n'
import { spreadsheetBackendAtom } from './atoms'
import { attachCustomFormulaReconciliationBridge } from './custom-formula-reconciliation-bridge'
import { attachHiddenRowsRefreshBridge } from './hidden-rows-refresh-bridge'
import { attachNamedRangeFeaturePort } from './named-range-feature-port'
import { attachStatusBarProjectionBridge } from './status-bar-projection-bridge'
import type { SpreadsheetUiProviderProps } from './types'

const HOST_FILL_SERIES_NAMES: Readonly<
  Record<
    Locale,
    {
      readonly weekdayNames: readonly string[]
      readonly monthNames: readonly string[]
    }
  >
> = Object.freeze({
  en: Object.freeze({
    weekdayNames: Object.freeze([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]),
    monthNames: Object.freeze([
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]),
  }),
  zh: Object.freeze({
    weekdayNames: Object.freeze([
      '星期一',
      '星期二',
      '星期三',
      '星期四',
      '星期五',
      '星期六',
      '星期日',
    ]),
    monthNames: Object.freeze([
      '一月',
      '二月',
      '三月',
      '四月',
      '五月',
      '六月',
      '七月',
      '八月',
      '九月',
      '十月',
      '十一月',
      '十二月',
    ]),
  }),
})

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Host props are an untrusted workbook boundary. One malformed list must not
 * make the atomic locale command reject the weekday/month update and leave a
 * stale locale behind, so the custom-list set fails closed as a unit.
 */
function normalizeProviderCustomFillSeriesLists(
  value: unknown,
  locale: Locale,
): Record<string, string[]> {
  if (value === undefined) return {}
  if (!isPlainRecord(value)) return {}

  const normalized = Object.create(null) as Record<string, string[]>
  for (const [listName, values] of Object.entries(value)) {
    const witness = normalizeCustomFillSeriesListWitness({
      listName,
      values,
      locale,
    })
    if (witness === null) return {}
    normalized[listName] = [...witness.values]
  }
  return normalized
}

export function SpreadsheetUiProvider(props: SpreadsheetUiProviderProps) {
  const activeLocale = useLocale()
  const core = createSpreadsheetUi({
    backend: props.backend,
    store: props.store ?? createStore(),
  })
  core.store.setter(spreadsheetBackendAtom, props.backend)
  core.store.setter(capturePasteSpecialCapabilityAtom, props.backend)
  // ADR 0006 阶段 3：后端没实现 `readSpillRegion` 时溢出边框整体隐身。
  core.store.setter(captureSpillRegionCapabilityAtom, props.backend)

  // The host locale lives in its dedicated Einfach store. Mirror its
  // workbook-facing fill-series facts into this provider's actual core store
  // so independent providers never share custom-list state.
  const syncFillSeriesLocale = (locale: Locale) => {
    const names = HOST_FILL_SERIES_NAMES[locale]
    core.store.setter(setFillSeriesLocaleAtom, {
      locale,
      weekdayNames: [...names.weekdayNames],
      monthNames: [...names.monthNames],
      customLists: normalizeProviderCustomFillSeriesLists(props.customFillSeriesLists, locale),
    })
  }
  // Child consumers can read the atom while their subtree is being created,
  // before Solid schedules the first effect. Seed it synchronously first.
  syncFillSeriesLocale(activeLocale())
  createEffect(() => syncFillSeriesLocale(activeLocale()))

  // Worker backends resolve their fail-closed runtime capability witness
  // asynchronously (describeCapabilities lands after initWorkbook);
  // ports sampled synchronously above can be pre-witness. Recapture once
  // the backend reports ready so capability atoms hold post-witness
  // truth. Backends without ready() (static, test doubles) skip this.
  const readyableBackend = props.backend as typeof props.backend & {
    ready?: () => Promise<unknown>
  }
  void readyableBackend.ready
    ?.call(props.backend)
    .then(() => {
      core.store.setter(capturePasteSpecialCapabilityAtom, props.backend)
      core.store.setter(captureSpillRegionCapabilityAtom, props.backend)
    })
    .catch(() => {})
  const detachNamedRangeFeaturePort = attachNamedRangeFeaturePort(
    core.store,
    props.backend,
    props.namedRangeCapabilityPort,
  )
  const detachStatusBarProjectionBridge = attachStatusBarProjectionBridge(core.store)
  const detachHiddenRowsRefreshBridge = attachHiddenRowsRefreshBridge(core.store, props.backend)
  const detachCustomFormulaReconciliationBridge = attachCustomFormulaReconciliationBridge(
    core.store,
    props.backend,
  )
  onCleanup(() => {
    detachNamedRangeFeaturePort()
    detachStatusBarProjectionBridge()
    detachHiddenRowsRefreshBridge()
    detachCustomFormulaReconciliationBridge()
  })

  return <SolidProvider store={core.store}>{props.children}</SolidProvider>
}
