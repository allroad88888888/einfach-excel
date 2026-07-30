/**
 * Structural toggles for `SpreadsheetChrome` — which chrome pieces around
 * the grid are mounted. Every flag defaults per `SpreadsheetChrome.tsx`
 * (toolbar/formulaBarRow/statusBar/sheetTabs/contextMenu/formulaAutocomplete
 * on; menuBar/formatPainter off). Dialogs/overlays are not gated here — they
 * are always mounted via `ChromeDialogs`.
 */
export type ChromeConfig = {
  menuBar?: boolean
  toolbar?: boolean
  /** Name box + formula bar, rendered together as one row. */
  formulaBarRow?: boolean
  statusBar?: boolean
  sheetTabs?: boolean
  contextMenu?: boolean
  formatPainter?: boolean
  formulaAutocomplete?: boolean
}

/** Which backend a demo/page is wired to; drives the badge in `DemoShell`. */
export type BackendKind = 'static' | 'worker-wasm' | 'worker-ts'
