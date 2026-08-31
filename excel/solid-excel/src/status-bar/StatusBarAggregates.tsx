/**
 * 状态栏聚合读数：**只渲染用户勾上的项**。
 *
 * 从前六项恒定渲染，没勾上的三项只剩标签占位；现在没勾上的完全不出现，选择入口移到
 * 右键菜单（`StatusBarAggregateMenu`）。
 *
 * `status-aggregates-summary` 是屏读专用的一句话汇总（视觉上被 CSS 裁到 1px）：聚合值
 * 逐项分散在若干 span 里，读屏逐个读出来是「求和 0 平均 0 计数 1」这种碎片；这里用一个
 * `aria-live="polite"` 的整句代替，选区一变就整句重播一次。
 */
import { useAtomValue } from '@einfach/solid'
import { createMemo, For, Show } from 'solid-js'
import {
  selectionAggregatesAtom,
  statusBarAggregateConfigAtom,
  type SelectionAggregates,
  type StatusBarAggregateKey,
} from '@einfach/spreadsheet-ui-core'

import { useT } from '../i18n'
import { AGGREGATE_LABEL_KEYS, AGGREGATE_ORDER, formatAggregateValue } from './status-bar-format'

function readAggregate(aggregates: SelectionAggregates, key: StatusBarAggregateKey): number {
  switch (key) {
    case 'sum':
      return aggregates.sum
    case 'average':
      return aggregates.average
    case 'count':
      return aggregates.count
    case 'numericCount':
      return aggregates.numericCount
    case 'min':
      return aggregates.min
    case 'max':
      return aggregates.max
    default:
      return 0
  }
}

export interface StatusBarAggregatesProps {
  /** 右键状态栏聚合区时打开勾选菜单。 */
  onRequestPicker: (event: MouseEvent) => void
}

export function StatusBarAggregates(props: StatusBarAggregatesProps) {
  const t = useT()
  const aggregates = useAtomValue(selectionAggregatesAtom)
  const config = useAtomValue(statusBarAggregateConfigAtom)

  const visibleKeys = createMemo(() => AGGREGATE_ORDER.filter((key) => config()[key]))

  const summaryText = createMemo(() => {
    const values = visibleKeys().map(
      (key) =>
        `${t(AGGREGATE_LABEL_KEYS[key])} ${formatAggregateValue(key, readAggregate(aggregates(), key))}`,
    )
    const summary =
      values.length === 0
        ? t('status.aggregate.summaryEmpty')
        : t('status.aggregate.summary', { values: values.join(', ') })

    return aggregates().truncated ? t('status.aggregate.summaryTruncated', { summary }) : summary
  })

  return (
    <>
      <span
        class="spreadsheet-status-bar-aggregates"
        data-testid="status-aggregates"
        data-truncated={aggregates().truncated ? 'true' : 'false'}
        role="group"
        aria-label={t('status.aggregate.groupLabel')}
        title={t('status.aggregate.pickerHint')}
        onContextMenu={props.onRequestPicker}
      >
        <For each={visibleKeys()}>
          {(key) => (
            <span class="spreadsheet-status-bar-aggregate" data-testid={`status-aggregate-${key}`}>
              <span class="spreadsheet-status-bar-aggregate-label">
                {t(AGGREGATE_LABEL_KEYS[key])}
              </span>
              <span
                class="spreadsheet-status-bar-aggregate-value"
                data-testid={`status-aggregate-${key}-value`}
              >
                {formatAggregateValue(key, readAggregate(aggregates(), key))}
              </span>
            </span>
          )}
        </For>
        <Show when={visibleKeys().length === 0}>
          <span class="spreadsheet-status-bar-aggregate-empty" data-testid="status-aggregates-empty">
            {t('status.aggregate.empty')}
          </span>
        </Show>
        <Show when={aggregates().truncated}>
          <span
            class="spreadsheet-status-bar-aggregate-truncated"
            data-testid="status-aggregates-truncated"
          >
            {t('status.aggregate.truncated')}
          </span>
        </Show>
      </span>
      <span
        class="spreadsheet-status-bar-aggregate-summary"
        data-testid="status-aggregates-summary"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {summaryText()}
      </span>
    </>
  )
}
