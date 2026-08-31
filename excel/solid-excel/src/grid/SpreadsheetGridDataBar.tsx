// 一句话：在单元格内容下绘制不可交互的 Data Bar 装饰。

import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import { Show } from 'solid-js'
import { getDataBarProjection } from '../adapter/data-bar-projection'

export interface SpreadsheetGridDataBarProps {
  readonly cell: DisplayCell | undefined
}

export function SpreadsheetGridDataBar(props: SpreadsheetGridDataBarProps) {
  const dataBar = () => getDataBarProjection(props.cell)
  return (
    <Show when={dataBar()}>
      {(bar) => (
        <span
          aria-hidden="true"
          class="spreadsheet-grid-data-bar"
          data-ratio={bar().ratio}
          style={{
            width: `${bar().ratio * 100}%`,
            '--data-bar-min-color': bar().minColor,
            '--data-bar-max-color': bar().maxColor,
          }}
        />
      )}
    </Show>
  )
}
