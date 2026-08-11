/** @jsxImportSource solid-js */

import { createEffect, onCleanup, type Accessor } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { formatPainterStateAtom } from '@einfach/spreadsheet-ui-core'

export interface SpreadsheetGridFormatPainterCursorProps {
  readonly gridRoot: Accessor<HTMLDivElement | undefined>
}

/** Mirrors format-painter Atom state onto one grid's cursor surface. */
export function SpreadsheetGridFormatPainterCursor(props: SpreadsheetGridFormatPainterCursorProps) {
  const painterState = useAtomValue(formatPainterStateAtom)

  createEffect(() => {
    const gridRoot = props.gridRoot()
    const state = painterState()
    if (!gridRoot) return

    if (state === 'idle') gridRoot.removeAttribute('data-format-painter-active')
    else gridRoot.setAttribute('data-format-painter-active', state)

    onCleanup(() => gridRoot.removeAttribute('data-format-painter-active'))
  })

  return null
}
