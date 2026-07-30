/**
 * Full Excel-style chrome around a spreadsheet grid: menu bar, toolbar,
 * name box + formula bar, sheet tabs, status bar, context menu, format
 * painter, formula autocomplete, and every dialog/overlay (via
 * `ChromeDialogs`). Composition mirrors `VNextWave5Demo.tsx` — a
 * `SpreadsheetUiProvider` wrapping the chrome
 * pieces, with the grid itself supplied by the caller as `children` (a demo
 * page mounts its own `SpreadsheetGrid` with its own `sheetId`/`viewport`).
 */
import type { JSX } from 'solid-js'
import { Show } from 'solid-js'
import type { FormulaFunctionSuggestion } from '@einfach/spreadsheet-ui-core'
import type { SpreadsheetUiProviderProps } from '@einfach/solid-excel/vnext'
import {
  acceptFormulaSuggestion,
  SpreadsheetContextMenu,
  SpreadsheetFormatPainter,
  SpreadsheetFormulaAutocomplete,
  SpreadsheetFormulaBar,
  SpreadsheetMenuBar,
  SpreadsheetSheetTabs,
  SpreadsheetStatusBar,
  SpreadsheetToolbar,
  SpreadsheetUiProvider,
  useSpreadsheetUiStore,
} from '@einfach/solid-excel/vnext'
import type { ChromeConfig } from './chrome-types'
import ChromeDialogs from './ChromeDialogs'

const DEFAULT_CHROME: Required<ChromeConfig> = {
  menuBar: false,
  toolbar: true,
  formulaBarRow: true,
  statusBar: true,
  sheetTabs: true,
  contextMenu: true,
  formatPainter: false,
  formulaAutocomplete: true,
}

function resolveChromeConfig(chrome?: ChromeConfig): Required<ChromeConfig> {
  return { ...DEFAULT_CHROME, ...chrome }
}

export interface SpreadsheetChromeProps {
  backend: SpreadsheetUiProviderProps['backend']
  /**
   * Explicit named-range capability port (see
   * `createStaticNamedRangeCapabilityPort` / `createWorkerNamedRangeCapabilityPort`
   * in `@einfach/solid-excel/vnext`). Named ranges are capability-gated in
   * ui-core: without this port, `loadNamedRangeCapabilitiesAtom` never
   * resolves and the registry read never fires, so the name box dropdown and
   * Name Manager stay empty even when the backend already holds names.
   * Optional and forwarded as-is — omit it for demos that do not need the
   * named-range feature.
   */
  namedRangeCapabilityPort?: SpreadsheetUiProviderProps['namedRangeCapabilityPort']
  chrome?: ChromeConfig
  children?: JSX.Element
}

function ChromeBody(props: { chrome: Required<ChromeConfig>; children?: JSX.Element }) {
  const store = useSpreadsheetUiStore()

  // Mirrors the identical onAccept wiring in showcase/App.tsx and every
  // vnext demo: the autocomplete overlay only computes the splice + caret
  // position, the host applies it and restores focus.
  function handleAcceptSuggestion(suggestion: FormulaFunctionSuggestion) {
    const { caret } = acceptFormulaSuggestion(store, suggestion)
    queueMicrotask(() => {
      const element = document.activeElement
      if (
        element instanceof HTMLInputElement &&
        (element.classList.contains('cell-input') ||
          element.classList.contains('formula-bar-input'))
      ) {
        element.focus()
        element.setSelectionRange(caret, caret)
      }
    })
  }

  return (
    <div class="vnext-demo spreadsheet-chrome">
      <Show when={props.chrome.menuBar}>
        <SpreadsheetMenuBar />
      </Show>
      <Show when={props.chrome.toolbar}>
        <SpreadsheetToolbar />
      </Show>
      <Show when={props.chrome.formulaBarRow}>
        <SpreadsheetFormulaBar />
      </Show>

      <div class="spreadsheet-chrome-body">{props.children}</div>

      <div class="vnext-demo-bottom-row">
        <Show when={props.chrome.sheetTabs}>
          {/* Seed list stays empty on purpose: `SpreadsheetSheetTabs` seeds
              once from this prop, then immediately supersedes it with the
              authoritative list from `backend.listSheets()`. */}
          <SpreadsheetSheetTabs sheets={[]} />
        </Show>
        <Show when={props.chrome.statusBar}>
          <SpreadsheetStatusBar />
        </Show>
      </div>

      <Show when={props.chrome.contextMenu}>
        <SpreadsheetContextMenu />
      </Show>
      <Show when={props.chrome.formatPainter}>
        <SpreadsheetFormatPainter />
      </Show>
      <Show when={props.chrome.formulaAutocomplete}>
        <SpreadsheetFormulaAutocomplete onAccept={handleAcceptSuggestion} />
      </Show>

      <ChromeDialogs />
    </div>
  )
}

export default function SpreadsheetChrome(props: SpreadsheetChromeProps) {
  const chrome = resolveChromeConfig(props.chrome)

  return (
    <SpreadsheetUiProvider
      backend={props.backend}
      namedRangeCapabilityPort={props.namedRangeCapabilityPort}
    >
      <ChromeBody chrome={chrome}>{props.children}</ChromeBody>
    </SpreadsheetUiProvider>
  )
}
