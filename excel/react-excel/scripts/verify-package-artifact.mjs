import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import ts from 'typescript'

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(directory, 'dist')
const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
const fail = (message) => { throw new Error(message) }
async function list(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? list(path.join(directory, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]))
  return files.flat().sort()
}
const files = (await list(dist)).filter((file) => file !== 'artifact-manifest.json')
for (const required of ['index.js', 'index.d.ts', 'style.css']) {
  if (!files.includes(required)) fail(`Missing artifact: ${required}`)
}
if (!files.some((file) => /workbook\.worker.*\.js$/.test(file))) fail('Missing module Worker asset')
const forbiddenDependencies = ['@einfach-excel/react-cells', '@einfach-excel/canvas-cells', '@einfach-excel/canvas']
const allowedImports = new Set([...Object.keys(manifest.dependencies), ...Object.keys(manifest.peerDependencies)])
const externalImports = new Set()
const embeddedWasmAssets = []
for (const file of files) {
  if (/(?:^|\/)(?:demo|test|e2e)(?:\/|\.)|\.(?:tsx?|po|map)$/.test(file) && !file.endsWith('.d.ts')) {
    fail(`Non-library artifact: ${file}`)
  }
  if (!/\.(?:js|css|ts)$/.test(file)) continue
  const text = await readFile(path.join(dist, file), 'utf8')
  if (text.includes(path.resolve(directory, '../..')) || text.includes('?worker')
    || /@lingui\/[^'"\s]+\/macro|\.(?:tsx|po)(?:["'\s]|$)/.test(text)) {
    fail(`Uncompiled build input in ${file}`)
  }
  if (file === 'index.js' && /["']\/assets\/workbook\.worker/.test(text)) {
    fail('Worker URL must be relative to the installed library, not the host origin root')
  }
  if (/workbook\.worker.*\.js$/.test(file) && text.includes('data:application/wasm;base64,AGFzb')) {
    embeddedWasmAssets.push(file)
  }
  if (file.endsWith('.css')) continue
  const specifiers = new Set()
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
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
  visit(parsed)
  for (const specifier of specifiers) {
    if (/\.(?:tsx?|po)(?:\?|$)/.test(specifier)) fail(`Source import ${specifier} in ${file}`)
    if (specifier.startsWith('.') || specifier.startsWith('data:')) continue
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0]
    if (forbiddenDependencies.includes(name) || !allowedImports.has(name)) {
      fail(`Undeclared or private external dependency ${specifier} in ${file}`)
    }
    externalImports.add(specifier)
  }
}
if (!embeddedWasmAssets.length && !files.some((file) => file.endsWith('.wasm'))) {
  fail('Missing precompiled WASM in Worker assets')
}
for (const dependency of forbiddenDependencies) {
  if (manifest.dependencies[dependency] || manifest.peerDependencies[dependency]) {
    fail(`Private rendering implementation must be bundled: ${dependency}`)
  }
}
const artifact = {
  files,
  externalImports: [...externalImports].sort(),
  dependencies: manifest.dependencies,
  peerDependencies: manifest.peerDependencies,
  bundledImplementations: forbiddenDependencies,
  embeddedWasmAssets,
  target: 'Browser ESM / React18',
}
await writeFile(path.join(dist, 'artifact-manifest.json'), `${JSON.stringify(artifact, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`)
