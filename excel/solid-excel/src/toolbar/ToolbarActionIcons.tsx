import type { JSX } from 'solid-js'
import { TOOLBAR_ICON_SVG_PROPS as SVG_PROPS } from './ToolbarIconSvgProps'

/** Toolbar action glyphs. */

export const FormatPainterIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <rect x="3" y="2.5" width="9" height="3" rx="0.5" />
    <path d="M3.5 5.5h8v2.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" />
    <path d="M7 9v2a1 1 0 0 0 1 1h0v1.5" />
    <rect x="6.5" y="13.5" width="3" height="1.5" rx="0.3" />
  </svg>
)

export const PasteIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <rect x="3" y="3" width="10" height="11" rx="0.5" />
    <rect x="5.5" y="2" width="5" height="2.5" rx="0.4" fill="currentColor" />
  </svg>
)

export const UndoIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <path d="M3 7h7.5a3.5 3.5 0 0 1 0 7H7" />
    <path d="m5.5 4.5-2.5 2.5 2.5 2.5" />
  </svg>
)

export const RedoIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <path d="M13 7H5.5a3.5 3.5 0 0 0 0 7H9" />
    <path d="m10.5 4.5 2.5 2.5-2.5 2.5" />
  </svg>
)

export const ClearFormatIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    {/*
      "Eraser swept over text" composition — the universal Excel/Univer
      glyph for clear formatting:
        - background "T" letter (formatted text being erased)
        - eraser shape on top, angled, with a clean separating line
        - small flecks suggesting the format dust being removed
      Heavier strokes (1.6) so the icon reads at 14-16px sizes.
     */}
    {/* The "T" letter being cleaned */}
    <line x1="3" y1="3.5" x2="9" y2="3.5" stroke-width="1.6" />
    <line x1="6" y1="3.5" x2="6" y2="9.5" stroke-width="1.6" />
    {/* Eraser body — rounded rectangle on a tilt */}
    <path d="M8 14.5 5 11.5l6-6 3 3-6 6z" fill="#fff" stroke="currentColor" stroke-width="1.5" />
    {/* Divider between the eraser's pink top and white pad */}
    <line x1="7" y1="9.5" x2="10" y2="12.5" stroke-width="1.5" />
  </svg>
)

export const PrintIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    {/*
      Printer with a paper sheet poking out the top (input) and an output
      sheet emerging from the bottom. Body is filled so it reads at 16px;
      the output sheet is a white rect with two ink lines so the "printout"
      detail stays legible.
     */}
    {/* Input sheet — top tab */}
    <rect x="4.5" y="2" width="7" height="3.2" rx="0.3" />
    {/* Printer body */}
    <path
      d="M3 5.5h10a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1h-1.5v-2h-7v2H3a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z"
      fill="currentColor"
      stroke="none"
    />
    {/* Output sheet on the front */}
    <rect x="4.5" y="9" width="7" height="5" rx="0.3" fill="#fff" />
    {/* Output sheet ink lines */}
    <line x1="6" y1="11" x2="10" y2="11" stroke-width="1" />
    <line x1="6" y1="12.5" x2="10" y2="12.5" stroke-width="1" />
  </svg>
)

export const CommentIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    {/*
      Rounded speech bubble with a tail at the lower-left. Two horizontal
      lines hint at message content. Pure stroke so it reads at 16px.
     */}
    <path d="M2.5 4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 4v5A1.5 1.5 0 0 1 12 10.5H6.5L4 13v-2.5A1.5 1.5 0 0 1 2.5 9V4z" />
    <line x1="5" y1="5.5" x2="11" y2="5.5" stroke-width="1.3" />
    <line x1="5" y1="7.8" x2="9" y2="7.8" stroke-width="1.3" />
  </svg>
)
