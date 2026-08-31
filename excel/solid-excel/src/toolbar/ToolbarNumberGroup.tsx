import { useT } from '../i18n'
import type { ToolbarGroupProps } from './ToolbarGroupProps'
import {
  ChevronDownIcon,
  CurrencyIcon,
  DecreaseDecimalIcon,
  IncreaseDecimalIcon,
  PercentIcon,
} from './ToolbarIcons'

/** Number-format shortcuts and the number-format dropdown trigger. */
export function ToolbarNumberGroup(props: ToolbarGroupProps) {
  const t = useT()
  const { runtime } = props
  const surface = runtime.surface
  const protectedFormat = () => !runtime.availability().numberFormat || runtime.isProtectionGated()
  const numberFormat = () => runtime.activeCellFormat().numberFormat?.kind
  const currency = () => numberFormat() === 'currency' || numberFormat() === 'accounting'
  return (
    <>
      <button
        type="button"
        ref={surface.setNumberFormatAnchorEl}
        class={`spreadsheet-toolbar-button spreadsheet-toolbar-currency-opener ${surface.isDropdownOpen('number-format') ? 'is-active' : ''}`.trim()}
        data-testid="toolbar-btn-number-format"
        data-tooltip={t('toolbar.currencyDropdown.title')}
        aria-label={t('toolbar.currencyDropdown.title')}
        aria-haspopup="menu"
        aria-expanded={surface.isDropdownOpen('number-format')}
        disabled={protectedFormat()}
        onClick={(event) =>
          surface.isDropdownOpen('number-format')
            ? surface.closeAnchoredDropdown('number-format')
            : surface.openAnchoredDropdown('number-format', event.currentTarget)
        }
      >
        <span>{t('toolbar.currencyDropdown')}</span>
        <span class="toolbar-chevron">
          <ChevronDownIcon />
        </span>
      </button>
      <button
        type="button"
        class={`spreadsheet-toolbar-button ${numberFormat() === 'percent' ? 'is-active' : ''}`.trim()}
        data-testid="toolbar-btn-percent-format"
        data-tooltip={t('toolbar.percentFormat.title')}
        aria-label={t('toolbar.percentFormat.title')}
        aria-pressed={numberFormat() === 'percent'}
        disabled={protectedFormat()}
        onClick={() =>
          runtime.format.dispatchCommand({ command: 'number-format', value: 'Percent' })
        }
      >
        <PercentIcon />
      </button>
      <button
        type="button"
        class={`spreadsheet-toolbar-button ${currency() ? 'is-active' : ''}`.trim()}
        data-testid="toolbar-btn-currency-format"
        data-tooltip={t('toolbar.currencyFormat.title')}
        aria-label={t('toolbar.currencyFormat.title')}
        aria-pressed={currency()}
        disabled={protectedFormat()}
        onClick={() =>
          runtime.format.dispatchCommand({ command: 'number-format', value: 'Currency' })
        }
      >
        <CurrencyIcon />
      </button>
      <button
        type="button"
        class="spreadsheet-toolbar-button"
        data-testid="toolbar-btn-inc-decimal"
        data-tooltip={t('toolbar.incDecimal.title')}
        aria-label={t('toolbar.incDecimal.title')}
        disabled={protectedFormat()}
        onClick={() => runtime.format.adjustDigits('increase')}
      >
        <IncreaseDecimalIcon />
      </button>
      <button
        type="button"
        class="spreadsheet-toolbar-button"
        data-testid="toolbar-btn-dec-decimal"
        data-tooltip={t('toolbar.decDecimal.title')}
        aria-label={t('toolbar.decDecimal.title')}
        disabled={protectedFormat() || runtime.format.currentDecimalDigits() <= 0}
        onClick={() => runtime.format.adjustDigits('decrease')}
      >
        <DecreaseDecimalIcon />
      </button>
    </>
  )
}
