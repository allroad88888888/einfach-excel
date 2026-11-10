// 从 CI 合并后的 Playwright JSON 报告记录每个 spec 文件的耗时，供 e2e-shard-plan.mjs 按耗时分片。
// 只取每条用例第一次执行的耗时：重试是异常路径，不代表常态成本。
//
//   gh run download <run-id> -n react-browser-results -D /tmp/results
//   node scripts/e2e-shard-timings.mjs /tmp/results/playwright.json
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const reportPath = process.argv[2]
  if (!reportPath) {
    console.error('用法：node scripts/e2e-shard-timings.mjs <playwright.json>')
    process.exit(1)
  }
  const durations = fileDurations(JSON.parse(readFileSync(reportPath, 'utf8')))
  if (!Object.keys(durations).length) {
    console.error('报告里没有任何用例耗时，拒绝覆盖现有耗时表。')
    process.exit(1)
  }
  writeFileSync(timingsPath, `${JSON.stringify(durations, null, 2)}\n`)
  console.log(`已记录 ${Object.keys(durations).length} 个 spec 文件的耗时 → ${path.relative(process.cwd(), timingsPath)}`)
}
