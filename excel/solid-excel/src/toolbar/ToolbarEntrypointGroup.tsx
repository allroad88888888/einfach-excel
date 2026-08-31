import { Show } from 'solid-js'
import { useT } from '../i18n'
import { SortDropdown } from './SortDropdown'
import type { ToolbarGroupProps } from './ToolbarGroupProps'
import {
  ConditionalFormatIcon,
  DataValidationIcon,
  FilterIcon,
  FindReplaceIcon,
  NameManagerIcon,
  SortIcon,
} from './ToolbarIcons'

/** Existing find, validation, filter, sort and name-manager entry points. */
export function ToolbarEntrypointGroup(props: ToolbarGroupProps) {
  const t = useT()
  const { runtime } = props
  const surface = runtime.surface
  const capability = runtime.filterSortEntrypoint
  return (
    <>
      <button
        type="button"
        class="spreadsheet-toolbar-button"
        data-testid="toolbar-btn-find-replace"
        data-capability={runtime.findReplaceCapability().capability}
        data-tooltip={t('toolbar.findReplace.title')}
        aria-label={t('toolbar.findReplace.title')}
        disabled={!runtime.availability().sheetId || !runtime.findReplaceCapability().findEnabled}
        onClick={runtime.entrypoints.openFindReplace}
      >
        <FindReplaceIcon />
      </button>
      <button
        type="button"
        class="spreadsheet-toolbar-button"
        data-testid="toolbar-btn-conditional-format"
        data-tooltip={t('toolbar.condFmt.title')}
        aria-label={t('toolbar.condFmt.title')}
        disabled={!runtime.availability().sheetId}
        onClick={runtime.entrypoints.openConditionalFormat}
      >
        <ConditionalFormatIcon />
      </button>
      <button
        type="button"
        class="spreadsheet-toolbar-button"
        data-testid="toolbar-btn-data-validation"
        data-tooltip={t('toolbar.dataValidation.title')}
        aria-label={t('toolbar.dataValidation.title')}
        disabled={
          !runtime.availability().sheetId || runtime.availability().editingMode === 'drafting'
        }
        onClick={runtime.entrypoints.openDataValidation}
      >
        <DataValidationIcon />
      </button>
      <button
        type="button"
        class="spreadsheet-toolbar-button"
        data-testid="toolbar-btn-filter"
        data-tooltip={capability().disabledReason ?? t('toolbar.filter.title')}
        aria-label={t('toolbar.filter.title')}
        title={capability().disabledReason ?? ''}
        disabled={capability().disabled}
        onClick={runtime.entrypoints.openFilterDropdown}
      >
        <FilterIcon />
      </button>
      <Show when={runtime.sortSupported()}>
        <div
          class="spreadsheet-toolbar-sort-wrapper"
          style={{ position: 'relative', display: 'inline-flex' }}
        >
          <button
            ref={surface.setSortAnchorRef}
            type="button"
            class={`spreadsheet-toolbar-button ${surface.isDropdownOpen('sort') ? 'is-active' : ''}`.trim()}
            data-testid="toolbar-btn-sort"
            data-tooltip={
              runtime.physicalSortDiagnostic()?.message ??
              capability().disabledReason ??
              t('toolbar.sort.title')
            }
            aria-label={t('toolbar.sort.title')}
            title={runtime.physicalSortDiagnostic()?.message ?? capability().disabledReason ?? ''}
            aria-haspopup="menu"
            aria-expanded={surface.isDropdownOpen('sort')}
            disabled={capability().disabled}
            onClick={() => surface.toggleToolbarDropdown('sort')}
          >
            <SortIcon />
          </button>
          <SortDropdown
            isOpen={surface.isDropdownOpen('sort')}
            anchorRef={surface.sortAnchorRef() ?? null}
            disabled={capability().disabled}
            disabledReason={capability().disabledReason}
            onRequestClose={surface.closeSurface}
            t={t}
          />
        </div>
      </Show>
      <button
        type="button"
        class="spreadsheet-toolbar-button"
        data-testid="toolbar-btn-name-manager"
        data-tooltip={t('toolbar.nameManager.title')}
        aria-label={t('toolbar.nameManager.title')}
        disabled={!runtime.availability().sheetId}
        onClick={runtime.entrypoints.openNameManager}
      >
        <NameManagerIcon />
      </button>
      <span class="spreadsheet-toolbar-separator" aria-hidden="true" />
    </>
  )
}
