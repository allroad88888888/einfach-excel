// 从 CI 合并后的 Playwright JSON 报告记录每个 spec 文件的耗时，供 e2e-shard-plan.mjs 按耗时分片。
// 只取每条用例第一次执行的耗时：重试是异常路径，不代表常态成本。
// GitHub runner 之间快慢可差 1.7 倍，单轮报告里每个文件的耗时混着它所在机器的速度；
// 传入多轮报告时按文件取平均，摊薄机器差异。
//
//   gh run download <run-id> -n react-browser-results -D /tmp/results-<run-id>
//   node scripts/e2e-shard-timings.mjs /tmp/results-*/playwright.json
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const timingsPath = fileURLToPath(new URL('../excel/react-excel/e2e/shard-timings.json', import.meta.url))

/** 文件（相对 e2e/）→ 秒，按文件名排序、保留一位小数，保证重新生成时 diff 稳定。 */
export function fileDurations(report) {
  const totals = new Map()
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const first = test.results?.[0]
        if (first) totals.set(spec.file, (totals.get(spec.file) ?? 0) + first.duration / 1000)
      }
    }
    for (const child of suite.suites ?? []) visit(child)
  }
  for (const suite of report.suites ?? []) visit(suite)
  return Object.fromEntries([...totals].sort(([a], [b]) => a.localeCompare(b))
    .map(([file, seconds]) => [file, Math.round(seconds * 10) / 10]))
}

/** 多轮报告按文件取平均；只出现在部分报告里的文件按它出现过的轮次平均。 */
export function averageDurations(reports) {
  const samples = new Map()
  for (const durations of reports.map(fileDurations)) {
    for (const [file, seconds] of Object.entries(durations)) {
      samples.set(file, [...(samples.get(file) ?? []), seconds])
    }
  }
  return Object.fromEntries([...samples].sort(([a], [b]) => a.localeCompare(b)).map(([file, values]) =>
    [file, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10]))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const reportPaths = process.argv.slice(2)
  if (!reportPaths.length) {
    console.error('用法：node scripts/e2e-shard-timings.mjs <playwright.json> [更多轮次的 playwright.json…]')
    process.exit(1)
  }
  const durations = averageDurations(reportPaths.map((file) => JSON.parse(readFileSync(file, 'utf8'))))
  if (!Object.keys(durations).length) {
    console.error('报告里没有任何用例耗时，拒绝覆盖现有耗时表。')
    process.exit(1)
  }
  writeFileSync(timingsPath, `${JSON.stringify(durations, null, 2)}\n`)
  console.log(`已按 ${reportPaths.length} 轮报告记录 ${Object.keys(durations).length} 个 spec 文件的耗时 → `
    + path.relative(process.cwd(), timingsPath))
}
