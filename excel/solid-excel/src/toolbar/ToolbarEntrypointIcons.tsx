import type { JSX } from 'solid-js'
import { TOOLBAR_ICON_SVG_PROPS as SVG_PROPS } from './ToolbarIconSvgProps'

/** Toolbar entrypoint glyphs. */

export const FindReplaceIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <path d="M3 2.5h6l1.5 1.5v3" />
    <path d="M3 2.5v8h3" />
    <circle cx="9.5" cy="10" r="2.5" />
    <line x1="11.3" y1="11.8" x2="13.5" y2="14" />
  </svg>
)

/**
 * Three stacked bands with descending darkness — the Univer-style indicator
 * for "data bars / colour scales". Solid fills only; opacity gives the
 * gradient feel without sub-pixel stroke artefacts.
 */

export const ConditionalFormatIcon = (): JSX.Element => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2.5" y="3" width="11" height="2.5" fill="currentColor" opacity="0.95" />
    <rect x="2.5" y="6.75" width="8" height="2.5" fill="currentColor" opacity="0.65" />
    <rect x="2.5" y="10.5" width="5" height="2.5" fill="currentColor" opacity="0.35" />
  </svg>
)

/**
 * Shield silhouette with an inset checkmark — Univer/Office convention for
 * "Data Validation". Fill-only outline so corners stay crisp at 16px.
 */

export const DataValidationIcon = (): JSX.Element => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 1.5 3 3v4.5c0 3 2.2 5.5 5 7 2.8-1.5 5-4 5-7V3L8 1.5z"
      fill="currentColor"
      opacity="0.18"
    />
    <path
      d="M8 1.5 3 3v4.5c0 3 2.2 5.5 5 7 2.8-1.5 5-4 5-7V3L8 1.5z"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linejoin="round"
    />
    <path
      d="M5.5 8 7.2 9.7 10.7 6.2"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>
)

/**
 * Funnel — wide at top, narrow at bottom, with a short stem. Single closed
 * path; matches the Univer slim toolbar's filter glyph.
 */

export const FilterIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <path d="M2.5 3h11l-4 5v4l-3 1.5V8z" />
  </svg>
)

/**
 * Two vertical bars next to up/down arrows — the canonical "Sort A→Z / Z→A"
 * icon. Bars hint at the direction; arrows make the action unambiguous.
 */

export const SortIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <line x1="3" y1="3.5" x2="3" y2="12.5" />
    <path d="M1.5 11 3 12.5 4.5 11" />
    <line x1="7.5" y1="4" x2="13" y2="4" />
    <line x1="7.5" y1="8" x2="11.5" y2="8" />
    <line x1="7.5" y1="12" x2="10" y2="12" />
  </svg>
)

/**
 * Tag / bookmark — a label-shaped polygon with a small punch hole. Matches
 * the Office "Name Manager" glyph. Stroke-only.
 */

export const NameManagerIcon = (): JSX.Element => (
  <svg {...SVG_PROPS}>
    <path d="M2.5 2.5h6L13.5 7l-5 5.5-6-6.5z" />
    <circle cx="5.5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
)
