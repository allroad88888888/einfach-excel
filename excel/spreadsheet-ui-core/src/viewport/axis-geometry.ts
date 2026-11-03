import { countAxisSizesBefore, getAxisSizeIndex } from './axis-size-index'

/** Calculates pixel geometry for a sparse, optionally hidden spreadsheet axis. */
export function getAxisOffsetForIndex(
  index: number,
  count: number,
  fallbackSize: number,
  overrides: Record<string, number> | undefined,
  hidden?: ReadonlySet<number>,
): number {
  const clampedIndex = Math.max(0, Math.min(count, Math.trunc(index)))
  // Scrolling calls this hundreds of times per frame; never walk every override.
  // 主要写入路径是整数像素（手动尺寸取整、自动适应向上取整），但投影尺寸也接受有限小数；
  // 小数时前缀和与逐项累加的末位浮点可能不同，严格比较的命中边界可能差一格。
  const sizes = getAxisSizeIndex(overrides, hidden)
  const explicit = countAxisSizesBefore(sizes, clampedIndex)
  return Math.max(0, (clampedIndex - explicit) * fallbackSize + sizes.prefix[explicit]!)
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
  return (
    getAxisOffsetForIndex(clampedEnd + 1, count, fallbackSize, overrides, hidden) -
    getAxisOffsetForIndex(clampedStart, count, fallbackSize, overrides, hidden)
  )
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
