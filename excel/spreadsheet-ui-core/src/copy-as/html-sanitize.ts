const HTML_ESCAPE_RE = /[&<>"']/g
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch] ?? ch)
}

/**
 * Attribute-level escape for the `style="…"` payload. We already drop any
 * value that doesn't match a strict whitelist, but this is defence-in-depth
 * — if a future bug ever lets a `"` or `&` slip through, the attribute stays
 * well-formed and the payload can't break out of the attribute quotes.
 */
const HTML_ATTR_ESCAPE_RE = /[&"]/g
const HTML_ATTR_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
}
export function escapeHtmlAttr(text: string): string {
  return text.replace(HTML_ATTR_ESCAPE_RE, (ch) => HTML_ATTR_ESCAPE_MAP[ch] ?? ch)
}

/**
 * Convert a `\n` (or `\r\n`) inside cell text to `<br>` so the rendered cell
 * preserves the line break. Done after HTML-escaping so the `<br>` itself is
 * emitted as a real tag, not escaped.
 */
export function newlineToBr(escapedText: string): string {
  return escapedText.replace(/\r\n|\r|\n/g, '<br>')
}

// --- CSS value whitelists -------------------------------------------------
//
// The encoder writes user-controlled workbook values (`bgColor`, `fgColor`,
// `fontFamily`) into `style="…"`. A malicious workbook author could otherwise
// break out of the declaration and inject `background-image: url(...)` or a
// payload that beacons on paste into Gmail/Notion. We refuse to "sanitise" by
// escaping; values that don't match the whitelist are dropped silently.

const COLOR_HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/**
 * Accept `rgb(r,g,b)` or `rgba(r,g,b,a)` where r/g/b are integers `0..255`
 * (optional leading +; no scientific notation) and `a` is a decimal in
 * `0..1`. Whitespace is permitted between tokens.
 */
function isCssRgbColor(value: string): boolean {
  const m = value
    .trim()
    .match(/^rgba?\(\s*([^)]*)\)$/i)
  if (!m) return false
  const args = m[1]
  if (!args) return false
  const parts = args.split(',').map((p) => p.trim())
  if (parts.length !== 3 && parts.length !== 4) return false
  const isRgba = value.trim().toLowerCase().startsWith('rgba')
  if (isRgba && parts.length !== 4) return false
  if (!isRgba && parts.length !== 3) return false
  for (let i = 0; i < 3; i += 1) {
    const tok = parts[i]
    if (!/^\d{1,3}$/.test(tok)) return false
    const n = Number(tok)
    if (!Number.isInteger(n) || n < 0 || n > 255) return false
  }
  if (parts.length === 4) {
    const a = parts[3]
    // 0, 1, 0.5, .5 — but no exponents, no signs.
    if (!/^(?:0|1|0?\.\d+|1\.0+)$/.test(a)) return false
    const an = Number(a)
    if (!(an >= 0 && an <= 1)) return false
  }
  return true
}

/**
 * Small whitelist of CSS named colors that are safe to pass through. Kept
 * tight on purpose — the typical workbook flow uses hex / rgb. We accept
 * the basic Excel-style colour names so trivial flows don't trip the filter.
 */
const NAMED_COLORS: ReadonlySet<string> = new Set([
  'black',
  'silver',
  'gray',
  'grey',
  'white',
  'maroon',
  'red',
  'purple',
  'fuchsia',
  'green',
  'lime',
  'olive',
  'yellow',
  'navy',
  'blue',
  'teal',
  'aqua',
  'cyan',
  'magenta',
  'orange',
  'transparent',
])

export function sanitizeColor(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined
  const v = String(raw).trim()
  if (v === '') return undefined
  if (COLOR_HEX_RE.test(v)) return v
  if (NAMED_COLORS.has(v.toLowerCase())) return v.toLowerCase()
  if (isCssRgbColor(v)) return v
  return undefined
}

/**
 * Strict allow-list for `font-family`: letters, digits, comma, space, hyphen,
 * single quote, double quote. Anything else (semicolons, parens, colons, `/`,
 * `\`, `<`, `>`, etc.) → reject. We don't try to repair quotes or balance
 * commas; if the input doesn't look like a clean family stack, we drop it.
 */
const FONT_FAMILY_RE = /^[A-Za-z0-9, "'\-]+$/

export function sanitizeFontFamily(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined
  const v = String(raw).trim()
  if (v === '') return undefined
  if (!FONT_FAMILY_RE.test(v)) return undefined
  return v
}

export function sanitizeFontSize(raw: number | undefined | null): string | undefined {
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return undefined
  // Round to 2 decimals to avoid emitting `style="font-size: 1e+30pt"` etc.
  // `toString` on a regular finite positive number is safe.
  return `${raw}pt`
}

