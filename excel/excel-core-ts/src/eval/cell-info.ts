/**
 * `CELL` 函数。
 *
 * 职责：按第一个实参的 info_type，报出目标格的一项元信息 —— 地址、行列号、
 * 内容、类型、前缀、宽度、保护、颜色、括号、格式、文件名。
 *
 * 与 `reference-info.ts` 里那一族的差别：那些函数各自只答一件事，`CELL` 一个
 * 函数就要答十二件，它自己的 switch 值得单开一个文件。
 */
import type { EvalContext, Expr, Value } from '../types'
import { formatA1 } from '../refs'
import { ERR } from './error-value'
import { topLeftRuntimeRef, validateRuntimeRefSheet, type RuntimeRef } from './runtime-ref'
import type { RefInfoDeps } from './reference-info'

export function evaluateCellInfo(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: RefInfoDeps,
): Value {
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!', 'CELL expects 1 or 2 arguments')
  const infoValue = deps.evaluate(args[0], ctx)
  if (infoValue.kind === 'error') return infoValue
  if (infoValue.kind !== 'string') return ERR('#VALUE!')
  const infoType = infoValue.value.toLowerCase()

  let target: RuntimeRef
  if (args.length === 2) {
    const resolved = deps.resolveRef(args[1], ctx)
    if (!resolved.ok) return resolved.error ?? ERR('#VALUE!')
    target = topLeftRuntimeRef(resolved.ref)
  } else {
    if (!ctx.currentCell) return ERR('#REF!')
    target = {
      range: {
        rowStart: ctx.currentCell.row,
        rowEnd: ctx.currentCell.row,
        colStart: ctx.currentCell.col,
        colEnd: ctx.currentCell.col,
      },
    }
  }
  const sheetError = validateRuntimeRefSheet(target, ctx)
  if (sheetError) return sheetError

  switch (infoType) {
    case 'address':
      return {
        kind: 'string',
        value: formatCellAddress(target),
      }
    case 'row':
      return { kind: 'number', value: target.range.rowStart + 1 }
    case 'col':
    case 'column':
      return { kind: 'number', value: target.range.colStart + 1 }
    case 'contents':
      return deps.evaluateRuntimeRef(target, ctx, true)
    case 'type': {
      const value = deps.evaluateRuntimeRef(target, ctx, true)
      if (value.kind === 'blank') return { kind: 'string', value: 'b' }
      if (value.kind === 'string') return { kind: 'string', value: 'l' }
      return { kind: 'string', value: 'v' }
    }
    case 'prefix': {
      const value = deps.evaluateRuntimeRef(target, ctx, true)
      return { kind: 'string', value: value.kind === 'string' ? "'" : '' }
    }
    case 'width':
      return { kind: 'number', value: 8 }
    case 'protect':
      return { kind: 'number', value: 1 }
    case 'color':
    case 'parentheses':
      return { kind: 'number', value: 0 }
    case 'format':
      return { kind: 'string', value: 'G' }
    case 'filename':
      return { kind: 'string', value: '' }
    default:
      return ERR('#VALUE!')
  }
}

function formatCellAddress(ref: RuntimeRef): string {
  const address = formatA1({
    row: ref.range.rowStart,
    col: ref.range.colStart,
    absRow: true,
    absCol: true,
  })
  if (!ref.sheetName) return address
  return `${formatSheetAddressPrefix(ref.sheetName)}!${address}`
}

function formatSheetAddressPrefix(sheetName: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheetName)) return sheetName
  return `'${sheetName.replace(/'/g, "''")}'`
}
