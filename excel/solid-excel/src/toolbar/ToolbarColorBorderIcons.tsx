import type { JSX } from 'solid-js'
import { TOOLBAR_ICON_SVG_PROPS as SVG_PROPS } from './ToolbarIconSvgProps'

/** Color and border toolbar glyphs. */

export const FillColorIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <path d="M3.5 8.5 8 4l4.5 4.5L8 13z" />
    <path d="M8 4 6 2" />
    <circle cx="13" cy="11.5" r="1" fill="currentColor" />
    <rect x="3" y="13.5" width="10" height="1.2" fill="#ffd966" stroke="none" />
  </svg>
)

export const TextColorIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <path d="M4 11 7.5 3h1L12 11" />
    <line x1="5" y1="8" x2="11" y2="8" />
    <rect x="3" y="13" width="10" height="1.5" fill="#e64545" stroke="none" />
  </svg>
)

export const BordersIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <rect x="2.5" y="2.5" width="11" height="11" />
    <line x1="8" y1="2.5" x2="8" y2="13.5" />
    <line x1="2.5" y1="8" x2="13.5" y2="8" />
  </svg>
)
