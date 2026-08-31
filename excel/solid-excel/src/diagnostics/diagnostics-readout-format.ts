import type {
  CellRange,
  ClipboardIntent,
  MenuCommandIntent,
  ProjectionSnapshot,
  ToolbarIntent,
} from '@einfach/spreadsheet-ui-core'
import type { useT } from '../i18n'

/** Pure text formatting for the diagnostics readout — no Solid, no DOM, no atoms. */

export type DiagnosticsTranslate = ReturnType<typeof useT>

export function countRange(range: CellRange): number {
  if (range.rowEnd < range.rowStart || range.colEnd < range.colStart) {
    return 0
  }

  return (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
}

export function formatProjectionStatus(
  snapshot: ProjectionSnapshot,
  t: DiagnosticsTranslate,
): string {
  switch (snapshot.status) {
    case 'idle':
      return t('status.projection.idle')
    case 'loading':
      return t('status.projection.loading')
    case 'ready':
      return t('status.projection.ready')
    case 'error':
      return snapshot.error?.message ?? t('status.projection.error')
    default:
      return t('status.projection.unknown')
  }
}

export function formatVisibleWindow(
  snapshot: ProjectionSnapshot,
  fallbackWindow: CellRange,
  t: DiagnosticsTranslate,
): string {
  const window =
    snapshot.result?.kind === 'visible-window' ? snapshot.result.window : fallbackWindow
  return t('status.visibleCells', { count: countRange(window) })
}

export function formatLoadedValues(snapshot: ProjectionSnapshot, t: DiagnosticsTranslate): string {
  const loaded = snapshot.result?.cells.length ?? 0
  return t('status.loadedValues', { count: loaded })
}

export function formatToolbarIntent(
  intent: ToolbarIntent | null,
  t: DiagnosticsTranslate,
): string | null {
  if (intent?.type === 'toolbar.format.command') {
    return t('status.lastCommand.toolbar', { command: intent.command })
  }

  if (intent?.type === 'toolbar.surface.open') {
    return t('status.lastCommand.toolbar', { command: intent.surface.id })
  }

  return null
}

export function formatMenuIntent(
  intent: MenuCommandIntent | null,
  t: DiagnosticsTranslate,
): string | null {
  if (!intent) {
    return null
  }

  return t('status.lastCommand.menu', { command: intent.command })
}

export function formatClipboardIntent(
  intent: ClipboardIntent | null,
  t: DiagnosticsTranslate,
): string | null {
  if (!intent) return null
  switch (intent.type) {
    case 'clipboard.copy':
      return t('status.lastCommand.clipboardCopy')
    case 'clipboard.cut':
      return t('status.lastCommand.clipboardCut')
    case 'clipboard.paste':
      return t('status.lastCommand.clipboardPaste')
    default:
      return null
  }
}
