import { useT } from '../i18n'
import { HAlignDropdown } from './HAlignDropdown'
import { RotationDropdown } from './RotationDropdown'
import type { ToolbarGroupProps } from './ToolbarGroupProps'
import { VAlignDropdown } from './VAlignDropdown'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  RotationIcon,
  VAlignBottomIcon,
  VAlignMiddleIcon,
  VAlignTopIcon,
  WrapIcon,
} from './ToolbarIcons'

/** Horizontal/vertical alignment, wrapping and text rotation controls. */
export function ToolbarAlignmentGroup(props: ToolbarGroupProps) {
  const t = useT()
  const { runtime } = props
  const surface = runtime.surface
  const hIcon = () =>
    surface.currentHAlign() === 'center' ? (
      <AlignCenterIcon />
    ) : surface.currentHAlign() === 'right' ? (
      <AlignRightIcon />
    ) : (
      <AlignLeftIcon />
    )
  const vIcon = () =>
    surface.currentVAlign() === 'top' ? (
      <VAlignTopIcon />
    ) : surface.currentVAlign() === 'center' ? (
      <VAlignMiddleIcon />
    ) : (
      <VAlignBottomIcon />
    )
  return (
    <>
      <div
        class="spreadsheet-toolbar-h-align-wrapper"
        style={{ position: 'relative', display: 'inline-flex' }}
      >
        <button
          ref={surface.setHAlignAnchorRef}
          type="button"
          class={`spreadsheet-toolbar-button ${surface.isDropdownOpen('alignment') ? 'is-active' : ''}`.trim()}
          data-testid="toolbar-btn-h-align"
          data-active-align={surface.currentHAlign()}
          data-tooltip={t('toolbar.hAlign.title')}
          aria-label={t('toolbar.hAlign.title')}
          aria-haspopup="menu"
          aria-expanded={surface.isDropdownOpen('alignment')}
          disabled={!runtime.availability().alignment || runtime.isProtectionGated()}
          onClick={() => surface.toggleToolbarDropdown('alignment')}
        >
          {hIcon()}
        </button>
        <HAlignDropdown
          isOpen={surface.isDropdownOpen('alignment')}
          current={surface.currentHAlign()}
          anchorRef={surface.hAlignAnchorRef() ?? null}
          onSelect={runtime.handleHAlignSelect}
          onRequestClose={surface.closeSurface}
        />
      </div>
      <div
        class="spreadsheet-toolbar-v-align-wrapper"
        style={{ position: 'relative', display: 'inline-flex' }}
      >
        <button
          ref={surface.setVAlignAnchorRef}
          type="button"
          class={`spreadsheet-toolbar-button ${surface.isDropdownOpen('vertical-alignment') ? 'is-active' : ''}`.trim()}
          data-testid="toolbar-btn-v-align"
          data-active-vertical-align={surface.currentVAlign()}
          data-tooltip={t('toolbar.vAlign.title')}
          aria-label={t('toolbar.vAlign.title')}
          aria-haspopup="menu"
          aria-expanded={surface.isDropdownOpen('vertical-alignment')}
          disabled={!runtime.availability().verticalAlignment || runtime.isProtectionGated()}
          onClick={() => surface.toggleToolbarDropdown('vertical-alignment')}
        >
          {vIcon()}
        </button>
        <VAlignDropdown
          isOpen={surface.isDropdownOpen('vertical-alignment')}
          current={surface.currentVAlign()}
          anchorRef={surface.vAlignAnchorRef() ?? null}
          onSelect={runtime.handleVAlignSelect}
          onRequestClose={surface.closeSurface}
        />
      </div>
      <button
        type="button"
        class={`spreadsheet-toolbar-button ${runtime.activeCellFormat().wrap ? 'is-active' : ''}`.trim()}
        data-testid="toolbar-btn-wrap"
        data-tooltip={t('toolbar.wrap.title')}
        aria-label={t('toolbar.wrap.title')}
        aria-pressed={!!runtime.activeCellFormat().wrap}
        disabled={!runtime.availability().wrap || runtime.isProtectionGated()}
        onClick={() => runtime.format.dispatchCommand({ command: 'wrap' })}
      >
        <WrapIcon />
      </button>
      <div
        class="spreadsheet-toolbar-rotation-wrapper"
        style={{ position: 'relative', display: 'inline-flex' }}
      >
        <button
          ref={surface.setRotationAnchorRef}
          type="button"
          class={`spreadsheet-toolbar-button ${surface.isDropdownOpen('rotation') ? 'is-active' : ''}`.trim()}
          data-testid="toolbar-btn-rotation"
          data-tooltip={t('toolbar.rotation.title')}
          aria-label={t('toolbar.rotation.title')}
          aria-haspopup="menu"
          aria-expanded={surface.isDropdownOpen('rotation')}
          disabled={!runtime.availability().rotation || runtime.isProtectionGated()}
          onClick={() => surface.toggleToolbarDropdown('rotation')}
        >
          <RotationIcon />
        </button>
        <RotationDropdown
          isOpen={surface.isDropdownOpen('rotation')}
          anchorRef={surface.rotationAnchorRef() ?? null}
          onSelect={runtime.handleRotationSelect}
          onRequestClose={surface.closeSurface}
        />
      </div>
      <span class="spreadsheet-toolbar-separator" aria-hidden="true" />
    </>
  )
}
