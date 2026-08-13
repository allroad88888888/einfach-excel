import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import {
  classifyCandidatePath,
  measureCandidateComponents,
  parseMeasurementOptions,
} from './measure-ad512-size-composition.mjs'

test('classifies candidate resources without grouping glue into UI', () => {
  assert.equal(classifyCandidatePath('assets/einfach_wasm-CGh2YqaB.js'), 'js_glue')
  assert.equal(classifyCandidatePath('assets/einfach_wasm_bg-F_LgCihr.wasm'), 'wasm')
  assert.equal(classifyCandidatePath('assets/wasm-workbook-worker-CV2cwelL.js'), 'worker')
  assert.equal(classifyCandidatePath('assets/index-Chr7trbY.js'), 'ui')
  assert.equal(classifyCandidatePath('assets/index-8kph3RO0.css'), 'ui')
  assert.equal(classifyCandidatePath('assets/index.js.map'), null)
})

test('measures each candidate resource with raw and deterministic gzip byte counts', () => {
  const root = mkdtempSync(join(tmpdir(), 'ad512-size-composition-'))
  const assets = join(root, 'assets')
  mkdirSync(assets)
  writeFileSync(join(assets, 'einfach_wasm_bg-test.wasm'), Buffer.from([0, 1, 2]))
  writeFileSync(join(assets, 'einfach_wasm-test.js'), 'glue')
  writeFileSync(join(assets, 'wasm-workbook-worker-test.js'), 'worker')
  writeFileSync(join(assets, 'index-test.js'), 'ui')
  writeFileSync(join(root, 'index.html'), '<main></main>')
  writeFileSync(join(assets, 'index.js.map'), '{}')

  try {
    const record = measureCandidateComponents(root, { cwd: root })

    assert.equal(record.candidate_path, '.')
    assert.deepEqual(record.components.wasm, [
      {
        gzip_bytes: record.components.wasm[0].gzip_bytes,
        path: 'assets/einfach_wasm_bg-test.wasm',
        raw_bytes: 3,
      },
    ])
    assert.deepEqual(record.components.js_glue, [
      {
        gzip_bytes: record.components.js_glue[0].gzip_bytes,
        path: 'assets/einfach_wasm-test.js',
        raw_bytes: 4,
      },
    ])
    assert.deepEqual(record.components.worker, [
      {
        gzip_bytes: record.components.worker[0].gzip_bytes,
        path: 'assets/wasm-workbook-worker-test.js',
        raw_bytes: 6,
      },
    ])
    assert.deepEqual(
      record.components.ui.map(({ path, raw_bytes }) => ({ path, raw_bytes })),
      [
        { path: 'assets/index-test.js', raw_bytes: 2 },
        { path: 'index.html', raw_bytes: 13 },
      ],
    )
    assert.ok(record.components.ui.every(({ gzip_bytes }) => gzip_bytes > 0))
    assert.deepEqual(record.excluded_paths, ['assets/index.js.map'])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('requires a candidate directory and the command that produced it', () => {
  assert.deepEqual(
    parseMeasurementOptions([
      '--candidate',
      'excel/solid-excel/dist',
      '--build-command',
      'npm run build',
    ]),
    {
      buildCommand: 'npm run build',
      candidate: 'excel/solid-excel/dist',
    },
  )
  assert.throws(
    () => parseMeasurementOptions(['--candidate', 'excel/solid-excel/dist']),
    /--build-command requires a value/,
  )
})
