import type { JSX } from 'solid-js'
import { TOOLBAR_ICON_SVG_PROPS as SVG_PROPS } from './ToolbarIconSvgProps'

/** Text-style toolbar glyphs. */

export const BoldIcon = (): JSX.Element => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {/*
      Fill-only "B" — no stroke. The previous version layered a 0.8px stroke
      on top of the fill which renders as a sub-pixel halo at 14-16px display
      sizes (the path edges land on fractional pixel boundaries). Pure fill
      with thicker bar geometry stays crisp at any zoom.
     */}
    <path
      d="M4.5 3h4a2.5 2.5 0 0 1 1.8 4.25A2.7 2.7 0 0 1 9 13H4.5V3zm2 1.6v2.7h2a1.35 1.35 0 0 0 0-2.7h-2zm0 4.3v2.5h2.5a1.25 1.25 0 0 0 0-2.5H6.5z"
      fill="currentColor"
    />
  </svg>
)

export const ItalicIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="10" y1="3" x2="6" y2="13" />
    <line x1="7" y1="3" x2="12" y2="3" />
    <line x1="4" y1="13" x2="9" y2="13" />
  </svg>
)

export const UnderlineIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <path d="M4 3v5.5a4 4 0 0 0 8 0V3" />
    <line x1="3" y1="13.5" x2="13" y2="13.5" />
  </svg>
)

export const StrikethroughIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="3" y1="8" x2="13" y2="8" />
    <path d="M5 5a3 3 0 0 1 3-2 3 3 0 0 1 3 3M5 11a3 3 0 0 0 3 2 3 3 0 0 0 3-3" />
  </svg>
)
