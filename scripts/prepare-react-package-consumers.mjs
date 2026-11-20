import { mkdtemp, mkdir, readdir, readFile, cp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
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
// clone 只带走本地分支；PR 的 checkout 是 detached 合并提交、没有本地 main，`changeset status`
// 找不到比较基线。对象经 --shared 共享，直接补一个指向源仓库 main（或 origin/main）的 ref。
const commitOf = (ref, cwd) => spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
  { cwd, encoding: 'utf8' }).stdout.trim()
if (!commitOf('refs/heads/main', stage)) {
  const base = commitOf('refs/heads/main', root) || commitOf('refs/remotes/origin/main', root)
  if (!base) throw new Error('release-checkout: neither main nor origin/main exists to compare changesets against')
  await run('git', ['update-ref', 'refs/heads/main', base], stage, 'release-base')
}
for (const relative of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'LICENSE', '.changeset']) await copy(relative)
// 只在 mktemp 副本消费现有 Changesets；工作区 pending 计划与版本保持原样。
for (const parent of ['excel', 'packages', 'plugins']) {
  const entries = await readdir(path.join(root, parent), { withFileTypes: true })
  for (const entry of entries.filter(entry => entry.isDirectory())) {
    try { await copy(`${parent}/${entry.name}/package.json`) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}
// 发版后没有在途 changeset：no-checkout 副本里其余文件都算"已删除"，`changeset status`
// 会因"有改动却无 changeset"失败；此时直接按当前版本打包。
const pending = (await readdir(path.join(stage, '.changeset')))
  .filter(file => file.endsWith('.md') && file !== 'README.md')
if (pending.length > 0) {
  await run(path.join(root, 'node_modules/.bin/changeset'), ['status', '--output', '../plan.json'], stage, 'release-plan')
  await run(path.join(root, 'node_modules/.bin/changeset'), ['version'], stage, 'release-version')
} else {
  await writeFile(path.join(temporary, 'plan.json'), `${JSON.stringify({ changesets: [], releases: [] }, null, 2)}\n`)
}
await run('npm', ['exec', '--yes', '--package=pnpm@10.15.1', '--', 'pnpm', 'install', '--lockfile-only', '--ignore-scripts'],
  stage, 'release-lockfile')
await run('npm', ['exec', '--yes', '--package=pnpm@10.15.1', '--', 'pnpm', 'install', '--frozen-lockfile', '--ignore-scripts'],
  stage, 'release-install')

const excelPackages = [
  'excel-wasm', 'spreadsheet-ui-core', 'spreadsheet-ui-styles',
  'excel-core-ts', 'react-excel', 'xlsx-wasm',
].map(name => `excel/${name}`)
const pluginEntries = (await readdir(path.join(root, 'plugins'), { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()
const pluginPackages = []
for (const name of pluginEntries) {
  const manifest = await json(path.join(root, 'plugins', name, 'package.json'))
  if (name === 'plugin-sample') {
    if (manifest.private !== true) throw new Error('plugin-sample must remain private: true')
    continue
  }
  if (manifest.private === false) pluginPackages.push(`plugins/${name}`)
}
if (pluginPackages.length !== 11) {
  throw new Error(`Expected 11 public plugins, found ${pluginPackages.length}`)
}

const packed = {}
for (const relative of [...excelPackages, ...pluginPackages]) {
  const slug = relative.replaceAll('/', '-')
  const source = await json(path.join(root, relative, 'package.json'))
  for (const entry of [...(source.files ?? []), 'README.md', 'LICENSE', 'NOTICE']) {
    try { await copy(`${relative}/${entry}`) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  await run('npm', ['exec', '--yes', '--package=pnpm@10.15.1', '--', 'pnpm', 'pack', '--pack-destination', tarballs],
    path.join(stage, relative), `pack-${slug}`)
  const manifest = await json(path.join(stage, relative, 'package.json'))
  const filename = `${manifest.name.replace('@', '').replaceAll('/', '-')}-${manifest.version}.tgz`
  packed[manifest.name] = { version: manifest.version, file: path.join(tarballs, filename) }
}

// 稳在 0.x 演进策略：fixed 核心组升至 0.3.0，react-excel 因 peer >=0.2.0 <1.0.0 保持 0.2.0，
// 新公开的 xlsx 与 11 个业务插件保持 0.x（首发 0.1.0），不得误升至 1.0.0。
const reactCandidate = await json(path.join(stage, 'excel/react-excel/package.json'))
if (packed['@einfach-excel/spreadsheet-ui-core'].version !== '0.3.0' ||
  packed['@einfach-excel/excel-wasm'].version !== '0.3.0' ||
  packed['@einfach-excel/react-excel'].version !== '0.2.0' ||
  reactCandidate.peerDependencies['@einfach-excel/spreadsheet-ui-core'] !== '>=0.2.0 <1.0.0') {
  throw new Error(`Unexpected 0.x release plan: ui-core=${packed['@einfach-excel/spreadsheet-ui-core'].version}, react-excel=${packed['@einfach-excel/react-excel'].version}`)
}
if (!packed['@einfach-excel/xlsx'].version.startsWith('0.')) {
  throw new Error(`@einfach-excel/xlsx left 0.x: ${packed['@einfach-excel/xlsx'].version}`)
}
for (const relative of pluginPackages) {
  const manifest = await json(path.join(stage, relative, 'package.json'))
  const entry = packed[manifest.name]
  if (!entry?.version.startsWith('0.')) throw new Error(`${manifest.name} left 0.x: ${entry?.version}`)
  const tarManifest = JSON.parse(execFileSync('tar', ['-xOf', entry.file, 'package/package.json'], { encoding: 'utf8' }))
  if (tarManifest.exports?.['.']?.import !== './dist/index.js' ||
    tarManifest.exports?.['./core']?.import !== './dist/core/index.js') {
    throw new Error(`${manifest.name} tarball exports were not rewritten to dist/: ${JSON.stringify(tarManifest.exports)}`)
  }
}

const consumerTarballPackages = [
  '@einfach-excel/excel-wasm',
  '@einfach-excel/spreadsheet-ui-core',
  '@einfach-excel/react-excel',
  '@einfach-excel/xlsx',
  '@einfach-excel/plugin-chart',
  '@einfach-excel/plugin-cell-appearance',
  '@einfach-excel/plugin-date-picker',
]
const consumers = {}
for (const bundler of ['vite', 'rspack']) {
  const directory = path.join(temporary, bundler)
  await mkdir(directory)
  await cp(path.join(root, 'excel/react-excel/package-consumers/host'), directory, { recursive: true })
  await cp(path.join(root, `excel/react-excel/package-consumers/${bundler}`), directory, { recursive: true })
  const packageFile = path.join(directory, 'package.json')
  const manifest = await json(packageFile)
  for (const name of consumerTarballPackages) manifest.dependencies[name] = `file:${packed[name].file}`
  await writeFile(packageFile, `${JSON.stringify(manifest, null, 2)}\n`)
  // 严格 peer 安装，无 workspace link、源码 alias 或 Rust/宏插件。
  await run('npm', ['install', '--ignore-scripts', '--strict-peer-deps', '--no-audit', '--no-fund'], directory, `install-${bundler}`)
  const tree = JSON.parse(await run('npm', ['ls', '--all', '--json'], directory, `dependency-tree-${bundler}`))
  const installed = new Set()
  const versionsByName = new Map()
  const inspect = node => Object.entries(node.dependencies ?? {}).forEach(([name, dependency]) => {
    installed.add(name)
    if (dependency.version) {
      if (!versionsByName.has(name)) versionsByName.set(name, new Set())
      versionsByName.get(name).add(dependency.version)
    }
    inspect(dependency)
  })
  inspect(tree)
  for (const singleton of [
    'react', 'react-dom', '@einfach/core', '@einfach/react',
    '@einfach-excel/spreadsheet-ui-core', '@einfach-excel/react-excel',
    '@lingui/core', '@lingui/react',
  ]) {
    const versions = [...(versionsByName.get(singleton) ?? [])]
    if (versions.length !== 1) {
      throw new Error(`Duplicate or missing singleton ${singleton} in ${bundler}: ${versions.join(', ')}`)
    }
  }
  for (const name of [
    '@einfach-excel/excel-core-ts', '@einfach-excel/react-cells',
    '@einfach-excel/canvas-cells', '@einfach-excel/canvas', '@einfach-excel/plugin-sample',
  ]) {
    if (installed.has(name)) throw new Error(`Unexpected private/fallback dependency: ${name}`)
  }
  await run('npm', ['run', 'typecheck'], directory, `typecheck-${bundler}`)
  await run('npm', ['run', 'build'], directory, `build-${bundler}`)
  consumers[bundler] = { directory, dist: path.join(directory, 'dist') }
}
for (const value of Object.values(packed)) value.sha256 = createHash('sha256').update(await readFile(value.file)).digest('hex')
const result = { created: new Date().toISOString(), temporary, packed, consumers,
  plan: await json(path.join(temporary, 'plan.json')) }
await writeFile(path.join(evidence, 'consumers.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
