import { For } from 'solid-js'
import { useT } from '../i18n'
import { createLayoutFormatMenuInteraction } from './LayoutFormatMenuInteraction'
import { ToolbarAnchoredMenu } from './ToolbarAnchoredMenu'

/**
 * Discrete border preset emitted from the toolbar borders dropdown.
 *
 * For multi-cell selections the calling toolbar splits the patch per cell
 * (corner cells get two sides for "outer", etc.). For a single-cell
 * selection "all" and "outer" coincide and "inner" is a no-op.
 */
export type BordersPreset = 'all' | 'outer' | 'inner' | 'top' | 'right' | 'bottom' | 'left' | 'none'

export interface BordersDropdownProps {
  /** Anchored under the toolbar button — the button owns positioning. */
  isOpen: boolean
  /** Multi-cell selection => "inner" is enabled. */
  isMultiCell: boolean
  /** Apply the preset and close the dropdown. */
  onSelect: (preset: BordersPreset) => void
  /** Click outside / Esc requests a close. */
  onRequestClose: () => void
  /**
   * Root anchor element so click-outside ignores clicks on the toolbar button
   * (otherwise the outside-handler races the button's own toggle).
   */
  anchorRef?: HTMLElement | null
}

interface PresetDescriptor {
  preset: BordersPreset
  labelKey: string
  testId: string
  /** When false the option is rendered disabled (e.g. "inner" on 1x1). */
  enabledFor: 'always' | 'multi'
}

const PRESETS: PresetDescriptor[] = [
  {
    preset: 'all',
    labelKey: 'toolbar.borders.all',
    testId: 'toolbar-borders-all',
    enabledFor: 'always',
  },
  {
    preset: 'outer',
    labelKey: 'toolbar.borders.outer',
    testId: 'toolbar-borders-outer',
    enabledFor: 'always',
  },
  {
    preset: 'inner',
    labelKey: 'toolbar.borders.inner',
    testId: 'toolbar-borders-inner',
    enabledFor: 'multi',
  },
  {
    preset: 'top',
    labelKey: 'toolbar.borders.top',
    testId: 'toolbar-borders-top',
    enabledFor: 'always',
  },
  {
    preset: 'right',
    labelKey: 'toolbar.borders.right',
    testId: 'toolbar-borders-right',
    enabledFor: 'always',
  },
  {
    preset: 'bottom',
    labelKey: 'toolbar.borders.bottom',
    testId: 'toolbar-borders-bottom',
    enabledFor: 'always',
  },
  {
    preset: 'left',
    labelKey: 'toolbar.borders.left',
    testId: 'toolbar-borders-left',
    enabledFor: 'always',
  },
  {
    preset: 'none',
    labelKey: 'toolbar.borders.none',
    testId: 'toolbar-borders-none',
    enabledFor: 'always',
  },
]

export function BordersDropdown(props: BordersDropdownProps) {
  const t = useT()
  const interaction = createLayoutFormatMenuInteraction<BordersPreset>({
    anchor: () => props.anchorRef,
    isOpen: () => props.isOpen,
    onClose: props.onRequestClose,
    onSelect: props.onSelect,
  })

  function isEnabled(descriptor: PresetDescriptor): boolean {
    if (descriptor.enabledFor === 'always') return true
    return props.isMultiCell
  }

  return (
    <ToolbarAnchoredMenu
      anchorRef={props.anchorRef}
      rootRef={interaction.setRoot}
      class="spreadsheet-toolbar-borders-dropdown"
      role="menu"
      data-testid="toolbar-borders-dropdown"
      isOpen={props.isOpen}
      minWidth="140px"
    >
      <For each={PRESETS}>
        {(descriptor) => (
          <button
            type="button"
            class="spreadsheet-toolbar-borders-option"
            role="menuitem"
            data-testid={descriptor.testId}
            disabled={!isEnabled(descriptor)}
            tabIndex={-1}
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
              interaction.select(descriptor.preset)
            }}
          >
            {t(descriptor.labelKey)}
          </button>
        )}
      </For>
    </ToolbarAnchoredMenu>
  )
}
