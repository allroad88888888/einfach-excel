import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const evidence = path.join(root, '.codex-artifacts/react-excel-package-004')
const manifest = path.join(evidence, 'frozen-inputs.json')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const files = new Map()
const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
for (const relative of listed) {
  // 报告/任务账本可只读审阅和收尾；源码、测试、配置与功能登记不能在运行中变更。
  if (relative.startsWith('.tasks/') || relative.startsWith('.project-lines/')) continue
  if (!relative.endsWith('.md') ||
    relative === 'excel/react-excel/e2e/FEATURES.md' || relative.startsWith('.changeset/'))
    files.set(relative, path.join(root, relative))
}
async function addDirectory(directory, prefix) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name), key = `${prefix}/${entry.name}`
    if (entry.isDirectory()) await addDirectory(filename, key)
    else files.set(key, filename)
  }
}
for (const relative of ['excel/react-excel/dist', 'excel/excel-wasm/lite', 'excel/excel-wasm/full',
  'excel/spreadsheet-ui-core/esm', 'excel/spreadsheet-ui-core/cjs', 'excel/spreadsheet-ui-core/@types'])
  await addDirectory(path.join(root, relative), relative)
const consumersFile = path.join(evidence, 'consumers.json')
files.set('consumer-manifest', consumersFile)
const consumers = JSON.parse(await readFile(consumersFile, 'utf8'))
for (const [name, value] of Object.entries(consumers.consumers))
  await addDirectory(value.dist, `consumer:${name}/dist`)
for (const [name, value] of Object.entries(consumers.packed)) files.set(`tarball:${name}`, value.file)
const entries = []
for (const [key, filename] of [...files].sort(([a], [b]) => a.localeCompare(b)))
  entries.push({ key, filename, sha256: hash(await readFile(filename)) })
const aggregate = hash(JSON.stringify(entries.map(({ key, sha256 }) => [key, sha256])))
if (process.argv.includes('--verify')) {
  const previous = JSON.parse(await readFile(manifest, 'utf8'))
  const before = new Map(previous.entries.map(entry => [entry.key, entry.sha256]))
  const after = new Map(entries.map(entry => [entry.key, entry.sha256]))
  const changed = [...new Set([...before.keys(), ...after.keys()])]
    .filter(key => before.get(key) !== after.get(key))
  await writeFile(path.join(evidence, 'frozen-verification.json'), JSON.stringify({
    verified: new Date().toISOString(), aggregate, count: entries.length, changed,
  }, null, 2) + '\n')
  if (changed.length) throw new Error(`Frozen inputs changed: ${changed.join(', ')}`)
  console.log(`Frozen inputs unchanged: ${entries.length}, SHA256 ${aggregate}`)
} else {
  await writeFile(manifest, JSON.stringify({ frozen: new Date().toISOString(), aggregate, entries }, null, 2) + '\n')
  console.log(`Frozen inputs: ${entries.length}, SHA256 ${aggregate}`)
}
