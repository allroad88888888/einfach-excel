import { For } from 'solid-js'
import { useT } from '../../src/i18n'
import { createLayoutFormatMenuInteraction } from './LayoutFormatMenuInteraction'
import { ToolbarAnchoredMenu } from './ToolbarAnchoredMenu'

/**
 * Discrete vertical alignment value emitted from the toolbar v-align
 * dropdown. Maps 1:1 onto the `'vertical-alignment'` toolbar command value
 * contract (`'top' | 'center' | 'bottom'`).
 */
export type VAlignValue = 'top' | 'center' | 'bottom'

export interface VAlignDropdownProps {
  /** Anchored under the toolbar button — the button owns positioning. */
  isOpen: boolean
  /** Currently active v-align on the focused cell, for the depressed row. */
  current: VAlignValue
  /** Apply the alignment and close the dropdown. */
  onSelect: (value: VAlignValue) => void
  /** Click outside / Esc requests a close. */
  onRequestClose: () => void
  /**
   * Root anchor element so click-outside ignores clicks on the toolbar button
   * (otherwise the outside-handler races the button's own toggle).
   */
  anchorRef?: HTMLElement | null
}

interface OptionDescriptor {
  value: VAlignValue
  labelKey: string
  testId: string
}

const OPTIONS: OptionDescriptor[] = [
  { value: 'top', labelKey: 'toolbar.verticalAlignTop', testId: 'toolbar-v-align-top' },
  { value: 'center', labelKey: 'toolbar.verticalAlignMiddle', testId: 'toolbar-v-align-middle' },
  { value: 'bottom', labelKey: 'toolbar.verticalAlignBottom', testId: 'toolbar-v-align-bottom' },
]

export function VAlignDropdown(props: VAlignDropdownProps) {
  const t = useT()
  const interaction = createLayoutFormatMenuInteraction<VAlignValue>({
    anchor: () => props.anchorRef,
    isOpen: () => props.isOpen,
    onClose: props.onRequestClose,
    onSelect: props.onSelect,
  })

  return (
    <ToolbarAnchoredMenu
      anchorRef={props.anchorRef}
      rootRef={interaction.setRoot}
      class="spreadsheet-toolbar-v-align-dropdown"
      role="menu"
      data-testid="toolbar-v-align-dropdown"
      isOpen={props.isOpen}
      minWidth="120px"
    >
      <For each={OPTIONS}>
        {(descriptor) => {
          const isActive = () => props.current === descriptor.value
          return (
            <button
              type="button"
              class="spreadsheet-toolbar-v-align-option"
              role="menuitemradio"
              data-testid={descriptor.testId}
              aria-checked={isActive()}
              tabIndex={-1}
              style={{
                padding: '4px 12px',
                'text-align': 'left',
                background: isActive() ? '#eef3ff' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                font: 'inherit',
              }}
              onClick={() => interaction.select(descriptor.value)}
            >
              {t(descriptor.labelKey)}
            </button>
          )
        }}
      </For>
    </ToolbarAnchoredMenu>
  )
}
