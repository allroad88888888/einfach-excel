import { mkdtemp, mkdir, readdir, readFile, cp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('../', import.meta.url))
// 按仓库根解析独立证据目录，重建候选不能覆盖旧验收实物与失败记录。
const evidence = path.resolve(root, process.env.REACT_EXCEL_PACKAGE_EVIDENCE_DIR ||
  '.codex-artifacts/react-excel-package-004')
const temporary = await mkdtemp(path.join(tmpdir(), 'react-excel-packed-'))
const stage = path.join(temporary, 'release')
const tarballs = path.join(temporary, 'tarballs')
await mkdir(evidence, { recursive: true })
await mkdir(stage)
await mkdir(tarballs)
const run = (command, args, cwd, name) => {
  const start = new Date().toISOString()
  // 单步 15 分钟上限：子进程挂起（如浅克隆里 changesets 无限 deepen）时尽快失败并留下日志。
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: 15 * 60 * 1000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HUSKY: '0', CI: '1' } })
  const output = `${start}\n${command} ${args.join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}`
  return writeFile(path.join(evidence, `${name}.log`),
    `${output}\nFinished: ${new Date().toISOString()}\nExit: ${result.status}\n`).then(() => {
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`${name} failed (${result.status}); see ${evidence}`)
    return result.stdout
  })
}
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const copy = async (relative, destination = path.join(stage, relative)) => {
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(path.join(root, relative), destination, { recursive: true })
}
// 独立只读对象副本提供既有 main/HEAD 基线；不创建提交、不触碰用户分支。
await run('git', ['clone', '--shared', '--no-checkout', root, stage], root, 'release-checkout')
for (const relative of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'LICENSE', '.changeset']) await copy(relative)
// 只在 mktemp 副本消费现有 Changesets；工作区 pending 计划与版本保持原样。
for (const parent of ['excel', 'packages']) for (const entry of await readdir(path.join(root, parent))) {
  try { await copy(`${parent}/${entry}/package.json`) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
await run(path.join(root, 'node_modules/.bin/changeset'), ['status', '--output', '../plan.json'], stage, 'release-plan')
await run(path.join(root, 'node_modules/.bin/changeset'), ['version'], stage, 'release-version')
await run('npm', ['exec', '--yes', '--package=pnpm@10.15.1', '--', 'pnpm', 'install', '--lockfile-only', '--ignore-scripts'],
  stage, 'release-lockfile')
await run('npm', ['exec', '--yes', '--package=pnpm@10.15.1', '--', 'pnpm', 'install', '--frozen-lockfile', '--ignore-scripts'],
  stage, 'release-install')
const packages = ['excel-wasm', 'spreadsheet-ui-core', 'spreadsheet-ui-styles', 'excel-core-ts', 'react-excel']
const packed = {}
for (const name of packages) {
  const relative = `excel/${name}`
  const source = await json(path.join(root, relative, 'package.json'))
  for (const entry of [...source.files, 'README.md', 'LICENSE', 'NOTICE']) {
    try { await copy(`${relative}/${entry}`) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  await run('npm', ['exec', '--yes', '--package=pnpm@10.15.1', '--', 'pnpm', 'pack', '--pack-destination', tarballs],
    path.join(stage, relative), `pack-${name}`)
  const manifest = await json(path.join(stage, relative, 'package.json'))
  const filename = `${manifest.name.replace('@', '').replaceAll('/', '-')}-${manifest.version}.tgz`
  packed[manifest.name] = { version: manifest.version, file: path.join(tarballs, filename) }
}
if (packed['@einfach/spreadsheet-ui-core'].version !== '0.2.0' || packed['@einfach/react-excel'].version !== '0.1.0')
  throw new Error('Release plan changed; review the React minimum peer before accepting a new plan.')
const consumers = {}
for (const bundler of ['vite', 'rspack']) {
  const directory = path.join(temporary, bundler)
  await mkdir(directory)
  await cp(path.join(root, 'excel/react-excel/package-consumers/host'), directory, { recursive: true })
  await cp(path.join(root, `excel/react-excel/package-consumers/${bundler}`), directory, { recursive: true })
  const packageFile = path.join(directory, 'package.json')
  const manifest = await json(packageFile)
  for (const name of ['@einfach/excel-wasm', '@einfach/spreadsheet-ui-core', '@einfach/react-excel'])
    manifest.dependencies[name] = `file:${packed[name].file}`
  await writeFile(packageFile, `${JSON.stringify(manifest, null, 2)}\n`)
  // 严格 peer 安装，无 workspace link、源码 alias 或 Rust/宏插件。
  await run('npm', ['install', '--ignore-scripts', '--strict-peer-deps', '--no-audit', '--no-fund'], directory, `install-${bundler}`)
  const tree = JSON.parse(await run('npm', ['ls', '--all', '--json'], directory, `dependency-tree-${bundler}`))
  const installed = new Set()
  const inspect = node => Object.entries(node.dependencies ?? {}).forEach(([name, dependency]) => {
    installed.add(name); inspect(dependency)
  })
  inspect(tree)
  for (const name of ['@einfach/excel-core-ts', '@einfach/react-cells', '@einfach/canvas-cells', '@einfach/canvas'])
    if (installed.has(name)) throw new Error(`Unexpected private/fallback dependency: ${name}`)
  await run('npm', ['run', 'typecheck'], directory, `typecheck-${bundler}`)
  await run('npm', ['run', 'build'], directory, `build-${bundler}`)
  consumers[bundler] = { directory, dist: path.join(directory, 'dist') }
}
for (const value of Object.values(packed)) value.sha256 = createHash('sha256').update(await readFile(value.file)).digest('hex')
const result = { created: new Date().toISOString(), temporary, packed, consumers,
  plan: await json(path.join(temporary, 'plan.json')) }
await writeFile(path.join(evidence, 'consumers.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
