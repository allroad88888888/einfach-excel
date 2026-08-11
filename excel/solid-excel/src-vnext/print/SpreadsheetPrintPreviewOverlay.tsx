import { Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { useT } from '../../src/i18n'
import {
  DEFAULT_PRINT_CONFIG,
  pageSetupDialogOpenAtom,
  printConfigStateAtom,
  printPreviewOpenAtom,
  workspaceSessionAtom,
  type PrintConfig,
} from '@einfach/spreadsheet-ui-core'

import { useSpreadsheetUiStore } from '../provider'
import { usePrintPreviewFocus } from './print-preview-focus'

export interface SpreadsheetPrintPreviewOverlayProps {
  class?: string
  'data-testid'?: string
}

function scaleText(config: PrintConfig): string {
  const scale = config.scale
  if (scale.kind === 'percent') return `${scale.percent}%`
  const parts: string[] = []
  if (scale.pagesWide != null) parts.push(`${scale.pagesWide}W`)
  if (scale.pagesTall != null) parts.push(`${scale.pagesTall}T`)
  return parts.length > 0 ? `fit ${parts.join(' x ')}` : 'fit'
}

export function SpreadsheetPrintPreviewOverlay(props: SpreadsheetPrintPreviewOverlayProps) {
  let previewRef: HTMLDivElement | undefined
  let closeButtonRef: HTMLButtonElement | undefined
  const t = useT()
  const store = useSpreadsheetUiStore()
  const previewOpen = useAtomValue(printPreviewOpenAtom)
  const printConfigState = useAtomValue(printConfigStateAtom)
  const workspaceSession = useAtomValue(workspaceSessionAtom)

  const activeSheetId = () => workspaceSession().activeSheetId ?? ''

  const config = (): PrintConfig =>
    (activeSheetId() ? printConfigState()[activeSheetId()] : undefined) ?? DEFAULT_PRINT_CONFIG

  function closePreview() {
    store.setter(printPreviewOpenAtom, false)
  }

  function openPageSetup() {
    store.setter(pageSetupDialogOpenAtom, true)
  }

  function printPreview() {
    if (typeof window === 'undefined' || typeof window.print !== 'function') return
    window.print()
  }

  usePrintPreviewFocus({
    close: closePreview,
    initialFocus: () => closeButtonRef,
    isOpen: previewOpen,
    root: () => previewRef,
  })

  return (
    <Show when={previewOpen()}>
      <div
        ref={previewRef}
        class={`print-preview-overlay spreadsheet-print-preview ${props.class ?? ''}`.trim()}
        data-testid={props['data-testid'] ?? 'print-preview-overlay'}
        data-sheet-id={activeSheetId()}
        role="dialog"
        aria-label={t('toolbar.printPreview.title')}
        aria-modal="true"
      >
        <button
          ref={closeButtonRef}
          type="button"
          class="dialog-close-x"
          data-testid="dialog-close-x"
          aria-label={t('dialog.close.label')}
          onClick={() => closePreview()}
        >
          ×
        </button>
        <div class="print-preview-orientation" data-testid="print-orientation-text">
          {config().orientation}
        </div>
        <div class="print-preview-scale" data-testid="print-scale-text">
          {scaleText(config())}
        </div>
        <div class="print-preview-page-breaks" data-testid="print-page-breaks-count">
          {config().manualPageBreaks.length}
        </div>
        <Show when={config().header}>
          <div class="print-preview-header">
            <span class="print-header-left">{config().header?.left ?? ''}</span>
            <span class="print-header-center">{config().header?.center ?? ''}</span>
            <span class="print-header-right">{config().header?.right ?? ''}</span>
          </div>
        </Show>
        <Show when={config().footer}>
          <div class="print-preview-footer">
            <span class="print-footer-left">{config().footer?.left ?? ''}</span>
            <span class="print-footer-center">{config().footer?.center ?? ''}</span>
            <span class="print-footer-right">{config().footer?.right ?? ''}</span>
          </div>
        </Show>
        <button
          type="button"
          class="print-btn"
          data-testid="print-action-button"
          onClick={printPreview}
        >
          Print
        </button>
        <button
          type="button"
          class="print-btn"
          data-testid="print-close-button"
          onClick={() => closePreview()}
        >
          Close preview
        </button>
        <button
          type="button"
          class="print-btn"
          data-testid="print-page-setup-button"
          onClick={() => openPageSetup()}
        >
          Page setup
        </button>
      </div>
    </Show>
  )
}
