/** Inline formatting overrides the inherited cell font only for this text run. */
export interface RichTextFormat {
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly color?: string
  readonly fontFamily?: string
  readonly fontSize?: number
}
export interface RichTextRun {
  readonly text: string
  readonly format: RichTextFormat
}

export function validRichText(runs: unknown, text: string): runs is readonly RichTextRun[] {
  if (!Array.isArray(runs) || runs.length > 1024) return false
  let content = ''
  for (const run of runs) {
    if (!run || typeof run.text !== 'string' || !run.format || typeof run.format !== 'object')
      return false
    content += run.text
    if (content.length > 131068 || run.text.includes('\0')) return false
    const f = run.format
    if (
      ['bold', 'italic', 'underline', 'strikethrough'].some(
        (key) => f[key] !== undefined && typeof f[key] !== 'boolean',
      )
    )
      return false
    if (f.color !== undefined && (typeof f.color !== 'string' || !/^#[\da-f]{6}$/i.test(f.color)))
      return false
    if (
      f.fontSize !== undefined &&
      (typeof f.fontSize !== 'number' ||
        !Number.isFinite(f.fontSize) ||
        f.fontSize < 1 ||
        f.fontSize > 512)
    )
      return false
    if (
      f.fontFamily !== undefined &&
      (typeof f.fontFamily !== 'string' ||
        !f.fontFamily ||
        f.fontFamily.length > 128 ||
        /[\u0000-\u001f\u007f]/.test(f.fontFamily))
    )
      return false
  }
  return content === text && Array.from(content).length <= 32767
}
