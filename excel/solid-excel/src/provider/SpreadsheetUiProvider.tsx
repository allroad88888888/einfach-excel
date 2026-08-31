import { createStore } from '@einfach/core'
import { Provider as SolidProvider } from '@einfach/solid'
import {
  clearPresenceAtom,
  createSpreadsheetUi,
  normalizeCustomFillSeriesListWitness,
  setFillSeriesLocaleAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { createEffect, onCleanup } from 'solid-js'
import { useLocale, useLocaleTag, type Locale } from '../i18n'
import {
  beginSpreadsheetWorkbookLifecycleAtom,
  clearSpreadsheetWorkbookLifecycleAtom,
  rejectSpreadsheetWorkbookLifecycleAtom,
  resolveSpreadsheetWorkbookLifecycleAtom,
  spreadsheetWorkbookLifecycleAtom,
} from './atoms'
import { createSpreadsheetBackendHandle } from './backend-handle'
import { captureWorkbookCapabilities } from './capability-capture'
import { attachCustomFormulaReconciliationBridge } from './custom-formula-reconciliation-bridge'
import { attachHiddenRowsRefreshBridge } from './hidden-rows-refresh-bridge'
import { attachNamedRangeFeaturePort } from './named-range-feature-port'
import { attachPresenceSubscriptionBridge } from './presence-subscription-bridge'
import { attachStatusBarProjectionBridge } from './status-bar-projection-bridge'
import { syncWorkbookLocale } from './workbook-locale-bridge'
import { SpreadsheetUiContext } from './context'
import type {
  NamedRangeCapabilityPort,
  SpreadsheetUiCore,
  SpreadsheetUiProviderProps,
} from './types'

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

interface WorkbookBinding {
  dispose(): void
}

interface ReadyableSpreadsheetBackend extends SpreadsheetBackend {
  ready?: () => Promise<unknown> | unknown
}

let nextWorkbookSessionId = 0

function createWorkbookSessionId(): number {
  nextWorkbookSessionId += 1
  return nextWorkbookSessionId
}

function bindWorkbookBackend(
  core: SpreadsheetUiCore,
  backend: SpreadsheetBackend,
  namedRangeCapabilityPort: NamedRangeCapabilityPort | undefined,
): WorkbookBinding {
  const sessionId = createWorkbookSessionId()
  let disposed = false
  const isCurrentSession = (): boolean =>
    !disposed && core.store.getter(spreadsheetWorkbookLifecycleAtom).sessionId === sessionId

  core.store.setter(beginSpreadsheetWorkbookLifecycleAtom, sessionId)
  captureWorkbookCapabilities(core.store, backend)

  const detachNamedRangeFeaturePort = attachNamedRangeFeaturePort(
    core.store,
    backend,
    namedRangeCapabilityPort,
  )
  const detachHiddenRowsRefreshBridge = attachHiddenRowsRefreshBridge(core.store, backend)
  const detachCustomFormulaReconciliationBridge = attachCustomFormulaReconciliationBridge(
    core.store,
    backend,
  )
  let detachPresenceSubscription = attachPresenceSubscriptionBridge(
    core.store,
    backend,
    isCurrentSession,
  )

  const recaptureAfterReady = (refreshPresenceSubscription: boolean): void => {
    if (!core.store.setter(resolveSpreadsheetWorkbookLifecycleAtom, sessionId)) return
    captureWorkbookCapabilities(core.store, backend)
    if (!refreshPresenceSubscription) return
    detachPresenceSubscription()
    detachPresenceSubscription = attachPresenceSubscriptionBridge(
      core.store,
      backend,
      isCurrentSession,
    )
  }

  try {
    const ready = (backend as ReadyableSpreadsheetBackend).ready
    if (typeof ready === 'function') {
      void Promise.resolve()
        .then(() => ready.call(backend))
        .then(() => recaptureAfterReady(true))
        .catch((error: unknown) => {
          core.store.setter(rejectSpreadsheetWorkbookLifecycleAtom, { error, sessionId })
        })
    } else {
      recaptureAfterReady(false)
    }
  } catch (error) {
    core.store.setter(rejectSpreadsheetWorkbookLifecycleAtom, { error, sessionId })
  }

  return {
    dispose() {
      if (disposed) return
      disposed = true
      if (core.store.getter(spreadsheetWorkbookLifecycleAtom).sessionId === sessionId) {
        core.store.setter(clearPresenceAtom)
      }
      detachPresenceSubscription()
      detachNamedRangeFeaturePort()
      detachHiddenRowsRefreshBridge()
      detachCustomFormulaReconciliationBridge()
      core.store.setter(clearSpreadsheetWorkbookLifecycleAtom, sessionId)
    },
  }
}

export function SpreadsheetUiProvider(props: SpreadsheetUiProviderProps) {
  const activeLocale = useLocale()
  const activeLocaleTag = useLocaleTag()
  const backendHandle = createSpreadsheetBackendHandle(props.backend)
  const core = createSpreadsheetUi({
    backend: backendHandle.backend,
    store: props.store ?? createStore(),
  })
  let boundBackend = props.backend
  let boundNamedRangeCapabilityPort = props.namedRangeCapabilityPort
  let workbookBinding = bindWorkbookBackend(core, boundBackend, boundNamedRangeCapabilityPort)

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
  syncWorkbookLocale(core.store, activeLocaleTag())
  createEffect(() => syncFillSeriesLocale(activeLocale()))
  createEffect(() => syncWorkbookLocale(core.store, activeLocaleTag()))

  createEffect(() => {
    const nextBackend = props.backend
    const nextNamedRangeCapabilityPort = props.namedRangeCapabilityPort
    if (
      nextBackend === boundBackend &&
      nextNamedRangeCapabilityPort === boundNamedRangeCapabilityPort
    ) {
      return
    }

    workbookBinding.dispose()
    backendHandle.replace(nextBackend)
    boundBackend = nextBackend
    boundNamedRangeCapabilityPort = nextNamedRangeCapabilityPort
    workbookBinding = bindWorkbookBackend(core, nextBackend, nextNamedRangeCapabilityPort)
  })

  const detachStatusBarProjectionBridge = attachStatusBarProjectionBridge(core.store)
  onCleanup(() => {
    workbookBinding.dispose()
    detachStatusBarProjectionBridge()
  })

  return (
    <SpreadsheetUiContext.Provider value={core}>
      <SolidProvider store={core.store}>{props.children}</SolidProvider>
    </SpreadsheetUiContext.Provider>
  )
}
