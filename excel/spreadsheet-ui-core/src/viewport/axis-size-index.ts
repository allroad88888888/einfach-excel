/** Sorted prefix sums over one sparse axis size map, so offsets cost O(log K) instead of O(K). */
export interface AxisSizeIndex {
  /** Ascending axis indices that carry an explicit size (hidden ones as 0px). */
  readonly indices: Float64Array
  /** `prefix[i]` is the summed explicit size of `indices[0..i)`. */
  readonly prefix: Float64Array
}

const EMPTY_INDEX: AxisSizeIndex = { indices: new Float64Array(0), prefix: new Float64Array(1) }
const NO_OVERRIDES: Record<string, number> = Object.freeze({})
const byOverrides = new WeakMap<object, AxisSizeIndex>()
const byHidden = new WeakMap<object, WeakMap<ReadonlySet<number>, AxisSizeIndex>>()

/**
 * Size maps are immutable atom state: any change publishes a new object, so the
 * object identity is the cache key and scrolling reuses one index per map.
 * 契约：传进来的尺寸 map 与 hidden Set 读过之后不得原地修改，否则会一直读到旧索引；
 * 一次性的临时 map 也能用，只是每个新对象都要建一次索引。
 */
export function getAxisSizeIndex(
  overrides: Record<string, number> | undefined,
  hidden?: ReadonlySet<number>,
): AxisSizeIndex {
  if (!hidden?.size) {
    if (overrides === undefined) return EMPTY_INDEX
    let index = byOverrides.get(overrides)
    if (!index) byOverrides.set(overrides, (index = buildAxisSizeIndex(overrides, undefined)))
    return index
  }
  const source = overrides ?? NO_OVERRIDES
  let perHidden = byHidden.get(source)
  if (!perHidden) byHidden.set(source, (perHidden = new WeakMap()))
  let index = perHidden.get(hidden)
  if (!index) perHidden.set(hidden, (index = buildAxisSizeIndex(source, hidden)))
  return index
}

/** Counts indexed entries strictly before `axisIndex`. */
export function countAxisSizesBefore(index: AxisSizeIndex, axisIndex: number): number {
  const { indices } = index
  let low = 0
  let high = indices.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (indices[mid]! < axisIndex) low = mid + 1
    else high = mid
  }
  return low
}

function buildAxisSizeIndex(
  overrides: Record<string, number>,
  hidden: ReadonlySet<number> | undefined,
): AxisSizeIndex {
  const entries: [number, number][] = []
  for (const [key, size] of Object.entries(overrides)) {
    const index = Number(key)
    if (Number.isInteger(index) && index >= 0 && !hidden?.has(index)) entries.push([index, size])
  }
  // A hidden index occupies 0px whether or not it also carries an explicit size.
  for (const index of hidden ?? []) {
    if (Number.isInteger(index) && index >= 0) entries.push([index, 0])
  }
  entries.sort((left, right) => left[0] - right[0])
  const indices = new Float64Array(entries.length)
  const prefix = new Float64Array(entries.length + 1)
  entries.forEach(([index, size], position) => {
    indices[position] = index
    prefix[position + 1] = prefix[position]! + size
  })
  return { indices, prefix }
}
