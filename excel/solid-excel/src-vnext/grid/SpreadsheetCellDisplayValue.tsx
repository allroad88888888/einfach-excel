import { For, Show } from 'solid-js'
import {
  getRichValueText,
  type DisplayCell,
  type DisplayCellRichValue,
} from '@einfach/spreadsheet-ui-core'
import { getRichRunStyle } from './cell-format'

function getSafeHyperlinkHref(url: string): string | undefined {
  const href = url.trim()
  if (!href) return undefined
  const scheme = href.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase()
  return !scheme || scheme === 'http' || scheme === 'https' || scheme === 'mailto'
    ? href
    : undefined
}

export function SpreadsheetCellDisplayValue(props: { cell: DisplayCell | undefined }) {
  const richValue = () => props.cell?.richValue
  return (
    <Show when={richValue()} fallback={props.cell?.displayValue ?? ''}>
      {(value) => {
        const rich = value() as DisplayCellRichValue
        if (rich.kind === 'hyperlink') {
          const href = getSafeHyperlinkHref(rich.url)
          if (!href)
            return (
              <span class="cell-rich-link" data-rich-url={rich.url}>
                {rich.label}
              </span>
            )
          return (
            <a
              class="cell-rich-link"
              data-rich-url={rich.url}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onDblClick={(event) => event.stopPropagation()}
            >
              {rich.label}
            </a>
          )
        }
        if (rich.kind === 'rich-text')
          return (
            <span class="cell-rich-text">
              <For each={rich.runs}>
                {(run) => <span style={getRichRunStyle(run.format)}>{run.text}</span>}
              </For>
            </span>
          )
        return getRichValueText(rich)
      }}
    </Show>
  )
}
