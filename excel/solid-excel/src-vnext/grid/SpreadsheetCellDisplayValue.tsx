import { For, Show } from 'solid-js'
import { getRichValueText, type DisplayCell, type DisplayCellRichValue } from '@einfach/spreadsheet-ui-core'
import { getRichRunStyle } from './cell-format'

export function SpreadsheetCellDisplayValue(props: { cell: DisplayCell | undefined }) {
  const richValue = () => props.cell?.richValue
  return (
    <Show when={richValue()} fallback={props.cell?.displayValue ?? ''}>
      {(value) => {
        const rich = value() as DisplayCellRichValue
        if (rich.kind === 'hyperlink') return <span class="cell-rich-link" data-rich-url={rich.url}>{rich.label}</span>
        if (rich.kind === 'rich-text') return <span class="cell-rich-text"><For each={rich.runs}>{(run) => <span style={getRichRunStyle(run.format)}>{run.text}</span>}</For></span>
        return getRichValueText(rich)
      }}
    </Show>
  )
}
