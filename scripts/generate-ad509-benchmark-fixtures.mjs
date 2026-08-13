#!/usr/bin/env node

import { once } from 'node:events'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DATA_TIERS = Object.freeze({
  smoke: Object.freeze({ formulaChainRows: 10, gridColumns: 10, gridRows: 10 }),
  small: Object.freeze({ formulaChainRows: 100, gridColumns: 20, gridRows: 100 }),
  medium: Object.freeze({ formulaChainRows: 1_000, gridColumns: 50, gridRows: 1_000 }),
  large: Object.freeze({ formulaChainRows: 10_000, gridColumns: 100, gridRows: 10_000 }),
})

export const DEFAULT_TIER = 'smoke'
export const DEFAULT_SHAPE = 'grid'

const SHAPES = new Set(['grid', 'formula-chain'])
const TIER_NAMES = Object.keys(DATA_TIERS)

const USAGE = `Usage: node scripts/generate-ad509-benchmark-fixtures.mjs [--tier <${TIER_NAMES.join('|')}>] [--shape <grid|formula-chain>] [--list]

Writes a deterministic TSV fixture. Defaults: smoke grid.`

export const parseGeneratorOptions = (args) => {
  let tier = DEFAULT_TIER
  let shape = DEFAULT_SHAPE

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]

    if (option === '--help') return { help: true }
    if (option === '--list') return { list: true }
    if (option !== '--tier' && option !== '--shape') {
      throw new Error(`unknown option: ${option}`)
    }

    const value = args[index + 1]
    if (value === undefined) throw new Error(`${option} requires a value`)
    if (option === '--tier') tier = value
    else shape = value
    index += 1
  }

  if (!Object.hasOwn(DATA_TIERS, tier)) {
    throw new Error(`--tier must be one of ${TIER_NAMES.join(', ')}; received ${tier}`)
  }
  if (!SHAPES.has(shape)) {
    throw new Error(`--shape must be one of grid, formula-chain; received ${shape}`)
  }

  return { shape, tier }
}

const makeGridRow = (rowIndex, columnCount) => {
  const cells = []
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    cells.push(`r${rowIndex}c${columnIndex}`)
  }
  return `${cells.join('\t')}\n`
}

const makeFormulaChainRow = (rowIndex) => (rowIndex === 0 ? '1\n' : `=A${rowIndex}+1\n`)

const writeChunk = async (output, chunk) => {
  if (!output.write(chunk)) await once(output, 'drain')
}

export const writeFixture = async (output, { shape, tier }) => {
  const definition = DATA_TIERS[tier]
  const rowCount = shape === 'grid' ? definition.gridRows : definition.formulaChainRows

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row =
      shape === 'grid'
        ? makeGridRow(rowIndex, definition.gridColumns)
        : makeFormulaChainRow(rowIndex)
    await writeChunk(output, row)
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMainModule) {
  try {
    const options = parseGeneratorOptions(process.argv.slice(2))
    if (options.help) process.stdout.write(`${USAGE}\n`)
    else if (options.list) process.stdout.write(`${JSON.stringify(DATA_TIERS, null, 2)}\n`)
    else await writeFixture(process.stdout, options)
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`)
    process.exitCode = 1
  }
}
