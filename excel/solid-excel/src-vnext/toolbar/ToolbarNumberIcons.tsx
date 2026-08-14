import type { JSX } from 'solid-js'
import { TOOLBAR_ICON_SVG_PROPS as SVG_PROPS } from './ToolbarIconSvgProps'

/** Number-format toolbar glyphs. */

export const NumberFormatIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <text
      x="8"
      y="11"
      text-anchor="middle"
      font-size="8"
      font-family="system-ui, -apple-system, sans-serif"
      font-weight="600"
      fill="currentColor"
      stroke="none"
    >
      123
    </text>
  </svg>
)

export const PercentIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <circle cx="5" cy="5" r="1.6" />
    <circle cx="11" cy="11" r="1.6" />
    <line x1="13" y1="3" x2="3" y2="13" />
  </svg>
)

export const CurrencyIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="8" y1="2.5" x2="8" y2="13.5" />
    <path d="M11 4.5H6.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H5" />
  </svg>
)

export const IncreaseDecimalIcon = (): JSX.Element => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {/*
      ".00" glyph + a right-pointing arrow above — "add a digit to the
      right of the decimal point". Mirrors the classic Excel/Univer icon.
     */}
    <text
      x="1"
      y="13"
      font-size="8"
      font-family="system-ui, -apple-system, sans-serif"
      font-weight="600"
      fill="currentColor"
      stroke="none"
    >
      .00
    </text>
    <path
      d="M9.5 3.5h4M11.7 1.7l1.8 1.8-1.8 1.8"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>
)

export const DecreaseDecimalIcon = (): JSX.Element => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {/*
      Mirror of IncreaseDecimalIcon — arrow points left so it reads as
      "remove a digit from the right of the decimal point".
     */}
    <text
      x="1"
      y="13"
      font-size="8"
      font-family="system-ui, -apple-system, sans-serif"
      font-weight="600"
      fill="currentColor"
      stroke="none"
    >
      .00
    </text>
    <path
      d="M9.5 3.5h4M11.3 1.7 9.5 3.5l1.8 1.8"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>
)

export const ChevronDownIcon = (): JSX.Element => (
  <svg
    width="8"
    height="8"
    viewBox="0 0 8 8"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M1.5 3 4 5.5 6.5 3" />
  </svg>
)

/**
 * Magnifying glass laid over a small document. Stroke-only — the lens, handle,
 * and document edges all read at 16px without any sub-pixel fill overlap.
 */
