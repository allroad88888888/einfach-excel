import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

// 单次有界实验：只拥有本脚本启动的 browser server 和测试子进程。
const cwd = fileURLToPath(new URL('../', import.meta.url))
const root = path.resolve(cwd, '../..')
const evidence = path.join(root, '.codex-artifacts/react-excel-package-004')
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
const round2 = process.argv.includes('--r2')
const prefix = round2 ? 'input-stall-r2' : 'input-stall-r1'
const statusFile = path.join(evidence, `${prefix}-status.json`)
const status = { started: new Date().toISOString(), nodePid: process.pid,
  budgetMs: round2 ? 300_000 : 600_000, groups: [], browsers: [], budgetExceeded: false }
let currentChild, server
const began = performance.now()
await mkdir(evidence, { recursive: true })
// 禁止意外重跑覆盖证据；若需另一次实验，先由根另定前缀与预算。
try { await readFile(statusFile); throw new Error(`${prefix} status already exists`) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const persist = async () => writeFile(statusFile, JSON.stringify({
  ...status, elapsedMs: performance.now() - began,
}, null, 2) + '\n')
const deadline = setTimeout(() => {
  status.budgetExceeded = true
  // 有界诊断预算，不是对完整验收的超时重启；保留部分结果。
  currentChild?.kill('SIGINT')
  void server?.close()
}, status.budgetMs)
const launch = async condition => {
  server = await chromium.launchServer({ headless: true })
  const identity = {
    condition, pid: server.process().pid, started: new Date().toISOString(),
    connection: createHash('sha256').update(server.wsEndpoint()).digest('hex'),
  }
  status.browsers.push(identity)
  await persist()
  return identity
}
const run = async (name, identity, {
  observe = true, selfCheck = false, profiling = false, grep,
} = {}) => {
  if (status.budgetExceeded) throw new Error('Sampling budget exhausted')
  const output = path.join(evidence, `${prefix}-${name}-results`)
  const json = path.join(evidence, `${prefix}-${name}.json`)
  const log = path.join(evidence, `${prefix}-${name}.log`)
  const args = [cli, 'test', '--config', 'playwright.input-stall.config.ts']
  if (grep) args.push('--grep', grep)
  const row = { name, started: new Date().toISOString(), args, output, json, log,
    browserPid: identity.pid, connection: identity.connection, observe, selfCheck, profiling }
  status.groups.push(row)
  const stream = createWriteStream(log, { flags: 'wx' })
  currentChild = spawn(process.execPath, args, { cwd, env: {
    ...process.env, CI: '', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
    INPUT_STALL_OBSERVE: observe ? '1' : '', INPUT_STALL_SELF_CHECK: selfCheck ? '1' : '',
    INPUT_STALL_PROFILE: profiling ? '1' : '',
    INPUT_STALL_CONDITION: name, INPUT_STALL_BROWSER_PID: String(identity.pid),
    INPUT_STALL_CONNECTION: identity.connection, INPUT_STALL_WS: server.wsEndpoint(),
    INPUT_STALL_JSON: json, INPUT_STALL_OUTPUT: output,
  }, stdio: ['ignore', 'pipe', 'pipe'] })
  row.pid = currentChild.pid
  currentChild.stdout.pipe(stream, { end: false })
  currentChild.stderr.pipe(stream, { end: false })
  await persist()
  const outcome = await new Promise((resolve, reject) => {
    currentChild.once('error', reject)
    currentChild.once('close', (code, signal) => resolve({ code, signal }))
  })
  currentChild = undefined
  await new Promise(resolve => stream.end(resolve))
  Object.assign(row, { ...outcome, ended: new Date().toISOString() })
  try { row.stats = JSON.parse(await readFile(json, 'utf8')).stats }
  catch (error) { row.reportError = String(error) }
  await persist()
  if (outcome.code !== 0) throw new Error(`${name} failed; preserve first result, no retry`)
  return row
}
async function observationFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await observationFiles(filename))
    else if (entry.name === 'input-stall.jsonl') files.push(filename)
  }
  return files
}
async function controlledProfile(identity) {
  // Node 22.19+/24 的内建类型剥离可直接执行这个无依赖 TS 诊断模块。
  const { beginInputStallProfile } = await import('../e2e/support/input-stall-profile.ts')
  const row = { name: 'controlled-profile', kind: 'direct-browser-self-check',
    started: new Date().toISOString(), browserPid: identity.pid, connection: identity.connection }
  status.groups.push(row)
  const events = []
  const record = (kind, facts = {}) => events.push({ kind, utc: new Date().toISOString(),
    nodeMs: performance.now(), ...facts })
  const browser = await chromium.connect(server.wsEndpoint())
  const context = await browser.newContext()
  const page = await context.newPage()
  let capture
  try {
    await page.goto('about:blank')
    const session = await context.newCDPSession(page)
    capture = beginInputStallProfile(session, async () => {
      await page.close({ runBeforeUnload: false })
      if (!page.isClosed()) throw new Error('Controlled target closure not confirmed')
    }, record)
    if (!await capture.ready) throw new Error('Controlled profile start ack missing')
    // 命名函数必须在 start ack 后才进入；不依赖阻塞中再处理 start。
    await page.evaluate(function inputStallKnownSynchronousBlock() {
      const until = performance.now() + 1200
      while (performance.now() < until) { /* 只用于取栈自检 */ }
    })
    const result = await capture.finish()
    row.cleanup = result.status
    if (result.profile) {
      row.profileFile = path.join(evidence, `${prefix}-controlled.cpuprofile`)
      await writeFile(row.profileFile, JSON.stringify(result.profile) + '\n', { flag: 'wx' })
      const profile = result.profile
      row.windowMs = (profile.endTime - profile.startTime) / 1000
      row.profileStartTime = profile.startTime
      row.profileEndTime = profile.endTime
      const known = profile.nodes.filter(n =>
        n.callFrame.functionName === 'inputStallKnownSynchronousBlock')
      const stackIds = new Set(known.map(n => n.id))
      for (let size = -1; size !== stackIds.size;) {
        size = stackIds.size
        for (const n of profile.nodes) if (stackIds.has(n.id))
          for (const id of n.children ?? []) stackIds.add(id)
      }
      row.knownFunctionNodes = known
      row.knownStackSamples = (profile.samples ?? []).filter(id => stackIds.has(id)).length
    }
    if (result.status !== 'stopped' || !result.cleanupConfirmed ||
      !(row.windowMs > 0 && row.windowMs <= 5000) || !(row.knownStackSamples > 0))
      throw new Error('Controlled profile did not prove named-stack hit and bounded stop')
    await page.setContent('<input aria-label="Diagnostic recovery">')
    await page.getByRole('textbox', { name: 'Diagnostic recovery' }).fill('recovered')
    row.inputRecovered = await page.getByRole('textbox', { name: 'Diagnostic recovery' })
      .inputValue() === 'recovered'
    if (!row.inputRecovered) throw new Error('Controlled input recovery missing')
    row.code = 0
  } catch (error) {
    row.error = String(error)
    row.code = 1
    throw error
  } finally {
    if (capture) row.finalCleanup = await capture.finish()
    await context.close()
    await browser.close()
    row.ended = new Date().toISOString()
    await writeFile(path.join(evidence, `${prefix}-controlled-events.jsonl`),
      events.map(e => JSON.stringify(e)).join('\n') + '\n', { flag: 'wx' })
    await persist()
  }
}
try {
  const target = 'copying a statistic never creates a cut token or clears the source on paste$'
  if (round2) {
    const identity = await launch('r2-single-browser')
    await controlledProfile(identity)
    await run('statistics-case', identity, { grep: target, profiling: true })
    await run('table-case', identity, {
      grep: 'Open Tables preserves native tables cell styles and redo at 1280px$', profiling: true,
    })
    const disabled = await run('default-off', identity, { observe: false, grep: target })
    disabled.observationFiles = await observationFiles(disabled.output)
    if (disabled.observationFiles.length) throw new Error('Default-off emitted observation')
  } else {
  let identity = await launch('self-check-and-default-off')
  const disabled = await run('default-off', identity, { observe: false, grep: target })
  disabled.observationFiles = await observationFiles(disabled.output)
  if (disabled.observationFiles.length) throw new Error('Default-off emitted observation')
  const check = await run('self-check', identity, { selfCheck: true, grep: target })
  const records = (await Promise.all((await observationFiles(check.output))
    .map(async filename => (await readFile(filename, 'utf8')).trim().split('\n').map(JSON.parse))))
    .flat()
  check.controlledPause = {
    pageGapMs: Math.max(...records.filter(x => x.kind === 'page-batch')
      .map(x => x.batch.maxBeatGap)),
    profiles: records.filter(x => x.kind === 'rpc' && x.method === 'Profiler.stop' &&
      x.result?.ok).length,
    summaries: records.filter(x => x.kind === 'observer-end'),
  }
  if (!(check.controlledPause.pageGapMs > 1500)) throw new Error('Pause self-check not detected')
  await server.close(); server = undefined
  identity = await launch('fresh-browser')
  await run('fresh', identity)
  await server.close(); server = undefined
  identity = await launch('same-browser-process')
  await run('same-browser-1', identity)
  await run('same-browser-2', identity)
  }
  status.success = true
} catch (error) {
  status.error = String(error)
  process.exitCode = 1
} finally {
  currentChild?.kill('SIGINT')
  await server?.close()
  clearTimeout(deadline)
  status.ended = new Date().toISOString()
  await persist()
}
