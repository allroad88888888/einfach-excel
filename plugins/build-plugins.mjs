import fs from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { build } from 'vite'

const pluginsDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(pluginsDir, '..')

function resolvePluginDirs(arg) {
  if (arg) return [path.resolve(process.cwd(), arg)]
  return fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pluginsDir, entry.name))
    .filter((dir) => {
      const pkgPath = path.join(dir, 'package.json')
      return fs.existsSync(pkgPath) && JSON.parse(fs.readFileSync(pkgPath, 'utf8')).private === false
    })
    .sort()
}

function buildDeclarations(directory, entries) {
  const configFile = ts.readConfigFile(path.join(directory, 'tsconfig.json'), ts.sys.readFile)
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  }
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, directory)
  const options = {
    ...parsedConfig.options,
    noEmit: false,
    emitDeclarationOnly: true,
    declaration: true,
    declarationMap: false,
    paths: {},
    types: ['vite/client'],
  }
  const rootNames = [
    ...Object.values(entries).map((rel) => path.join(directory, rel)),
    path.join(repoRoot, 'excel/react-excel/src/i18n/catalogs.d.ts'),
  ]
  const program = ts.createProgram(rootNames, options)
  const declarations = new Map()
  const emitted = program.emit(undefined, (filename, contents, _bom, _error, sources) => {
    if (!filename.endsWith('.d.ts') || sources?.length !== 1) return
    const source = path.resolve(sources[0].fileName)
    const sf = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true)
    const statements = sf.statements.filter((node) => !(ts.isImportDeclaration(node)
      && !node.importClause && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text.endsWith('.css')))
    const updated = ts.factory.updateSourceFile(sf, statements)
    declarations.set(source.replace(/\.tsx?$/, '.d.ts'), ts.createPrinter().printFile(updated))
  })
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics]
  if (diagnostics.length || emitted.emitSkipped) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => directory,
      getCanonicalFileName: (file) => file,
      getNewLine: () => '\n',
    }))
  }
  const sourceRoot = path.join(directory, 'src')
  const pending = Object.values(entries).map((rel) =>
    path.join(directory, rel).replace(/\.tsx?$/, '.d.ts'))
  const reachable = new Map()
  while (pending.length) {
    const filename = pending.pop()
    if (reachable.has(filename)) continue
    const contents = declarations.get(filename)
    if (contents === undefined || !filename.startsWith(`${sourceRoot}${path.sep}`)) {
      throw new Error(`Public declaration escapes ${path.basename(directory)}: ${filename}`)
    }
    const sf = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true)
    const visit = (node) => {
      if (ts.isStringLiteral(node) && node.text.startsWith('.') &&
        (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)
          || ts.isLiteralTypeNode(node.parent))) {
        const target = path.resolve(path.dirname(filename), node.text)
        const candidates = [`${target}.d.ts`, path.join(target, 'index.d.ts')]
        const dep = candidates.find((candidate) => declarations.has(candidate))
        if (!dep) throw new Error(`Missing declaration for ${node.text} in ${filename}`)
        pending.push(dep)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    reachable.set(path.relative(sourceRoot, filename), contents)
  }
  return reachable
}

async function buildPlugin(directory) {
  const requireFromPlugin = createRequire(path.join(directory, 'package.json'))
  const reactPlugin = requireFromPlugin('@vitejs/plugin-react')
  const react = reactPlugin.default ?? reactPlugin
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
  const indexRel = fs.existsSync(path.join(directory, 'src/index.tsx')) ? 'src/index.tsx' : 'src/index.ts'
  const entries = {
    index: indexRel,
    ...(fs.existsSync(path.join(directory, 'src/core/index.ts'))
      ? { 'core/index': 'src/core/index.ts' } : {}),
  }
  const externals = new Set([
    'react', 'react-dom', '@einfach/core', '@einfach/react',
    '@einfach-excel/react-excel', '@einfach-excel/spreadsheet-ui-core',
    '@lingui/core', '@lingui/react',
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ])
  await rm(path.join(directory, 'dist'), { recursive: true, force: true })
  await build({
    configFile: false,
    root: directory,
    logLevel: 'warn',
    publicDir: false,
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      minify: true,
      lib: {
        entry: entries,
        formats: ['es'],
        cssFileName: 'style',
        fileName: (_format, entryName) => `${entryName}.js`,
      },
      rolldownOptions: {
        treeshake: { moduleSideEffects: true },
        output: { minify: true, comments: { annotation: true, legal: true, jsdoc: false } },
        external: (id) => {
          if (id.startsWith('.') || path.isAbsolute(id) || id.startsWith('\0')) return false
          const pkg = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0]
          return externals.has(pkg)
        },
      },
    },
  })
  const declarations = buildDeclarations(directory, entries)
  for (const [rel, contents] of declarations) {
    const outFile = path.join(directory, 'dist', rel)
    await mkdir(path.dirname(outFile), { recursive: true })
    await writeFile(outFile, contents)
  }
  process.stdout.write(`Built ${manifest.name} (${declarations.size} declaration files)\n`)
}

for (const dir of resolvePluginDirs(process.argv[2])) {
  await buildPlugin(dir)
}
