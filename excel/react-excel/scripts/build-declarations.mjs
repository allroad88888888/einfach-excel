import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import ts from 'typescript'

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configFile = ts.readConfigFile(path.join(directory, 'tsconfig.lib.json'), ts.sys.readFile)
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, directory)
const program = ts.createProgram(config.fileNames, config.options)
const declarations = new Map()
const emitted = program.emit(undefined, (filename, contents, _bom, _error, sources) => {
  if (!filename.endsWith('.d.ts') || sources?.length !== 1) return
  const source = path.resolve(sources[0].fileName)
  const parsed = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true)
  // CSS 从显式 style.css 导出加载；声明不能再要求宿主识别私有样式路径。
  const statements = parsed.statements.filter((node) => !(ts.isImportDeclaration(node)
    && !node.importClause && ts.isStringLiteral(node.moduleSpecifier)
    && node.moduleSpecifier.text.endsWith('.css')))
  const declaration = ts.factory.updateSourceFile(parsed, statements)
  declarations.set(source.replace(/\.tsx?$/, '.d.ts'), ts.createPrinter().printFile(declaration))
})
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics]
if (diagnostics.length || emitted.emitSkipped) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => directory,
    getCanonicalFileName: (file) => file,
    getNewLine: () => '\n',
  }))
  process.exitCode = 1
} else {
  // 只发布由公开声明可达的类型；私有 DOM 实现与 demo 不进入声明产物。
  const sourceRoot = path.join(directory, 'src')
  const pending = [path.join(sourceRoot, 'index.d.ts')]
  const written = new Set()
  while (pending.length) {
    const filename = pending.pop()
    if (written.has(filename)) continue
    const contents = declarations.get(filename)
    if (contents === undefined || !filename.startsWith(`${sourceRoot}${path.sep}`)) {
      throw new Error(`Public declaration escapes the package: ${filename}`)
    }
    const parsed = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true)
    const visit = (node) => {
      if (ts.isStringLiteral(node) && node.text.startsWith('.') &&
        (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)
          || ts.isLiteralTypeNode(node.parent))) {
        const target = path.resolve(path.dirname(filename), node.text)
        const candidates = [`${target}.d.ts`, path.join(target, 'index.d.ts')]
        const dependency = candidates.find((candidate) => declarations.has(candidate))
        if (!dependency) throw new Error(`Missing declaration for ${node.text} in ${filename}`)
        pending.push(dependency)
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
    const output = path.join(directory, 'dist', path.relative(sourceRoot, filename))
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, contents)
    written.add(filename)
  }
  process.stdout.write(`Public declarations: ${written.size} files\n`)
}
