/** CHOOSE and plain-function reference shape helpers. */
import type { FunctionImpl, Value } from '../../types'
import { propagateError, toNumber } from '../coerce'
import { ERR_VALUE } from './lookup-common'

export const CHOOSE: FunctionImpl = (args, _ctx) => {
  if (args.length < 2) return ERR_VALUE
  if (args[0].kind === 'error') return args[0]
  const index = toNumber(args[0])
  if (!index.ok) return index.error
  const truncated = Math.trunc(index.value)
  return truncated < 1 || truncated >= args.length ? ERR_VALUE : args[truncated]
}

export const ROWS: FunctionImpl = (args, _ctx) => dimensionCount(args, 'rows')
export const COLUMNS: FunctionImpl = (args, _ctx) => dimensionCount(args, 'columns')

export const ROW: FunctionImpl = (args, _ctx) => positionalSequence(args, 'row')
export const COLUMN: FunctionImpl = (args, _ctx) => positionalSequence(args, 'column')

export const ADDRESS: FunctionImpl = (args, _ctx) => {
  if (args.length < 2 || args.length > 5) return ERR_VALUE
  const error = propagateError(args.slice(0, Math.min(args.length, 4)))
  if (error) return error
  const row = toNumber(args[0])
  const column = toNumber(args[1])
  if (!row.ok) return row.error
  if (!column.ok) return column.error
  const rowNumber = Math.trunc(row.value)
  const columnNumber = Math.trunc(column.value)
  if (rowNumber < 1 || columnNumber < 1) return ERR_VALUE
  const absoluteStyle = addressAbsoluteStyle(args[2])
  if (absoluteStyle === undefined) return ERR_VALUE
  const a1 = addressA1(args[3])
  if (a1 === undefined) return ERR_VALUE
  const sheet = addressSheet(args[4])
  if (sheet === null) return ERR_VALUE
  const body = a1
    ? formatA1(rowNumber, columnNumber, absoluteStyle)
    : formatR1C1(rowNumber, columnNumber, absoluteStyle)
  return {
    kind: 'string',
    value:
      sheet === undefined ? body : `${/[^A-Za-z0-9_]/.test(sheet) ? `'${sheet}'` : sheet}!${body}`,
  }
}

function dimensionCount(args: ReadonlyArray<Value>, dimension: 'rows' | 'columns'): Value {
  if (args.length !== 1) return ERR_VALUE
  const value = args[0]
  if (value.kind === 'error') return value
  if (value.kind !== 'array') return { kind: 'number', value: 1 }
  return {
    kind: 'number',
    value: dimension === 'rows' ? value.value.length : (value.value[0]?.length ?? 0),
  }
}

function positionalSequence(args: ReadonlyArray<Value>, dimension: 'row' | 'column'): Value {
  if (args.length === 0) return { kind: 'number', value: 1 }
  if (args.length !== 1) return ERR_VALUE
  const value = args[0]
  if (value.kind === 'error') return value
  if (value.kind !== 'array') return { kind: 'number', value: 1 }
  const size = dimension === 'row' ? value.value.length : (value.value[0]?.length ?? 0)
  const values = Array.from({ length: size }, (_, index) => ({
    kind: 'number' as const,
    value: index + 1,
  }))
  return dimension === 'row'
    ? { kind: 'array', value: values.map((cell) => [cell]) }
    : { kind: 'array', value: [values] }
}

function addressAbsoluteStyle(value: Value | undefined): number | undefined {
  if (value === undefined) return 1
  const number = toNumber(value)
  if (!number.ok) return undefined
  const style = Math.trunc(number.value)
  return style >= 1 && style <= 4 ? style : undefined
}

function addressA1(value: Value | undefined): boolean | undefined {
  if (value === undefined || value.kind === 'blank') return true
  if (value.kind === 'boolean') return value.value
  return value.kind === 'number' ? value.value !== 0 : undefined
}

function addressSheet(value: Value | undefined): string | undefined | null {
  if (value === undefined || value.kind === 'blank') return undefined
  return value.kind === 'string' ? value.value : null
}

function formatA1(row: number, column: number, style: number): string {
  let letters = ''
  for (let value = column; value > 0; value = Math.floor(value / 26)) {
    value -= 1
    letters = String.fromCharCode(65 + (value % 26)) + letters
  }
  return `${style === 1 || style === 3 ? '$' : ''}${letters}${style === 1 || style === 2 ? '$' : ''}${row}`
}

function formatR1C1(row: number, column: number, style: number): string {
  const rowText = style === 1 || style === 2 ? `R${row}` : `R[${row}]`
  const columnText = style === 1 || style === 3 ? `C${column}` : `C[${column}]`
  return rowText + columnText
}
