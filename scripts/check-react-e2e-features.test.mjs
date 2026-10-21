import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkFeatureCoverage } from './check-react-e2e-features.mjs'

const row = (id = 'SEL-001', title = 'Shift click') => `| ${id} | Shift 点击扩选 | selection/example.spec.ts | ${title} |`
const report = (expectedStatus = 'passed', results = []) => ({ suites: [{ suites: [{ specs: [{
  file: 'selection/example.spec.ts', title: 'Shift click', tests: [{ expectedStatus, results }],
}] }] }] })

test('one independently registered feature binds one collected executable test, without claiming a run', () => {
  assert.deepEqual(checkFeatureCoverage(row(), report()), { count: 1, errors: [] })
  assert.match(checkFeatureCoverage(row(), report(), true).errors.join(), /没有本次成功/)
})

test('missing and renamed titles fail instead of accepting the same file as coverage', () => {
  assert.match(checkFeatureCoverage(row('SEL-001', 'Other title'), report()).errors.join(), /实际 0/)
  assert.match(checkFeatureCoverage('', report()).errors.join(), /功能表为空/)
})

test('duplicate IDs and reusing one primary test for two features fail', () => {
  const errors = checkFeatureCoverage(`${row()}\n${row()}`, report()).errors.join()
  assert.match(errors, /编号重复/)
  assert.match(errors, /不能替代两个功能点/)
  assert.match(checkFeatureCoverage(`${row()}\n${row('SEL-002')}`, report()).errors.join(), /不能替代/)
})

test('skipped and expected-failing tests never satisfy a feature', () => {
  for (const status of ['skipped', 'failed', 'timedOut'])
    assert.match(checkFeatureCoverage(row(), report(status)).errors.join(), /不能算覆盖/)
})

test('runtime acceptance requires an actual clean pass, not a failed or missing attempt', () => {
  assert.deepEqual(checkFeatureCoverage(row(), report('passed', [{ status: 'passed' }]), true).errors, [])
  for (const results of [[], [{ status: 'failed' }], [{ status: 'skipped' }],
    [{ status: 'failed' }, { status: 'passed' }], [{ status: 'passed' }, { status: 'passed' }]])
    assert.match(checkFeatureCoverage(row(), report('passed', results), true).errors.join(), /没有本次成功/)
})

test('ambiguous test titles and report-level errors cannot pass the gate', () => {
  const input = report()
  input.suites.push(input.suites[0])
  assert.match(checkFeatureCoverage(row(), input).errors.join(), /实际 2/)
  input.errors = [{ message: 'Worker crashed' }]
  assert.match(checkFeatureCoverage(row(), input).errors.join(), /运行错误/)
})

test('metadata collection ignores the outer JSON output settings without overwriting its report', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'react-e2e-metadata-'))
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-react-e2e-features.mjs', import.meta.url))], {
      encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_DIR: directory,
        PLAYWRIGHT_JSON_OUTPUT_NAME: 'acceptance.json', PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(directory, 'full.json') },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /逐项绑定可执行 E2E/)
    assert.deepEqual(readdirSync(directory), [])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
