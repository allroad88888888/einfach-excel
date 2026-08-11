import { Show } from 'solid-js'
import { SpreadsheetNumberFormatDialogs } from '../format-cells'
import { FillColorPopover } from './FillColorPopover'
import { DEFAULT_FONT_FAMILY, FontFamilyDropdown } from './FontFamilyDropdown'
import { DEFAULT_FONT_SIZE, FontSizeDropdown } from './FontSizeDropdown'
import { NumberFormatDropdown } from './NumberFormatDropdown'
import type { ToolbarGroupProps } from './ToolbarGroupProps'

/** Menus and feedback that share the toolbar's Core-owned active surface. */
export function ToolbarOverlays(props: ToolbarGroupProps) {
  const { runtime } = props
  const surface = runtime.surface
  return (
    <>
      <NumberFormatDropdown
        open={surface.isDropdownOpen('number-format')}
        anchorRect={surface.numberFormatAnchor()}
        anchorEl={surface.numberFormatAnchorEl()}
        onSelect={runtime.onNumberFormatPick}
        onCustomSelect={runtime.openCustomNumberFormatDialog}
        onClose={() => surface.closeAnchoredDropdown('number-format')}
      />
      <SpreadsheetNumberFormatDialogs />
      <FontFamilyDropdown
        open={surface.isDropdownOpen('font-family')}
        anchorRect={surface.fontFamilyAnchor()}
        anchorEl={surface.fontFamilyAnchorEl()}
        current={runtime.activeCellFormat().fontFamily ?? DEFAULT_FONT_FAMILY}
        onSelect={runtime.onFontFamilyPick}
        onClose={() => surface.closeAnchoredDropdown('font-family')}
      />
      <FontSizeDropdown
        open={surface.isDropdownOpen('font-size')}
        anchorRect={surface.fontSizeAnchor()}
        anchorEl={surface.fontSizeAnchorEl()}
        current={runtime.activeCellFormat().fontSize ?? DEFAULT_FONT_SIZE}
        onSelect={runtime.onFontSizePick}
        onClose={() => surface.closeAnchoredDropdown('font-size')}
      />
      <FillColorPopover
        open={surface.activeColorMode() !== null}
        mode={surface.activeColorMode()}
        anchorRect={surface.anchorRect}
        onPick={runtime.handleColorPick}
        onRequestClose={surface.closeSurface}
      />
      <Show when={runtime.toolbarMutationLifecycle().error}>
        {(error) => (
          <span role="status" data-testid="toolbar-mutation-status">
            {error()}
          </span>
        )}
      </Show>
      <Show
        when={
          runtime.toolbarMutationLifecycle().canRetryRefresh &&
          (runtime.toolbarMutationLifecycle().status === 'refresh-failed' ||
            runtime.toolbarMutationLifecycle().status === 'outcome-unknown')
        }
      >
        <button
          type="button"
          class="fmt-btn spreadsheet-toolbar-button"
          data-testid="toolbar-mutation-refresh-retry"
          aria-label="Reconcile toolbar mutation"
          onClick={() => void runtime.retryToolbarMutationRefresh()}
        >
          ↻
        </button>
      </Show>
      <Show when={runtime.filterSortEntrypoint().error}>
        {(error) => (
          <span role="status" data-testid="toolbar-filter-sort-status">
            {error()}
          </span>
        )}
      </Show>
      <Show when={runtime.filterSortEntrypoint().status === 'refresh-failed'}>
        <button
          type="button"
          class="fmt-btn spreadsheet-toolbar-button"
          data-testid="toolbar-filter-sort-refresh-retry"
          aria-label="Retry filter and sort refresh"
          onClick={runtime.entrypoints.retryFilterSortRefresh}
        >
          ↻
        </button>
      </Show>
    </>
  )
}
