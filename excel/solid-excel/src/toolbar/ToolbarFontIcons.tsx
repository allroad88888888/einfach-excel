import type { JSX } from 'solid-js'
import { TOOLBAR_ICON_SVG_PROPS as SVG_PROPS } from './ToolbarIconSvgProps'

/** Font-size toolbar glyphs. */

export const FontSizeUpIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    {/* Larger "A" glyph + clearer up arrow. Previous version drew "A" at
        font-size 10 starting at x=2 — visually undersized next to the
        16x16 button. Bumped to font-size 12 and the arrow stroke to 1.6. */}
    <text
      x="1.5"
      y="13"
      font-size="12"
      font-family="Georgia, 'Times New Roman', serif"
      font-weight="700"
      fill="currentColor"
      stroke="none"
    >
      A
    </text>
    <path d="M12 4v7" stroke-width="1.6" />
    <path d="m9.6 6.2 2.4-2.4 2.4 2.4" stroke-width="1.6" />
  </svg>
)

export const FontSizeDownIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    {/* Smaller "A" (visually one rank below FontSizeUpIcon) with a clear
        down arrow. */}
    <text
      x="2.5"
      y="12"
      font-size="10"
      font-family="Georgia, 'Times New Roman', serif"
      font-weight="700"
      fill="currentColor"
      stroke="none"
    >
      A
    </text>
    <path d="M12 4v7" stroke-width="1.6" />
    <path d="m9.6 8.8 2.4 2.4 2.4-2.4" stroke-width="1.6" />
  </svg>
)
