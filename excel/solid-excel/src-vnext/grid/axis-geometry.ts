export function getAxisOffsetForIndex(
  index: number,
  count: number,
  fallbackSize: number,
  overrides: Record<string, number> | undefined,
  hidden?: ReadonlySet<number>,
): number {
  const clampedIndex = Math.max(0, Math.min(count, Math.trunc(index)))
  let offset = clampedIndex * fallbackSize
  for (const [key, size] of Object.entries(overrides ?? {})) {
    const overrideIndex = Number(key)
    if (!Number.isInteger(overrideIndex) || overrideIndex < 0 || overrideIndex >= clampedIndex) continue
    if (hidden?.has(overrideIndex)) continue
    offset += size - fallbackSize
  }
  if (hidden) {
    for (const hiddenIndex of hidden) {
      if (Number.isInteger(hiddenIndex) && hiddenIndex >= 0 && hiddenIndex < clampedIndex) {
        offset -= fallbackSize
      }
    }
  }
  return Math.max(0, offset)
}

export function getAxisSpanSize(
  start: number,
  end: number,
  count: number,
  fallbackSize: number,
  overrides: Record<string, number> | undefined,
  hidden?: ReadonlySet<number>,
): number {
  if (count <= 0 || end < start) return 0
  const clampedStart = Math.max(0, Math.min(count, Math.trunc(start)))
  const clampedEnd = Math.max(0, Math.min(count - 1, Math.trunc(end)))
  if (clampedEnd < clampedStart) return 0
  return getAxisOffsetForIndex(clampedEnd + 1, count, fallbackSize, overrides, hidden) - getAxisOffsetForIndex(clampedStart, count, fallbackSize, overrides, hidden)
}

export function getAxisStartIndexAtOffset(
  offset: number,
  count: number,
  fallbackSize: number,
  overrides: Record<string, number> | undefined,
  hidden?: ReadonlySet<number>,
): number {
  if (count <= 0) return 0
  const target = Math.max(0, offset)
  let low = 0
  let high = count - 1
  let result = count - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const cellEnd = getAxisOffsetForIndex(mid + 1, count, fallbackSize, overrides, hidden)
    if (cellEnd > target) {
      result = mid
      high = mid - 1
    } else low = mid + 1
  }
  return result
}

export function getAxisEndIndexAtOffset(
  offset: number,
  count: number,
  fallbackSize: number,
  overrides: Record<string, number> | undefined,
  hidden?: ReadonlySet<number>,
): number {
  if (count <= 0) return -1
  const target = Math.max(0, offset)
  let low = 0
  let high = count - 1
  let result = 0
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const cellStart = getAxisOffsetForIndex(mid, count, fallbackSize, overrides, hidden)
    if (cellStart < target) {
      result = mid
      low = mid + 1
    } else high = mid - 1
  }
  return result
}
