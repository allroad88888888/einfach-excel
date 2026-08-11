import {
  armFormatPainterAtom,
  armFormatPainterStickyAtom,
  exitFormatPainterAtom,
  type CapturedFormat,
} from '@einfach/spreadsheet-ui-core'
import type { Accessor } from 'solid-js'
import type { ToolbarActionDeps } from './ToolbarActionDeps'

/** Arms the Core format-painter atom; the delay only distinguishes click/double-click. */
export function useToolbarPainterCommands(
  deps: ToolbarActionDeps,
  formatPainterState: Accessor<'idle' | 'armed' | 'sticky'>,
  capturePayload: () => CapturedFormat,
) {
  let clickTimer: ReturnType<typeof setTimeout> | null = null
  function handleFormatPainterClick() {
    if (formatPainterState() !== 'idle') {
      if (clickTimer) clearTimeout(clickTimer)
      clickTimer = null
      deps.store.setter(exitFormatPainterAtom)
      return
    }
    if (clickTimer) return
    clickTimer = setTimeout(() => {
      clickTimer = null
      if (formatPainterState() === 'idle') deps.store.setter(armFormatPainterAtom, capturePayload())
    }, 220)
  }
  function handleFormatPainterDoubleClick() {
    if (clickTimer) clearTimeout(clickTimer)
    clickTimer = null
    deps.store.setter(armFormatPainterStickyAtom, capturePayload())
  }
  return { handleFormatPainterClick, handleFormatPainterDoubleClick }
}
