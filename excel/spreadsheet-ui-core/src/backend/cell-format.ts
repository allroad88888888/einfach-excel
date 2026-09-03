/** 单元格显示格式的数据契约。 */
export type SpreadsheetAlignment =
  | 'default'
  | 'left'
  | 'center'
  | 'right'
  | 'fill'
  | 'justify'
  | 'distributed'

export type SpreadsheetVerticalAlignment = 'top' | 'center' | 'bottom' | 'justify' | 'distributed'

/**
 * Overflow strategy for a cell whose text exceeds its box.
 *
 * - `'overflow'` — default Excel behaviour for non-numeric text: the rendered
 *   string spills into adjacent empty cells. Adapters that cannot detect
 *   neighbour blankness may fall back to `'clip'`.
 * - `'clip'` — truncate at the cell edge. Adapters typically draw a trailing
 *   ellipsis via `text-overflow: ellipsis`.
 * - `'ellipsis'` — synonym for `'clip'` that some adapters use to signal an
 *   explicit ellipsis glyph; kept distinct for round-trip fidelity.
 * - `'wrap'` — wrap text onto multiple lines. The renderer may also bump the
 *   row height through the existing viewport-size projection / override path.
 * - `'shrink-to-fit'` — scale the rendered text down to fit. Mutually
 *   exclusive with `'wrap'` at the UI level; the editor decides precedence.
 */
export type SpreadsheetOverflow = 'overflow' | 'clip' | 'ellipsis' | 'wrap' | 'shrink-to-fit'

/**
 * Cell text rotation.
 *
 * - A number in `[-90, 90]` is degrees of baseline rotation.
 * - The string literal `'vertical'` is character-stacked vertical text
 *   (Excel's "Text" alignment angle 255 / `writing-mode: vertical-rl`).
 */
export type SpreadsheetRotation = number | 'vertical'

/**
 * How negative numeric values display for `number`, `currency` and `percent`
 * variants. `'minus'` is the default (`-1234`); `'red'` paints the rendered
 * string red and emits a color hint on `DisplayCell.format.fgColor`;
 * `'parens'` wraps the absolute value in parentheses (`(1234)`); `'red-parens'`
 * combines both.
 */
export type SpreadsheetNumberFormatNegative = 'minus' | 'red' | 'parens' | 'red-parens'

/**
 * Denominator hint for the `fraction` variant. `'one-digit'` allows up to
 * `9` (`# ?/?`), `'two-digit'` up to `99`, `'three-digit'` up to `999`. A
 * numeric value forces a fixed denominator (e.g. `2` for halves, `4` for
 * quarters).
 */
export type SpreadsheetNumberFormatFractionDenominator =
  | 'one-digit'
  | 'two-digit'
  | 'three-digit'
  | number

/**
 * Twelve Excel-style number-format categories.
 *
 * Wave 6.3 widens this type. The historical `'decimal'` variant is retained
 * as a deprecated alias for `'number'`; the projection layer treats them as
 * identical for one wave.
 *
 * ── Engine support matrix ──
 *
 * **WASM (Rust wire):** Only **6 kinds** are implemented:
 *   `general` | `number` (and deprecated `decimal`) |
 *   `percent` (and synonym `percentage`) | `currency` | `date` | `custom`.
 *
 * The remaining kinds – `accounting`, `time`, `fraction`, `scientific`,
 * `text`, `special` – are **silently downgraded to `general`** by the wire
 * layer (`into_number_format`).  The `negative` field on `number` /
 * `currency` / `percent` is also silently discarded (no corresponding wire
 * field).
 *
 * **Static backend:** All declared variants are accepted and echoed back
 * verbatim (no wire round-trip).
 *
 * Support for the missing categories requires new variants on the engine
 * `NumberFormat` enum; that work is tracked separately and is not part of
 * the salvage / wrap-up batch.
 */
export type SpreadsheetNumberFormat =
  | { kind: 'general' }
  | {
      kind: 'number'
      digits?: number
      thousands?: boolean
      negative?: SpreadsheetNumberFormatNegative
    }
  | {
      /** Deprecated alias for `'number'`. Slated for removal one wave after 6.3. */
      kind: 'decimal'
      digits?: number
      thousands?: boolean
      negative?: SpreadsheetNumberFormatNegative
    }
  | {
      kind: 'currency'
      symbol?: string
      digits?: number
      negative?: SpreadsheetNumberFormatNegative
    }
  | { kind: 'accounting'; symbol?: string; digits?: number }
  | { kind: 'date'; pattern?: string }
  | { kind: 'time'; pattern?: string }
  | {
      kind: 'percent'
      digits?: number
      negative?: SpreadsheetNumberFormatNegative
    }
  | {
      /** Synonym for `'percent'` used by the Format Cells dialog. */
      kind: 'percentage'
      digits?: number
      negative?: SpreadsheetNumberFormatNegative
    }
  | { kind: 'fraction'; denominator?: SpreadsheetNumberFormatFractionDenominator }
  | { kind: 'scientific'; digits?: number }
  | { kind: 'text' }
  | { kind: 'special'; preset: string; locale?: string }
  | { kind: 'custom'; pattern: string }

export type SpreadsheetBorderSide = 'top' | 'right' | 'bottom' | 'left'

export type SpreadsheetBorderStyle =
  | 'none'
  | 'thin'
  | 'medium'
  | 'thick'
  | 'dashed'
  | 'dotted'
  | 'double'

export interface SpreadsheetBorderSpec {
  style: SpreadsheetBorderStyle
  color?: string
}

export type SpreadsheetBorders = Partial<Record<SpreadsheetBorderSide, SpreadsheetBorderSpec>>

export interface SpreadsheetCellFormat {
  numberFormat?: SpreadsheetNumberFormat
  bold?: boolean
  italic?: boolean
  align?: SpreadsheetAlignment
  fontSize?: number
  fontFamily?: string
  fgColor?: string
  bgColor?: string
  borders?: SpreadsheetBorders
  underline?: boolean
  strikethrough?: boolean
  wrap?: boolean
  indent?: number
  /**
   * Vertical alignment inside the cell box.
   *
   * Default (when omitted) is `'bottom'`, matching Excel for non-numeric text.
   */
  verticalAlign?: SpreadsheetVerticalAlignment
  /**
   * Text rotation in degrees (`-90` to `90`), or `'vertical'` for stacked
   * vertical text.
   */
  rotation?: SpreadsheetRotation
  /**
   * Overflow strategy when the rendered text exceeds the cell box.
   *
   * Default (when omitted) is `'overflow'` for text and `'clip'` for numbers;
   * the renderer applies that fallback because it knows the value kind.
   */
  overflow?: SpreadsheetOverflow
  /**
   * Scale the rendered text down to fit the cell. Mutually exclusive with
   * `wrap` at the editor level (the editor picks a winner before save).
   */
  shrinkToFit?: boolean
  /**
   * Per-cell BCP-47 locale override. The projection formatter falls back to
   * the workbook locale (`workbookLocaleAtom`, default `'en-US'`) when this
   * field is omitted. Affects thousands / decimal separators and the default
   * currency symbol.
   */
  locale?: string
}
