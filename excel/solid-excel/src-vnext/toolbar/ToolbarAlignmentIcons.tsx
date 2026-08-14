import type { JSX } from 'solid-js'
import { TOOLBAR_ICON_SVG_PROPS as SVG_PROPS } from './ToolbarIconSvgProps'

/** Alignment toolbar glyphs. */

export const AlignLeftIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="3" y1="4" x2="13" y2="4" />
    <line x1="3" y1="7.5" x2="9" y2="7.5" />
    <line x1="3" y1="11" x2="11" y2="11" />
  </svg>
)

export const AlignCenterIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="3" y1="4" x2="13" y2="4" />
    <line x1="5" y1="7.5" x2="11" y2="7.5" />
    <line x1="4" y1="11" x2="12" y2="11" />
  </svg>
)

export const AlignRightIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="3" y1="4" x2="13" y2="4" />
    <line x1="7" y1="7.5" x2="13" y2="7.5" />
    <line x1="5" y1="11" x2="13" y2="11" />
  </svg>
)

export const VAlignTopIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="3" y1="3" x2="13" y2="3" />
    <line x1="8" y1="5.5" x2="8" y2="13" />
    <path d="m5.5 8 2.5-2.5L10.5 8" />
  </svg>
)

export const VAlignMiddleIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="3" y1="8" x2="13" y2="8" />
    <line x1="8" y1="3" x2="8" y2="6" />
    <line x1="8" y1="10" x2="8" y2="13" />
    <path d="m6.5 4.5 1.5-1.5 1.5 1.5" />
    <path d="m6.5 11.5 1.5 1.5 1.5-1.5" />
  </svg>
)

export const VAlignBottomIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="3" y1="13" x2="13" y2="13" />
    <line x1="8" y1="3" x2="8" y2="10.5" />
    <path d="m5.5 8 2.5 2.5L10.5 8" />
  </svg>
)

export const WrapIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="3" y1="4" x2="13" y2="4" />
    <path d="M3 8h7a2.5 2.5 0 1 1 0 5H8.5l1 1m0-2-1 1" />
    <line x1="3" y1="12" x2="6" y2="12" />
  </svg>
)

export const RotationIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <text
      x="4"
      y="13"
      font-size="9"
      font-family="serif"
      font-style="italic"
      fill="currentColor"
      stroke="none"
      transform="rotate(-25 8 8)"
    >
      ab
    </text>
    <line x1="2.5" y1="13.5" x2="13.5" y2="13.5" />
  </svg>
)
