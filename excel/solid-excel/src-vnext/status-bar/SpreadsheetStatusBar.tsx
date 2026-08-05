import { useAtomValue, useSetAtom } from '@einfach/solid'
import { createMemo, For } from 'solid-js'
import {
  clipboardIntentAtom,
  keyboardModeAtom,
  menuCommandIntentAtom,
  resetZoomLevelAtom,
  selectionAggregatesAtom,
  selectionSnapshotAtom,
  setViewModeAtom,
  setZoomLevelAtom,
  statusBarAggregateConfigAtom,
  toggleStatusBarAggregateAtom,
  toolbarIntentAtom,
  viewModeAtom,
  visibleWindowAtom,
  ZOOM_LEVEL_MAX,
  ZOOM_LEVEL_MIN,
  ZOOM_LEVEL_PRESETS,
  zoomLevelAtom,
  type StatusBarAggregateConfig,
  type StatusBarAggregateKey,
  type StatusBarInputMode,
  type StatusBarViewMode,
} from '@einfach/spreadsheet-ui-core'

import { spreadsheetProjectionSnapshotAtom } from '../provider'
import { useT } from '../../src/i18n'
import {
  AGGREGATE_LABEL_KEYS,
  AGGREGATE_ORDER,
  INPUT_MODE_LABEL_KEY,
  KEYBOARD_MODE_TO_BADGE,
  VIEW_MODE_BUTTONS,
  formatAggregateValue,
  formatClipboardIntent,
  formatLoadedValues,
  formatMenuIntent,
  formatProjectionStatus,
  formatRange,
  formatToolbarIntent,
  formatVisibleWindow,
  toA1,
} from './status-bar-format'

export type SpreadsheetStatusBarSection =
  | 'cell-address'
  | 'selection'
  | 'projection'
  | 'visible-cells'
  | 'loaded-values'
  | 'last-command'
  | 'aggregates'
  | 'view-modes'
  | 'zoom'
  | 'mode-badge'

/** 全量段清单，含投影诊断段（projection / visible-cells / loaded-values）。
 * 诊断段的文字随每轮投影变化，宽度一变整条 flex 布局跟着挤，滚动时状态栏
 * 会持续抖动 —— 所以它们不进默认清单，只给诊断/测试宿主显式开启。 */
export const SPREADSHEET_STATUS_BAR_ALL_SECTIONS: readonly SpreadsheetStatusBarSection[] = [
  'cell-address',
  'selection',
  'projection',
  'visible-cells',
  'loaded-values',
  'last-command',
  'aggregates',
  'view-modes',
  'zoom',
  'mode-badge',
]

const DEFAULT_SECTIONS: readonly SpreadsheetStatusBarSection[] = [
  'cell-address',
  'selection',
  'last-command',
  'aggregates',
  'view-modes',
  'zoom',
  'mode-badge',
]

export interface SpreadsheetStatusBarProps {
  class?: string
  'data-testid'?: string
  sections?: readonly SpreadsheetStatusBarSection[]
  orientation?: 'horizontal' | 'vertical'
}

