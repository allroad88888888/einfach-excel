import { For, createEffect, onCleanup } from 'solid-js'
import { useT } from '../../src/i18n'
import { ToolbarAnchoredMenu } from './ToolbarAnchoredMenu'

/**
 * Discrete merge preset emitted from the toolbar merge dropdown.
 *
 *  - `merge-center`  — collapse the full selection into one anchor cell and
 *    centre the anchor's text horizontally.
 *  - `across-rows`   — merge each row of the selection independently, leaving
 *    one merged range per row.
 *  - `across-cols`   — merge each column of the selection independently,
 *    leaving one merged range per column.
 *  - `unmerge`       — restore the four merged cells back to their original
 *    individual cells. Enabled only when the active cell sits inside an
 *    existing merge.
 */
export type MergePreset = 'merge-center' | 'across-rows' | 'across-cols' | 'unmerge'

export interface MergeDropdownProps {
  /** Anchored under the toolbar button — the button owns positioning. */
  isOpen: boolean
  /** Selection spans more than a single cell — merge variants need this. */
  isMultiCell: boolean
  /** Active cell sits inside (or on) a merged range — unmerge needs this. */
  canUnmerge: boolean
  /** Apply the preset and close the dropdown. */
  onSelect: (preset: MergePreset) => void
  /** Click outside / Esc requests a close. */
  onRequestClose: () => void
  /**
   * Root anchor element so click-outside ignores clicks on the toolbar button
   * (otherwise the outside-handler races the button's own toggle).
   */
  anchorRef?: HTMLElement | null
}

interface PresetDescriptor {
  preset: MergePreset
  labelKey: string
  testId: string
  /**
   * - `multi`   → enabled only when the selection covers more than one cell.
   * - `merged`  → enabled only when the active cell sits inside a merged range.
   */
  enabledWhen: 'multi' | 'merged'
}

const PRESETS: PresetDescriptor[] = [
  {
    preset: 'merge-center',
    labelKey: 'toolbar.merge.mergeCenter',
    testId: 'toolbar-merge-center',
    enabledWhen: 'multi',
  },
  {
    preset: 'across-rows',
    labelKey: 'toolbar.merge.acrossRows',
    testId: 'toolbar-merge-across-rows',
    enabledWhen: 'multi',
  },
  {
    preset: 'across-cols',
    labelKey: 'toolbar.merge.acrossCols',
    testId: 'toolbar-merge-across-cols',
    enabledWhen: 'multi',
  },
  {
    preset: 'unmerge',
    labelKey: 'toolbar.merge.unmerge',
    testId: 'toolbar-merge-unmerge',
    enabledWhen: 'merged',
  },
]

export function MergeDropdown(props: MergeDropdownProps) {
  const t = useT()
  let rootRef: HTMLDivElement | undefined

  function onDocPointerDown(event: MouseEvent) {
    if (!rootRef) return
    const target = event.target as Node | null
    if (!target) return
    if (rootRef.contains(target)) return
    if (props.anchorRef && props.anchorRef.contains(target)) return
    props.onRequestClose()
  }

  function onDocKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onRequestClose()
    }
  }

  // Attach the document-level dismiss listeners only while the dropdown is
  // open — see BordersDropdown for the stale-`rootRef` failure mode this
  // gating prevents.
  createEffect(() => {
    if (!props.isOpen) return
    document.addEventListener('mousedown', onDocPointerDown, true)
    document.addEventListener('keydown', onDocKeyDown)
    onCleanup(() => {
      document.removeEventListener('mousedown', onDocPointerDown, true)
      document.removeEventListener('keydown', onDocKeyDown)
    })
  })

  function isEnabled(descriptor: PresetDescriptor): boolean {
    if (descriptor.enabledWhen === 'multi') return props.isMultiCell
    return props.canUnmerge
  }

  return (
    <ToolbarAnchoredMenu
      anchorRef={props.anchorRef}
      rootRef={(element) => {
        rootRef = element
      }}
      class="spreadsheet-toolbar-merge-dropdown"
      role="menu"
      data-testid="toolbar-merge-dropdown"
      isOpen={props.isOpen}
      minWidth="140px"
    >
      <For each={PRESETS}>
        {(descriptor) => (
          <button
            type="button"
            class="spreadsheet-toolbar-merge-option"
            role="menuitem"
            data-testid={descriptor.testId}
            disabled={!isEnabled(descriptor)}
            style={{
              padding: '4px 12px',
              'text-align': 'left',
              background: 'transparent',
              border: 'none',
              cursor: isEnabled(descriptor) ? 'pointer' : 'not-allowed',
              opacity: isEnabled(descriptor) ? 1 : 0.5,
              font: 'inherit',
            }}
            onClick={() => {
              if (!isEnabled(descriptor)) return
              props.onSelect(descriptor.preset)
            }}
          >
            {t(descriptor.labelKey)}
          </button>
        )}
      </For>
    </ToolbarAnchoredMenu>
  )
}
