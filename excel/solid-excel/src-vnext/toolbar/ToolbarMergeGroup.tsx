import { useT } from '../../src/i18n'
import { MergeDropdown } from './MergeDropdown'
import type { ToolbarGroupProps } from './ToolbarGroupProps'
import { MergeCellsIcon } from './ToolbarIcons'
import { rangeCellCount } from './ToolbarFormatLogic'

/** The merge/unmerge dropdown control. */
export function ToolbarMergeGroup(props: ToolbarGroupProps) {
  const t = useT()
  const { runtime } = props
  const surface = runtime.surface
  const merged = () => runtime.merge.activeCellMergeRange() !== null
  return (
    <>
      <div
        class="spreadsheet-toolbar-merge-wrapper"
        style={{ position: 'relative', display: 'inline-flex' }}
      >
        <button
          ref={surface.setMergeAnchorRef}
          type="button"
          class={`spreadsheet-toolbar-button ${surface.isDropdownOpen('merge') || merged() ? 'is-active' : ''}`.trim()}
          data-testid="toolbar-btn-merge"
          data-tooltip={t('toolbar.merge.title')}
          aria-label={t('toolbar.merge.title')}
          aria-haspopup="menu"
          aria-expanded={surface.isDropdownOpen('merge')}
          aria-pressed={merged()}
          disabled={
            !runtime.backend.mergeRange ||
            runtime.availability().editingMode === 'drafting' ||
            runtime.isProtectionGated()
          }
          onClick={() => surface.toggleToolbarDropdown('merge')}
        >
          <MergeCellsIcon />
        </button>
        <MergeDropdown
          isOpen={surface.isDropdownOpen('merge')}
          isMultiCell={rangeCellCount(runtime.selectionSnapshot().range) > 1}
          canUnmerge={merged()}
          anchorRef={surface.mergeAnchorRef() ?? null}
          onSelect={runtime.merge.handleMergeSelect}
          onRequestClose={surface.closeSurface}
        />
      </div>
      <span class="spreadsheet-toolbar-separator" aria-hidden="true" />
    </>
  )
}
