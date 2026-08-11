import { createEffect, Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { useT } from '../../src/i18n'
import {
  DEFAULT_PRINT_CONFIG,
  hydratePrintConfigAtom,
  openPageSetupAtom,
  pageSetupDialogOpenAtom,
  printConfigStateAtom,
  printPreviewOpenAtom,
  workspaceSessionAtom,
  type PrintConfig,
} from '@einfach/spreadsheet-ui-core'

import { useOverlayInteraction } from '../overlay'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'
import { SpreadsheetPageSetupDialog } from './SpreadsheetPageSetupDialog'

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
  let closeButtonRef: HTMLButtonElement | undefined
  let pageSetupButtonRef: HTMLButtonElement | undefined
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const previewOpen = useAtomValue(printPreviewOpenAtom)
  const pageSetupOpen = useAtomValue(pageSetupDialogOpenAtom)
  const printConfigState = useAtomValue(printConfigStateAtom)
  const workspaceSession = useAtomValue(workspaceSessionAtom)

  const activeSheetId = () => workspaceSession().activeSheetId ?? ''

  const config = (): PrintConfig =>
    (activeSheetId() ? printConfigState()[activeSheetId()] : undefined) ?? DEFAULT_PRINT_CONFIG

  createEffect(() => {
    const sheetId = activeSheetId()
    if (!previewOpen() || sheetId.length === 0) return
    void store.setter(hydratePrintConfigAtom, { source: backend, sheetId })
  })

  function closePreview() {
    store.setter(printPreviewOpenAtom, false)
  }

  function openPageSetup() {
    const sheetId = activeSheetId()
    if (sheetId.length === 0) return
    store.setter(openPageSetupAtom, { sheetId })
  }

  function printPreview() {
    if (typeof window === 'undefined' || typeof window.print !== 'function') return
    window.print()
  }

  const overlay = useOverlayInteraction({
    active: previewOpen,
    initialFocus: () => closeButtonRef,
    isTopmost: () => !pageSetupOpen(),
    onRequestClose: closePreview,
  })

  return (
    <>
      <Show when={previewOpen()}>
        <div
          ref={overlay.overlayRef}
          class={`print-preview-overlay spreadsheet-print-preview ${props.class ?? ''}`.trim()}
          data-testid={props['data-testid'] ?? 'print-preview-overlay'}
          data-sheet-id={activeSheetId()}
          role="dialog"
          aria-hidden={pageSetupOpen() ? 'true' : undefined}
          aria-label={t('toolbar.printPreview.title')}
          aria-modal={pageSetupOpen() ? undefined : 'true'}
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
            ref={pageSetupButtonRef}
            type="button"
            class="print-btn"
            data-testid="print-page-setup-button"
            onClick={openPageSetup}
          >
            Page setup
          </button>
        </div>
      </Show>
      <SpreadsheetPageSetupDialog anchor={() => pageSetupButtonRef} />
    </>
  )
}