export function SpreadsheetStatusBar(props: SpreadsheetStatusBarProps) {
  const t = useT()
  const selectionSnapshot = useAtomValue(selectionSnapshotAtom)
  const projectionSnapshot = useAtomValue(spreadsheetProjectionSnapshotAtom)
  const visibleWindow = useAtomValue(visibleWindowAtom)
  const toolbarIntent = useAtomValue(toolbarIntentAtom)
  const menuCommandIntent = useAtomValue(menuCommandIntentAtom)
  const clipboardIntent = useAtomValue(clipboardIntentAtom)
  const aggregates = useAtomValue(selectionAggregatesAtom)
  const aggregateConfig = useAtomValue(statusBarAggregateConfigAtom)
  const zoomLevel = useAtomValue(zoomLevelAtom)
  const viewMode = useAtomValue(viewModeAtom)
  const keyboardMode = useAtomValue(keyboardModeAtom)

  const toggleAggregate = useSetAtom(toggleStatusBarAggregateAtom)
  const setZoom = useSetAtom(setZoomLevelAtom)
  const resetZoom = useSetAtom(resetZoomLevelAtom)
  const setViewMode = useSetAtom(setViewModeAtom)

  const activeAddress = createMemo(() => toA1(selectionSnapshot().activeCell))
  const selectionText = createMemo(() =>
    formatRange(selectionSnapshot().selection, selectionSnapshot().range, t),
  )
  const projectionText = createMemo(() => formatProjectionStatus(projectionSnapshot(), t))
  const visibleCellsText = createMemo(() =>
    formatVisibleWindow(projectionSnapshot(), visibleWindow(), t),
  )
  const loadedValuesText = createMemo(() => formatLoadedValues(projectionSnapshot(), t))
  const commandText = createMemo(
    () =>
      formatClipboardIntent(clipboardIntent(), t) ??
      formatMenuIntent(menuCommandIntent(), t) ??
      formatToolbarIntent(toolbarIntent(), t) ??
      t('status.lastCommand.ready'),
  )

  const inputMode = createMemo<StatusBarInputMode>(() => KEYBOARD_MODE_TO_BADGE[keyboardMode()])

  const zoomPercent = createMemo(() => Math.round(zoomLevel() * 100))
  const zoomSliderValue = createMemo(() => zoomPercent())

  const visibleAggregates = createMemo(() => {
    const config = aggregateConfig()
    return AGGREGATE_ORDER.filter((key) => config[key])
  })

  const aggregateValue = (key: StatusBarAggregateKey): number => {
    const a = aggregates()
    switch (key) {
      case 'sum':
        return a.sum
      case 'average':
        return a.average
      case 'count':
        return a.count
      case 'numericCount':
        return a.numericCount
      case 'min':
        return a.min
      case 'max':
        return a.max
      default:
        return 0
    }
  }

  const aggregateSummaryText = createMemo(() => {
    const values = visibleAggregates().map(
      (key) => `${t(AGGREGATE_LABEL_KEYS[key])} ${formatAggregateValue(key, aggregateValue(key))}`,
    )
    const summary =
      values.length === 0
        ? t('status.aggregate.summaryEmpty')
        : t('status.aggregate.summary', { values: values.join(', ') })

    return aggregates().truncated ? t('status.aggregate.summaryTruncated', { summary }) : summary
  })

  const handleSliderInput = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement
    const value = Number(target.value)
    if (Number.isFinite(value)) {
      setZoom(value / 100)
    }
  }

  const sections = createMemo<readonly SpreadsheetStatusBarSection[]>(
    () => props.sections ?? DEFAULT_SECTIONS,
  )
  const showSection = (section: SpreadsheetStatusBarSection) => sections().includes(section)
  const orientation = createMemo(() => props.orientation ?? 'horizontal')

  return (
    <div
      class={`spreadsheet-status-bar spreadsheet-status-bar--${orientation()} ${props.class ?? ''}`.trim()}
      data-testid={props['data-testid'] ?? 'spreadsheet-status-bar'}
      data-orientation={orientation()}
    >
      {showSection('cell-address') ? (
        <span class="spreadsheet-status-bar-item" data-testid="status-active-cell">
          {activeAddress()}
        </span>
      ) : null}
      {showSection('selection') ? (
        <span class="spreadsheet-status-bar-item" data-testid="status-selection">
          {selectionText()}
        </span>
      ) : null}
      {showSection('projection') ? (
        <span
          class="spreadsheet-status-bar-item"
          data-testid="status-projection"
          aria-label={t('status.projection.label')}
        >
          {projectionText()}
        </span>
      ) : null}
      {showSection('visible-cells') ? (
        <span class="spreadsheet-status-bar-item" data-testid="status-visible-cells">
          {visibleCellsText()}
        </span>
      ) : null}
      {showSection('loaded-values') ? (
        <span class="spreadsheet-status-bar-item" data-testid="status-loaded-values">
          {loadedValuesText()}
        </span>
      ) : null}
      {showSection('last-command') ? (
        <span class="spreadsheet-status-bar-item" data-testid="status-last-command">
          {commandText()}
        </span>
      ) : null}

      {showSection('aggregates') ? (
        <>
          <span
            class="spreadsheet-status-bar-aggregates"
            data-testid="status-aggregates"
            data-truncated={aggregates().truncated ? 'true' : 'false'}
            role="group"
            aria-label={t('status.aggregate.groupLabel')}
          >
            <For each={AGGREGATE_ORDER}>
              {(key) => {
                const enabled = () => Boolean(aggregateConfig()[key])
                return (
                  <button
                    type="button"
                    class="spreadsheet-status-bar-aggregate"
                    data-testid={`status-aggregate-${key}`}
                    data-enabled={enabled() ? 'true' : 'false'}
                    aria-label={t('status.aggregate.toggleLabel', {
                      aggregate: t(AGGREGATE_LABEL_KEYS[key]),
                    })}
                    aria-pressed={enabled()}
                    onClick={() => toggleAggregate(key)}
                  >
                    <span class="spreadsheet-status-bar-aggregate-label">
                      {t(AGGREGATE_LABEL_KEYS[key])}
                    </span>
                    {enabled() ? (
                      <span
                        class="spreadsheet-status-bar-aggregate-value"
                        data-testid={`status-aggregate-${key}-value`}
                      >
                        {formatAggregateValue(key, aggregateValue(key))}
                      </span>
                    ) : null}
                  </button>
                )
              }}
            </For>
            {visibleAggregates().length === 0 ? (
              <span
                class="spreadsheet-status-bar-aggregate-empty"
                data-testid="status-aggregates-empty"
              >
                {t('status.aggregate.empty')}
              </span>
            ) : null}
            {aggregates().truncated ? (
              <span
                class="spreadsheet-status-bar-aggregate-truncated"
                data-testid="status-aggregates-truncated"
              >
                {t('status.aggregate.truncated')}
              </span>
            ) : null}
          </span>
          <span
            class="spreadsheet-status-bar-aggregate-summary"
            data-testid="status-aggregates-summary"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {aggregateSummaryText()}
          </span>
        </>
      ) : null}

      {showSection('view-modes') ? (
        <span class="spreadsheet-status-bar-view-modes" data-testid="status-view-modes">
          <For each={VIEW_MODE_BUTTONS}>
            {(item) => (
              <button
                type="button"
                class="spreadsheet-status-bar-view-mode"
                data-testid={`status-view-mode-${item.value}`}
                data-active={viewMode() === item.value ? 'true' : 'false'}
                aria-label={t(item.label)}
                aria-pressed={viewMode() === item.value}
                onClick={() => setViewMode(item.value)}
              >
                {t(item.label)}
              </button>
            )}
          </For>
        </span>
      ) : null}

      {showSection('zoom') ? (
        <span class="spreadsheet-status-bar-zoom" data-testid="status-zoom">
          <For each={ZOOM_LEVEL_PRESETS}>
            {(preset) => (
              <button
                type="button"
                class="spreadsheet-status-bar-zoom-preset"
                data-testid={`status-zoom-preset-${Math.round(preset * 100)}`}
                data-active={zoomLevel() === preset ? 'true' : 'false'}
                aria-label={t('status.zoom.presetLabel', {
                  percent: Math.round(preset * 100),
                })}
                aria-pressed={zoomLevel() === preset}
                onClick={() => setZoom(preset)}
              >
                {Math.round(preset * 100)}%
              </button>
            )}
          </For>
          <input
            type="range"
            class="spreadsheet-status-bar-zoom-slider"
            data-testid="status-zoom-slider"
            min={Math.round(ZOOM_LEVEL_MIN * 100)}
            max={Math.round(ZOOM_LEVEL_MAX * 100)}
            step="1"
            value={zoomSliderValue()}
            aria-label={t('status.zoom.sliderLabel')}
            onInput={handleSliderInput}
          />
          <button
            type="button"
            class="spreadsheet-status-bar-zoom-value"
            data-testid="status-zoom-value"
            aria-label={t('status.zoom.resetLabel')}
            aria-pressed={zoomLevel() === 1}
            onClick={() => resetZoom()}
          >
            {zoomPercent()}%
          </button>
        </span>
      ) : null}

      {showSection('mode-badge') ? (
        <span
          class="spreadsheet-status-bar-mode-badge"
          data-testid="status-mode-badge"
          data-mode={inputMode()}
        >
          {t(INPUT_MODE_LABEL_KEY[inputMode()])}
        </span>
      ) : null}
    </div>
  )
}

export type {
  StatusBarAggregateConfig,
  StatusBarAggregateKey,
  StatusBarInputMode,
  StatusBarViewMode,
}
