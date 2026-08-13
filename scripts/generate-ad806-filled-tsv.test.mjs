import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'

import { DEFAULT_COLUMN_COUNT, DEFAULT_ROW_COUNT } from './generate-ad806-filled-tsv.mjs'

const runGenerator = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/generate-ad806-filled-tsv.mjs', ...args], {
      cwd: new URL('..', import.meta.url),
    })
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

test('uses the documented ten-million-cell defaults', () => {
  assert.equal(DEFAULT_ROW_COUNT, 10_000)
  assert.equal(DEFAULT_COLUMN_COUNT, 1_000)
})

test('writes deterministic, filled TSV for small CLI dimensions', async () => {
  const result = await runGenerator(['--rows', '2', '--columns', '3'])

  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, 'r0c0\tr0c1\tr0c2\nr1c0\tr1c1\tr1c2\n')
})

test('rejects non-positive dimensions', async () => {
  const result = await runGenerator(['--rows', '0'])

  assert.equal(result.code, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /--rows must be a positive safe integer/)
})
