import type { JSX } from 'solid-js'
import { TOOLBAR_ICON_SVG_PROPS as SVG_PROPS } from './ToolbarIconSvgProps'

/** Merge toolbar glyphs. */

export const MergeCellsIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    {/*
      4-cell grid that collapses inward:
        - heavy outer rect = merged boundary
        - dashed inner crosshatch = cell walls "fading away"
        - center arrows pointing inward = collapse
      Closer to the classic Excel / Univer merge glyph than the previous
      rectangle-with-crossing-arrows (which read more like "swap").
     */}
    <rect x="2" y="3" width="12" height="10" stroke-width="1.6" />
    <line x1="8" y1="3.2" x2="8" y2="6" stroke-dasharray="1.4 1.2" />
    <line x1="8" y1="10" x2="8" y2="12.8" stroke-dasharray="1.4 1.2" />
    <line x1="2.2" y1="8" x2="5" y2="8" stroke-dasharray="1.4 1.2" />
    <line x1="11" y1="8" x2="13.8" y2="8" stroke-dasharray="1.4 1.2" />
    <path d="M6 8h4" stroke-width="1.4" />
    <path d="M6.5 7l-1 1 1 1M9.5 7l1 1-1 1" stroke-width="1.4" />
  </svg>
)

export const UnmergeCellsIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <rect x="2.5" y="3.5" width="11" height="9" />
    <line x1="8" y1="3.5" x2="8" y2="12.5" />
    <path d="m6 6 2 2-2 2M10 6l-2 2 2 2" />
  </svg>
)
