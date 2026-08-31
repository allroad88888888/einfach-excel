import { For } from 'solid-js'
import type { SpreadsheetRotation } from '@einfach/spreadsheet-ui-core'
import { useT } from '../i18n'
import { createLayoutFormatMenuInteraction } from './LayoutFormatMenuInteraction'
import { ToolbarAnchoredMenu } from './ToolbarAnchoredMenu'

/**
 * Discrete rotation preset emitted from the toolbar rotation dropdown.
 *
 * Numeric values are degrees in `[-90, 90]`; `'vertical'` switches the cell
 * to CSS writing-mode for character-stacked text.
 */
export type RotationPreset = SpreadsheetRotation

export interface RotationDropdownProps {
  /** Anchored under the toolbar button — the button owns positioning. */
  isOpen: boolean
  /** Apply the preset and close the dropdown. */
  onSelect: (preset: RotationPreset) => void
  /** Click outside / Esc requests a close. */
  onRequestClose: () => void
  /**
   * Root anchor element so click-outside ignores clicks on the toolbar button
   * (otherwise the outside-handler races the button's own toggle).
   */
  anchorRef?: HTMLElement | null
}

interface PresetDescriptor {
  preset: RotationPreset
  labelKey: string
  testId: string
}

const PRESETS: PresetDescriptor[] = [
  { preset: 0, labelKey: 'toolbar.rotation.0', testId: 'toolbar-rotation-0' },
  { preset: 45, labelKey: 'toolbar.rotation.45', testId: 'toolbar-rotation-45' },
  { preset: 90, labelKey: 'toolbar.rotation.90', testId: 'toolbar-rotation-90' },
  { preset: -45, labelKey: 'toolbar.rotation.-45', testId: 'toolbar-rotation-neg45' },
  { preset: -90, labelKey: 'toolbar.rotation.-90', testId: 'toolbar-rotation-neg90' },
  {
    preset: 'vertical',
    labelKey: 'toolbar.rotation.vertical',
    testId: 'toolbar-rotation-vertical',
  },
]

export function RotationDropdown(props: RotationDropdownProps) {
  const t = useT()
  const interaction = createLayoutFormatMenuInteraction<RotationPreset>({
    anchor: () => props.anchorRef,
    isOpen: () => props.isOpen,
    onClose: props.onRequestClose,
    onSelect: props.onSelect,
  })

  return (
    <ToolbarAnchoredMenu
      anchorRef={props.anchorRef}
      rootRef={interaction.setRoot}
      class="spreadsheet-toolbar-rotation-dropdown"
      role="menu"
      data-testid="toolbar-rotation-dropdown"
      isOpen={props.isOpen}
      minWidth="140px"
    >
      <For each={PRESETS}>
        {(descriptor) => (
          <button
            type="button"
            class="spreadsheet-toolbar-rotation-option"
            role="menuitem"
            data-testid={descriptor.testId}
            tabIndex={-1}
            style={{
              padding: '4px 12px',
              'text-align': 'left',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              font: 'inherit',
            }}
            onClick={() => interaction.select(descriptor.preset)}
          >
            {t(descriptor.labelKey)}
          </button>
        )}
      </For>
    </ToolbarAnchoredMenu>
  )
}
