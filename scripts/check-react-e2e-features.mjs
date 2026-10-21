import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

/** 功能表独立于测试维护；只核对逐项绑定，不把登记数冒充实际通过数。 */
export function checkFeatureCoverage(markdown, report, requireResults = false) {
  const errors = []
  const features = markdown.split('\n').filter(line => /^\| [A-Z]+-\d{3} \|/.test(line)).map(line => {
    const [id, feature, file, title] = line.split('|').slice(1, -1).map(value => value.trim().replace(/^`|`$/g, ''))
    return { id, feature, file, title }
  })
  if (!features.length) errors.push('功能表为空，不能视为全覆盖。')
  const specs = []
  const visit = suite => {
    specs.push(...(suite.specs ?? []))
    for (const child of suite.suites ?? []) visit(child)
  }
  for (const suite of report.suites ?? []) visit(suite)
  if (report.errors?.length) errors.push('Playwright 报告包含采集或运行错误。')
  const ids = new Set()
  const bindings = new Set()
  for (const { id, feature, file, title } of features) {
    if (ids.has(id)) errors.push(`${id}：功能编号重复。`)
    ids.add(id)
    if (!feature || !file?.endsWith('.spec.ts') || !title) {
      errors.push(`${id}：功能点、E2E 文件和完整用例标题均不能为空。`)
      continue
    }
    const key = `${file}\n${title}`
    if (bindings.has(key)) errors.push(`${id}：同一主验收用例不能替代两个功能点。`)
    bindings.add(key)
    const matches = specs.filter(spec => spec.file === file && spec.title === title)
    if (matches.length !== 1) {
      errors.push(`${id} ${feature}：需要恰好一个同文件、同标题用例，实际 ${matches.length} 个。`)
      continue
    }
    const tests = matches[0].tests ?? []
    if (!tests.length || tests.some(test => test.expectedStatus !== 'passed'))
      errors.push(`${id}：skip、fixme、预期失败或没有可执行用例，不能算覆盖。`)
    if (requireResults && tests.some(test => test.results?.length !== 1 ||
      test.results.some(result => result.status !== 'passed')))
      errors.push(`${id}：没有本次成功运行证据，或发生失败、跳过、重试。`)
  }
  return { count: features.length, errors }
}

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const resultsIndex = process.argv.indexOf('--results')
    let report
    if (resultsIndex !== -1) {
      if (!process.argv[resultsIndex + 1]) throw new Error('--results 需要 Playwright JSON 报告路径。')
      report = JSON.parse(readFileSync(process.argv[resultsIndex + 1], 'utf8'))
    } else {
      // 直接采集 Playwright，不扫描源码猜标题，也不启动浏览器或 Vite。
      const collectionEnv = { ...process.env, CI: '1' }
      // 外层 E2E 可以写 JSON 报告；这里只读 stdout，不能继承后覆盖正式报告。
      for (const suffix of ['NAME', 'DIR', 'FILE']) delete collectionEnv[`PLAYWRIGHT_JSON_OUTPUT_${suffix}`]
      const collected = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
        '--filter', '@einfach/react-excel', 'exec', 'playwright', 'test', '--list', '--reporter=json',
      ], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        env: collectionEnv })
      if (collected.error) throw collected.error
      if (collected.status !== 0) throw new Error(collected.stdout + collected.stderr)
      report = JSON.parse(collected.stdout)
    }
    const markdown = readFileSync(new URL('../excel/react-excel/e2e/FEATURES.md', import.meta.url), 'utf8')
    const result = checkFeatureCoverage(markdown, report, resultsIndex !== -1)
    if (result.errors.length) throw new Error(result.errors.join('\n'))
    console.log(resultsIndex !== -1
      ? `✅ ${result.count} 个已登记功能点均有这份报告中的成功 E2E 证据。`
      : `✅ ${result.count} 个已登记功能点逐项绑定可执行 E2E；这是登记校验，不是运行通过或全产品覆盖率。`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
