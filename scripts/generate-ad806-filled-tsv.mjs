#!/usr/bin/env node

import { once } from 'node:events'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_ROW_COUNT = 10_000
export const DEFAULT_COLUMN_COUNT = 1_000

const USAGE = `Usage: node scripts/generate-ad806-filled-tsv.mjs [--rows <count>] [--columns <count>]

Writes a deterministic, filled TSV to stdout. Defaults: 10000 rows and 1000 columns.`

const parsePositiveInteger = (value, option) => {
  if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${option} must be a positive safe integer; received ${value ?? 'nothing'}`)
  }

  return Number(value)
}

export const parseGeneratorOptions = (args) => {
  let rows = DEFAULT_ROW_COUNT
  let columns = DEFAULT_COLUMN_COUNT

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]

    if (option === '--help') return { help: true }
    if (option !== '--rows' && option !== '--columns') {
      throw new Error(`unknown option: ${option}`)
    }

    const value = args[index + 1]
    if (value === undefined) throw new Error(`${option} requires a value`)
    const parsed = parsePositiveInteger(value, option)
    if (option === '--rows') rows = parsed
    else columns = parsed
    index += 1
  }

  return { rows, columns }
}

const makeRow = (rowIndex, columnCount) => {
  let row = `r${rowIndex}c0`
  for (let columnIndex = 1; columnIndex < columnCount; columnIndex += 1) {
    row += `\tr${rowIndex}c${columnIndex}`
  }
  return `${row}\n`
}

const writeChunk = async (output, chunk) => {
  if (!output.write(chunk)) await once(output, 'drain')
}

export const writeFilledTsv = async (output, { rows, columns }) => {
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    await writeChunk(output, makeRow(rowIndex, columns))
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMainModule) {
  try {
    const options = parseGeneratorOptions(process.argv.slice(2))
    if (options.help) process.stdout.write(`${USAGE}\n`)
    else await writeFilledTsv(process.stdout, options)
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`)
    process.exitCode = 1
  }
}
