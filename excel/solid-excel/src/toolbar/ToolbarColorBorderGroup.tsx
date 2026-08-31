import { useT } from '../i18n'
import { BordersDropdown } from './BordersDropdown'
import type { ColorPopoverMode } from './FillColorPopover'
import type { ToolbarGroupProps } from './ToolbarGroupProps'
import { BordersIcon, FillColorIcon, TextColorIcon } from './ToolbarIcons'
import { rangeCellCount } from './ToolbarFormatLogic'

/** Text/fill palettes and the border preset menu. */
export function ToolbarColorBorderGroup(props: ToolbarGroupProps) {
  const t = useT()
  const { runtime } = props
  const surface = runtime.surface
  const colorButton = (mode: ColorPopoverMode, Icon: typeof FillColorIcon) => (
    <button
      type="button"
      ref={(el) => {
        surface.colorAnchors[mode] = el
      }}
      class={`spreadsheet-toolbar-button ${surface.activeColorMode() === mode ? 'is-active' : ''}`.trim()}
      data-testid={`toolbar-btn-${mode === 'fill' ? 'fill-color' : 'text-color'}`}
      data-tooltip={t(`toolbar.${mode === 'fill' ? 'fillColor' : 'textColor'}.title`)}
      aria-label={t(`toolbar.${mode === 'fill' ? 'fillColor' : 'textColor'}.title`)}
      aria-haspopup="dialog"
      aria-expanded={surface.activeColorMode() === mode}
      disabled={
        !(mode === 'fill' ? runtime.availability().fillColor : runtime.availability().textColor) ||
        runtime.isProtectionGated()
      }
      onClick={() => surface.toggleColorPopover(mode)}
    >
      <Icon />
    </button>
  )
  return (
    <>
      {colorButton('text', TextColorIcon)}
      {colorButton('fill', FillColorIcon)}
      <div
        class="spreadsheet-toolbar-borders-wrapper"
        style={{ position: 'relative', display: 'inline-flex' }}
      >
        <button
          ref={surface.setBordersAnchorRef}
          type="button"
          class={`spreadsheet-toolbar-button ${surface.isDropdownOpen('border') ? 'is-active' : ''}`.trim()}
          data-testid="toolbar-btn-borders"
          data-tooltip={t('toolbar.borders.title')}
          aria-label={t('toolbar.borders.title')}
          aria-haspopup="menu"
          aria-expanded={surface.isDropdownOpen('border')}
          disabled={!runtime.availability().border || runtime.isProtectionGated()}
          onClick={() => surface.toggleToolbarDropdown('border')}
        >
          <BordersIcon />
        </button>
        <BordersDropdown
          isOpen={surface.isDropdownOpen('border')}
          isMultiCell={rangeCellCount(runtime.selectionSnapshot().range) > 1}
          anchorRef={surface.bordersAnchorRef() ?? null}
          onSelect={runtime.borders.handleBordersSelect}
          onRequestClose={surface.closeSurface}
        />
      </div>
      <span class="spreadsheet-toolbar-separator" aria-hidden="true" />
    </>
  )
}
