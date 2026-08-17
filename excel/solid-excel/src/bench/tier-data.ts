// 一句话：AD-509 数据档位在浏览器侧的确定性生成 —— 与 scripts/generate-ad509-benchmark-fixtures.mjs 同一定义。

import type { ImportCellWire } from '../../src-vnext/adapter/worker-protocol'
import type { BenchTierId } from './types'

export interface BenchTierDefinition {
  gridRows: number
  gridColumns: number
  formulaChainRows: number
}

/** 与 docs/AD509_BENCHMARK_DATA_TIERS.md 的档位表逐字段一致。 */
export const BENCH_TIERS: Readonly<Record<BenchTierId, BenchTierDefinition>> = Object.freeze({
  smoke: Object.freeze({ gridRows: 10, gridColumns: 10, formulaChainRows: 10 }),
  small: Object.freeze({ gridRows: 100, gridColumns: 20, formulaChainRows: 100 }),
  medium: Object.freeze({ gridRows: 1_000, gridColumns: 50, formulaChainRows: 1_000 }),
  large: Object.freeze({ gridRows: 10_000, gridColumns: 100, formulaChainRows: 10_000 }),
})

/** 环境记录 workload.dataDefinition 用的不可变引用（ADR 0011）。 */
export const BENCH_DATA_DEFINITION =
  'AD-509 deterministic tiers (docs/AD509_BENCHMARK_DATA_TIERS.md, ' +
  'generator scripts/generate-ad509-benchmark-fixtures.mjs @ be04fef)'

export type BenchDataShape = 'grid' | 'formula-chain'

const CELLS_PER_CHUNK = 10_000

/**
 * 按档位产出导入分块。grid 形状：`r{row}c{col}` 文本填满；formula-chain 形状：
 * 首行为数字 1，其后每行 `=A{n}+1` 引用上一行 —— 与 AD-509 生成器同一字节语义。
 */
export function* tierImportChunks(
  tier: BenchTierId,
  shape: BenchDataShape,
  sheetIdx: number,
): Generator<ImportCellWire[]> {
  const definition = BENCH_TIERS[tier]
  let chunk: ImportCellWire[] = []

  function push(cell: ImportCellWire): ImportCellWire[] | undefined {
    chunk.push(cell)
    if (chunk.length < CELLS_PER_CHUNK) return undefined
    const full = chunk
    chunk = []
    return full
  }

  if (shape === 'grid') {
    for (let row = 0; row < definition.gridRows; row += 1) {
      for (let col = 0; col < definition.gridColumns; col += 1) {
        const full = push({ sheet: sheetIdx, row, col, kind: 'text', value: `r${row}c${col}` })
        if (full) yield full
      }
    }
  } else {
    for (let row = 0; row < definition.formulaChainRows; row += 1) {
      const cell: ImportCellWire =
        row === 0
          ? { sheet: sheetIdx, row, col: 0, kind: 'number', value: 1 }
          : { sheet: sheetIdx, row, col: 0, kind: 'formula', value: `=A${row}+1` }
      const full = push(cell)
      if (full) yield full
    }
  }
  if (chunk.length > 0) yield chunk
}
