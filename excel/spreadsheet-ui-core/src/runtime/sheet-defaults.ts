/** Initial native worksheet defaults. Explicit row/column/cell settings take precedence. */
export interface SheetDefaults {
  readonly rowHeight?: number
  readonly colWidth?: number
  readonly fontSize?: number
}
export function snapshotSheetDefaults(input: SheetDefaults | undefined): SheetDefaults | undefined {
  if (input === undefined) return undefined
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid worksheet defaults.')
  const result: Record<string, number> = {}
  const limits = [['rowHeight', 16, 512], ['colWidth', 40, 1024], ['fontSize', 1, 512]] as const
  for (const [key, min, max] of limits) {
    const value = input[key]
    if (value === undefined) continue
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`Invalid ${key}: use an integer from ${min} to ${max}.`)
    result[key] = value
  }
  return Object.keys(result).length ? Object.freeze(result) : undefined
}
