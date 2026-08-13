import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'

import { DATA_TIERS, DEFAULT_SHAPE, DEFAULT_TIER } from './generate-ad509-benchmark-fixtures.mjs'

const runGenerator = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['scripts/generate-ad509-benchmark-fixtures.mjs', ...args],
      {
        cwd: new URL('..', import.meta.url),
      },
    )
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (code) => resolve({ code, stderr, stdout }))
  })

test('uses the documented small default fixture', async () => {
  const result = await runGenerator([])
  const rows = result.stdout.trimEnd().split('\n')

  assert.equal(DEFAULT_TIER, 'smoke')
  assert.equal(DEFAULT_SHAPE, 'grid')
  assert.deepEqual(DATA_TIERS.smoke, { formulaChainRows: 10, gridColumns: 10, gridRows: 10 })
  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  assert.equal(rows.length, 10)
  assert.equal(rows[0], 'r0c0\tr0c1\tr0c2\tr0c3\tr0c4\tr0c5\tr0c6\tr0c7\tr0c8\tr0c9')
})

test('writes deterministic TSV for a selected fixture', async () => {
  const first = await runGenerator(['--tier', 'smoke', '--shape', 'formula-chain'])
  const second = await runGenerator(['--tier', 'smoke', '--shape', 'formula-chain'])

  assert.equal(first.code, 0)
  assert.equal(first.stderr, '')
  assert.equal(first.stdout, second.stdout)
  assert.equal(first.stdout, '1\n=A1+1\n=A2+1\n=A3+1\n=A4+1\n=A5+1\n=A6+1\n=A7+1\n=A8+1\n=A9+1\n')
})

test('writes the selected grid dimensions', async () => {
  const result = await runGenerator(['--tier', 'small', '--shape', 'grid'])
  const rows = result.stdout.trimEnd().split('\n')

  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  assert.equal(rows.length, 100)
  assert.equal(rows[0].split('\t').length, 20)
  assert.equal(
    rows.at(-1),
    'r99c0\tr99c1\tr99c2\tr99c3\tr99c4\tr99c5\tr99c6\tr99c7\tr99c8\tr99c9\tr99c10\tr99c11\tr99c12\tr99c13\tr99c14\tr99c15\tr99c16\tr99c17\tr99c18\tr99c19',
  )
})

test('rejects an unknown data tier', async () => {
  const result = await runGenerator(['--tier', 'giant'])

  assert.equal(result.code, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /--tier must be one of smoke, small, medium, large/)
})
