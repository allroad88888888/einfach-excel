import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const pluginsDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(pluginsDir, '..')
const forbiddenCorePackages = new Set([
  'react', 'react-dom', '@einfach/react', '@lingui/react', '@einfach-excel/react-excel',
])

async function listFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? listFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]))
  return nested.flat().sort()
}

function collectSpecifiers(filename, text) {
  const specifiers = new Set()
  const sf = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true)
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.add(node.moduleSpecifier.text)
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteral(node.argument.literal)) specifiers.add(node.argument.literal.text)
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && ts.isStringLiteral(node.arguments[0])) specifiers.add(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return specifiers
}

async function verifyPlugin(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  const dist = path.join(directory, 'dist')
  const files = await listFiles(dist)
  const hasCore = fs.existsSync(path.join(directory, 'src/core/index.ts'))
  const hasCss = (await listFiles(path.join(directory, 'src'))).some((file) => file.endsWith('.css'))
  const required = [
    'index.js', 'index.d.ts',
    ...(hasCore ? ['core/index.js', 'core/index.d.ts'] : []),
    ...(hasCss ? ['style.css'] : []),
  ]
  for (const req of required) {
    if (!files.includes(req)) throw new Error(`${manifest.name}: missing dist/${req}`)
  }
  const allowed = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ])
  const graph = new Map()
  for (const file of files) {
    if (/(?:^|\/)(?:test|e2e)(?:\/|\.)|\.(?:tsx?|po|map)$/.test(file) && !file.endsWith('.d.ts')) {
      throw new Error(`${manifest.name}: unexpected artifact dist/${file}`)
    }
    if (!/\.(?:js|ts|css)$/.test(file)) continue
    const text = await readFile(path.join(dist, file), 'utf8')
    if (text.includes(repoRoot)) throw new Error(`${manifest.name}: leaked repo path in dist/${file}`)
    if (file.endsWith('.css')) continue
    const specifiers = collectSpecifiers(file, text)
    graph.set(file, specifiers)
    for (const spec of specifiers) {
      if (/\.(?:tsx?|po)(?:\?|$)/.test(spec)) throw new Error(`${manifest.name}: source import ${spec} in ${file}`)
      if (spec.startsWith('.')) continue
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
      if (!allowed.has(pkg)) {
        throw new Error(`${manifest.name}: undeclared external dependency ${spec} in dist/${file}`)
      }
    }
  }
  if (hasCore) {
    for (const rootEntry of ['core/index.js', 'core/index.d.ts']) {
      const seen = new Set()
      const queue = [rootEntry]
      while (queue.length) {
        const current = queue.pop()
        if (seen.has(current)) continue
        seen.add(current)
        for (const spec of graph.get(current) ?? []) {
          if (spec.startsWith('.')) {
            const base = path.posix.normalize(path.posix.join(path.posix.dirname(current), spec))
            const ext = rootEntry.endsWith('.d.ts') ? '.d.ts' : ''
            for (const candidate of [base, `${base}${ext}`, `${base}/index${ext}`]) {
              if (graph.has(candidate)) queue.push(candidate)
            }
          } else {
            const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
            if (forbiddenCorePackages.has(pkg)) {
              throw new Error(`${manifest.name}: headless /core leaked view dependency ${spec} via ${current}`)
            }
          }
        }
      }
    }
  }
  for (const requiredDoc of ['README.md', 'LICENSE']) {
    if (!fs.existsSync(path.join(directory, requiredDoc))) {
      throw new Error(`${manifest.name}: missing ${requiredDoc}`)
    }
  }
  if (manifest.name === '@einfach-excel/plugin-chart') {
    const runtimeFile = files.find((file) => /^echarts-runtime.*\.js$/.test(file))
    const runtimeText = runtimeFile ? await readFile(path.join(dist, runtimeFile), 'utf8') : ''
    if (!runtimeText.includes('CanvasRenderer') || !runtimeText.includes('SVGRenderer')) {
      throw new Error('@einfach-excel/plugin-chart: echarts-runtime lost renderer registration')
    }
  }
}

async function verifyXlsx() {
  const xlsxDir = path.join(repoRoot, 'excel/xlsx-wasm')
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: xlsxDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }))
  const files = packed.files.map((entry) => entry.path)
  for (const req of [
    'package.json', 'README.md', 'LICENSE', 'NOTICE',
    'dist/einfach_xlsx.js', 'dist/einfach_xlsx.d.ts',
    'dist/einfach_xlsx_bg.wasm', 'dist/THIRD_PARTY_NOTICES.txt',
  ]) {
    if (!files.includes(req)) throw new Error(`@einfach-excel/xlsx: missing packed file ${req}`)
  }
}

const dirs = process.argv[2]
  ? [path.resolve(process.cwd(), process.argv[2])]
  : fs.readdirSync(pluginsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(pluginsDir, entry.name))
      .filter((dir) => {
        const pkgPath = path.join(dir, 'package.json')
        return fs.existsSync(pkgPath) && JSON.parse(fs.readFileSync(pkgPath, 'utf8')).private === false
      })
      .sort()

for (const dir of dirs) await verifyPlugin(dir)
if (!process.argv[2]) await verifyXlsx()
process.stdout.write(`Verified ${dirs.length} plugin artifact(s)${process.argv[2] ? '' : ' and @einfach-excel/xlsx'}\n`)
