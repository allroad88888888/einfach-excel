import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listSpecFiles, planShards, toFileFilters } from './e2e-shard-plan.mjs'
import { averageDurations, fileDurations } from './e2e-shard-timings.mjs'

test('every file lands in exactly one shard and slow files are spread out', () => {
  const timings = { 'a.spec.ts': 100, 'b.spec.ts': 90, 'c.spec.ts': 10, 'd.spec.ts': 10, 'e.spec.ts': 10 }
  const shards = planShards(Object.keys(timings), timings, 2)
  assert.deepEqual(shards.flatMap((shard) => shard.files).sort(), Object.keys(timings))
  // a→1，b→2，c→2（两片都到 100），平局归第一片：d→1，e→2。
  assert.deepEqual(shards.map((shard) => shard.files), [['a.spec.ts', 'd.spec.ts'], ['b.spec.ts', 'c.spec.ts', 'e.spec.ts']])
  assert.deepEqual(shards.map((shard) => shard.seconds), [110, 110])
})

test('files missing from the timing table use the median and stale entries are ignored', () => {
  const timings = { 'a.spec.ts': 30, 'b.spec.ts': 10, 'c.spec.ts': 20, 'gone.spec.ts': 999 }
  const shards = planShards(['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'new.spec.ts'], timings, 2)
  assert.deepEqual(shards.flatMap((shard) => shard.files).sort(), ['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'new.spec.ts'])
  assert.equal(shards.reduce((sum, shard) => sum + shard.seconds, 0), 30 + 10 + 20 + 20)
})

test('the plan is identical on every runner for the same inputs', () => {
  const files = ['x.spec.ts', 'y.spec.ts', 'z.spec.ts']
  assert.deepEqual(planShards(files, {}, 2), planShards([...files].reverse(), {}, 2))
})

test('each filter matches only its own file, including name prefixes and suffixes', () => {
  const all = ['editing/find.spec.ts', 'editing/find-worker.spec.ts', 'workbook/sort.spec.ts', 'workbook/data-sort.spec.ts']
  assert.deepEqual(toFileFilters(['editing/find.spec.ts', 'workbook/sort.spec.ts'], all),
    ['e2e/editing/find.spec.ts', 'e2e/workbook/sort.spec.ts'])
})

test('the real spec tree produces unambiguous filters for every file', () => {
  const files = listSpecFiles()
  assert.ok(files.length > 0)
  assert.equal(toFileFilters(files, files).length, files.length)
})

test('timings keep only the first attempt of each test, summed per file', () => {
  const report = { suites: [{ specs: [
    { file: 'a.spec.ts', tests: [{ results: [{ duration: 1500 }, { duration: 9000 }] }] },
    { file: 'a.spec.ts', tests: [{ results: [{ duration: 500 }] }] },
  ], suites: [{ specs: [{ file: 'b.spec.ts', tests: [{ results: [{ duration: 250 }] }] }] }] }] }
  assert.deepEqual(fileDurations(report), { 'a.spec.ts': 2, 'b.spec.ts': 0.3 })
})

test('several reports average per file, counting only the runs that contain it', () => {
  const run = (file, ms) => ({ suites: [{ specs: [{ file, tests: [{ results: [{ duration: ms }] }] }] }] })
  const both = { suites: [...run('a.spec.ts', 4000).suites, ...run('b.spec.ts', 3000).suites] }
  assert.deepEqual(averageDurations([both, run('a.spec.ts', 2000)]), { 'a.spec.ts': 3, 'b.spec.ts': 3 })
})
