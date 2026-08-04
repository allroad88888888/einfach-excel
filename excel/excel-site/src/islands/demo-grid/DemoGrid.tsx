import type { JSX } from 'solid-js'
import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  selectCellAtom,
  selectionAtom,
  workspaceSessionAtom,
  type ViewportMetrics,
} from '@einfach/spreadsheet-ui-core'
import type { SpreadsheetUiProviderProps } from '@einfach/solid-excel/vnext'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'

interface DemoGridProps {
  backend: SpreadsheetUiProviderProps['backend']
  rows: number
  columns: number
  children?: JSX.Element
}

/**
 * Mounts the only responsive viewport used by every demo's real spreadsheet.
 */
export default function DemoGrid(props: DemoGridProps) {
  const [frame, setFrame] = createSignal<HTMLDivElement>()
  const [size, setSize] = createSignal({ height: 420, width: 860 })

  onMount(() => {
    const element = frame()
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        height: Math.max(320, Math.floor(entry.contentRect.height)),
        width: Math.max(480, Math.floor(entry.contentRect.width)),
      })
    })
    observer.observe(element)
    onCleanup(() => observer.disconnect())
  })

  const viewport = (): ViewportMetrics => ({
    scrollTop: 0,
    scrollLeft: 0,
    viewportHeight: size().height,
    viewportWidth: size().width,
    rowHeight: 24,
    colWidth: 128,
    rowCount: props.rows,
    colCount: props.columns,
    overscanRows: 4,
    overscanCols: 2,
  })

  return (
    <div class="demo-grid-frame" ref={setFrame}>
      <SpreadsheetChrome backend={props.backend}>
        <GridBody viewport={viewport}>{props.children}</GridBody>
      </SpreadsheetChrome>
    </div>
  )
}

function GridBody(props: { viewport: () => ViewportMetrics; children?: JSX.Element }) {
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const activeSheetId = () => workspace().activeSheetId

  createEffect(() => {
    const sheetId = activeSheetId()
    if (!sheetId || store.getter(selectionAtom).sheetId) return
    store.setter(selectCellAtom, { sheetId, coord: { row: 0, col: 0 } })
  })

  return (
    <Show keyed when={activeSheetId()}>
      {(sheetId) => <>
        {props.children}
        <SpreadsheetGrid sheetId={sheetId} viewport={props.viewport()} />
      </>}
    </Show>
  )
}
