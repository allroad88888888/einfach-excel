import { useT } from '../../src/i18n'
import { DEFAULT_FONT_FAMILY } from './FontFamilyDropdown'
import { DEFAULT_FONT_SIZE } from './FontSizeDropdown'
import type { ToolbarGroupProps } from './ToolbarGroupProps'
import { FontSizeDownIcon, FontSizeUpIcon } from './ToolbarIcons'

/** Font choice and size toolbar controls. */
export function ToolbarFontGroup(props: ToolbarGroupProps) {
  const t = useT()
  const { runtime } = props
  const surface = runtime.surface
  return (
    <>
      <button
        type="button"
        ref={surface.setFontFamilyAnchorEl}
        class={`fmt-btn spreadsheet-toolbar-button ${surface.isDropdownOpen('font-family') ? 'fmt-btn-active' : ''}`.trim()}
        data-testid="toolbar-btn-font-family"
        data-tooltip={t('toolbar.fontFamily.title')}
        aria-label={t('toolbar.fontFamily.title')}
        aria-haspopup="menu"
        aria-expanded={surface.isDropdownOpen('font-family')}
        disabled={!runtime.availability().fontFamily || runtime.isProtectionGated()}
        onClick={(event) =>
          surface.isDropdownOpen('font-family')
            ? surface.closeAnchoredDropdown('font-family')
            : surface.openAnchoredDropdown('font-family', event.currentTarget)
        }
      >
        {runtime.activeCellFormat().fontFamily ?? DEFAULT_FONT_FAMILY}
      </button>
      <button
        type="button"
        ref={surface.setFontSizeAnchorEl}
        class={`fmt-btn spreadsheet-toolbar-button ${surface.isDropdownOpen('font-size') ? 'fmt-btn-active' : ''}`.trim()}
        data-testid="toolbar-btn-font-size"
        data-tooltip={t('toolbar.fontSize.title')}
        aria-label={t('toolbar.fontSize.title')}
        aria-haspopup="menu"
        aria-expanded={surface.isDropdownOpen('font-size')}
        disabled={!runtime.availability().fontSize || runtime.isProtectionGated()}
        onClick={(event) =>
          surface.isDropdownOpen('font-size')
            ? surface.closeAnchoredDropdown('font-size')
            : surface.openAnchoredDropdown('font-size', event.currentTarget)
        }
      >
        {runtime.activeCellFormat().fontSize ?? DEFAULT_FONT_SIZE}
      </button>
      <button
        type="button"
        class="fmt-btn spreadsheet-toolbar-button"
        data-testid="toolbar-btn-font-size-up"
        data-tooltip={t('toolbar.fontSizeUp.title')}
        aria-label={t('toolbar.fontSizeUp.title')}
        disabled={!runtime.availability().fontSize || runtime.isProtectionGated()}
        onClick={() => runtime.format.dispatchCommand({ command: 'font-size-up' })}
      >
        <FontSizeUpIcon />
      </button>
      <button
        type="button"
        class="fmt-btn spreadsheet-toolbar-button"
        data-testid="toolbar-btn-font-size-down"
        data-tooltip={t('toolbar.fontSizeDown.title')}
        aria-label={t('toolbar.fontSizeDown.title')}
        disabled={!runtime.availability().fontSize || runtime.isProtectionGated()}
        onClick={() => runtime.format.dispatchCommand({ command: 'font-size-down' })}
      >
        <FontSizeDownIcon />
      </button>
      <span class="spreadsheet-toolbar-separator" aria-hidden="true" />
    </>
  )
}
