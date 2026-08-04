// 一句话：由种子数据直接产出一次投影结果的便捷导出。

import type {
  DisplayCell,
  ProjectionRevision,
  RangeProjectionRequest,
  RangeProjectionResult,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import type { StaticSeedCells, StaticSeedMatrix } from '../types'
import { buildProjectionResult } from './projection'
import { buildState, matrixToCells, sparseCellsToCells } from './seed'

export function matrixToDisplayCells(matrix: StaticSeedMatrix): DisplayCell[] {
  return matrixToCells(matrix)
}

export function sparseCellsToDisplayCells(cells: StaticSeedCells): DisplayCell[] {
  return sparseCellsToCells(cells)
}

export function matrixToVisibleProjectionResult(
  matrix: StaticSeedMatrix,
  request: VisibleProjectionRequest,
  revision?: ProjectionRevision,
): VisibleProjectionResult {
  return buildProjectionResult(
    request,
    buildState(matrixToCells(matrix), revision ?? 0),
  ) as VisibleProjectionResult
}

export function matrixToRangeProjectionResult(
  matrix: StaticSeedMatrix,
  request: RangeProjectionRequest,
  revision?: ProjectionRevision,
): RangeProjectionResult {
  return buildProjectionResult(
    request,
    buildState(matrixToCells(matrix), revision ?? 0),
  ) as RangeProjectionResult
}

export function sparseCellsToVisibleProjectionResult(
  cells: StaticSeedCells,
  request: VisibleProjectionRequest,
  revision?: ProjectionRevision,
): VisibleProjectionResult {
  return buildProjectionResult(
    request,
    buildState(sparseCellsToCells(cells), revision ?? 0),
  ) as VisibleProjectionResult
}

export function sparseCellsToRangeProjectionResult(
  cells: StaticSeedCells,
  request: RangeProjectionRequest,
  revision?: ProjectionRevision,
): RangeProjectionResult {
  return buildProjectionResult(
    request,
    buildState(sparseCellsToCells(cells), revision ?? 0),
  ) as RangeProjectionResult
}
