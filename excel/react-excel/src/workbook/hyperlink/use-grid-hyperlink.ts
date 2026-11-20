import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  externalHyperlink,
  hyperlinkPanelAtom,
  internalHyperlink,
  openInternalHyperlinkAtom,
  readCellHyperlinkAtom,
  runHyperlinkAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import type { KeyboardEvent, PointerEvent } from 'react'
import { workbookCellAt } from '../grid/viewport/workbook-grid-hit-test'

/** DOM 适配只打开 Core 当前投影给出的地址，外部打开新标签，内部走工作簿定位命令。 */
export function useGridHyperlink() {
  const panel = useAtomValue(hyperlinkPanelAtom)
  const read = useSetAtom(readCellHyperlinkAtom)
  const openInternal = useSetAtom(openInternalHyperlinkAtom)
  const run = useSetAtom(runHyperlinkAtom)
  return {
    onKeyDown(event: KeyboardEvent<HTMLDivElement>): boolean {
      if (!panel.available || event.nativeEvent.isComposing || event.altKey || event.shiftKey ||
        !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return false
      event.preventDefault()
      void run('open')
      return true
    },
    onPointerDown(event: PointerEvent<HTMLDivElement>): boolean {
      if (event.button !== 0 || event.shiftKey || event.altKey ||
        !(event.metaKey || event.ctrlKey)) return false
      const cell = workbookCellAt(event)
      const raw = cell ? read(cell) ?? undefined : undefined
      const href = externalHyperlink(raw)
      if (href) {
        event.preventDefault()
        window.open(href, '_blank', 'noopener,noreferrer')
        return true
      }
      const internal = internalHyperlink(raw)
      if (internal) {
        event.preventDefault()
        openInternal(internal)
        return true
      }
      return false
    },
  }
}
