import { expect, test } from 'vitest'
import {
  getAxisEndIndexAtOffset,
  getAxisOffsetForIndex,
  getAxisStartIndexAtOffset,
} from '../src/viewport/axis-geometry'

/** The previous O(K)-per-call implementation, kept as the semantic reference. */
function referenceOffset(
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
    if (!Number.isInteger(overrideIndex) || overrideIndex < 0 || overrideIndex >= clampedIndex) {
      continue
    }
    if (hidden?.has(overrideIndex)) continue
    offset += size - fallbackSize
  }
  for (const hiddenIndex of hidden ?? []) {
    if (Number.isInteger(hiddenIndex) && hiddenIndex >= 0 && hiddenIndex < clampedIndex) {
      offset -= fallbackSize
    }
  }
  return Math.max(0, offset)
}

function random(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
}

test('indexed offsets match the reference for sparse, hidden and malformed sizes', () => {
  const next = random(7)
  for (let round = 0; round < 40; round += 1) {
    const count = 1 + Math.floor(next() * 400)
    const overrides: Record<string, number> = { '-1': 90, x: 40, '2.5': 30 }
    for (let i = 0; i < 60; i += 1) {
      overrides[String(Math.floor(next() * (count + 20)))] = Math.floor(next() * 3) * 20
    }
    const hidden =
      round % 2 ? new Set([0, 3, count - 1, count + 5, Math.floor(next() * count)]) : undefined
    for (let index = -2; index <= count + 2; index += 1) {
      expect(getAxisOffsetForIndex(index, count, 24, overrides, hidden)).toBe(
        referenceOffset(index, count, 24, overrides, hidden),
      )
    }
  }
  expect(getAxisOffsetForIndex(10, 100, 24, undefined)).toBe(240)
  expect(getAxisOffsetForIndex(10, 100, 24, undefined, new Set([2]))).toBe(216)
})

test('offset searches stay inverse to offsets with many explicit sizes', () => {
  const overrides: Record<string, number> = {}
  for (let row = 0; row < 50_000; row += 1) overrides[String(row)] = 22 + (row % 3)
  for (const offset of [0, 1, 999, 250_000, 1_149_000]) {
    const start = getAxisStartIndexAtOffset(offset, 1_048_576, 20, overrides)
    expect(getAxisOffsetForIndex(start, 1_048_576, 20, overrides)).toBeLessThanOrEqual(offset)
    expect(getAxisOffsetForIndex(start + 1, 1_048_576, 20, overrides)).toBeGreaterThan(offset)
    const end = getAxisEndIndexAtOffset(offset + 800, 1_048_576, 20, overrides)
    expect(getAxisOffsetForIndex(end, 1_048_576, 20, overrides)).toBeLessThan(offset + 800 || 1)
  }
})

test('repeated geometry reads enumerate one size map once, not once per call', () => {
  // Scroll frames query the same published map hundreds of times. Re-walking it on
  // every call made scrolling O(K) per query once row heights accumulated (2026-11-03).
  let enumerations = 0
  const sizes: Record<string, number> = {}
  for (let row = 0; row < 1000; row += 1) sizes[String(row * 2)] = 30
  const overrides = new Proxy(sizes, {
    ownKeys(target) {
      enumerations += 1
      return Reflect.ownKeys(target)
    },
  })
  for (let call = 0; call < 1000; call += 1) {
    getAxisOffsetForIndex(call * 7, 1_048_576, 20, overrides)
    getAxisStartIndexAtOffset(call * 500, 1_048_576, 20, overrides)
  }
  expect(enumerations).toBe(1)
})
