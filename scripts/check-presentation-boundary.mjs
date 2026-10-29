import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

// 这里只检查能稳定机械判断的边界；抽象是否有必要由 react-excel/SKILL.md 审查。
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reactSourceRoot = path.join(repositoryRoot, 'excel/react-excel/src')
const reactCellsSourceRoot = path.join(repositoryRoot, 'packages/react-cells/src')
const canvasCellsSourceRoot = path.join(repositoryRoot, 'packages/canvas-cells/src')
const uiCoreSourceRoot = path.join(repositoryRoot, 'excel/spreadsheet-ui-core/src')
const sourceExtensions = new Set(['.ts', '.tsx'])
const violations = []

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(entryPath)
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : []
  })
}

function report(filePath, node, message) {
  const sourceFile = node.getSourceFile()
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  violations.push(
    `${path.relative(repositoryRoot, filePath)}:${location.line + 1}:${location.character + 1} ${message}`,
  )
}

function importedName(specifier) {
  return specifier.propertyName?.text ?? specifier.name.text
}

function reactRelativePath(filePath) {
  return path.relative(reactSourceRoot, filePath).split(path.sep).join('/')
}

function isDemoHostFile(filePath) {
  const relativePath = reactRelativePath(filePath)
  return (
    relativePath === 'app/App.tsx' ||
    relativePath === 'page/DemoPage.tsx' ||
    relativePath === 'page/PageSidebar.tsx'
  )
}

function isConcreteDemoInfrastructureFile(filePath) {
  const relativePath = reactRelativePath(filePath)
  return (
    relativePath.startsWith('page/demo/') &&
    (relativePath.includes('/runtime/') || relativePath.includes('/view/'))
  )
}

function isWorkerLikeTypeImport(filePath, node) {
  const relative = reactRelativePath(filePath)
  if (relative !== 'page/WorkbookRuntimeProvider.tsx' && relative !== 'worker/create-workbook-worker.ts') return false
  const clause = node.importClause
  return !clause?.name && clause?.namedBindings && ts.isNamedImports(clause.namedBindings) &&
    clause.namedBindings.elements.length === 1 && clause.namedBindings.elements.every(specifier =>
    importedName(specifier) === 'WorkerLike' && (clause.isTypeOnly || specifier.isTypeOnly))
}

function isPureRustRuntimeEntry(filePath, node, sourceFile) {
  // 唯一发行 Worker 叶只装配 Core；不能把目录或视图整体放行。
  return reactRelativePath(filePath) === 'worker/workbook.worker.ts' && !node.importClause &&
    sourceFile.statements.length === 1 && node.moduleSpecifier.text === '@einfach-excel/spreadsheet-ui-core/rust-runtime'
}

function isConcreteDemoImport(moduleName) {
  return /(?:^|\/)demo\/(?!demo-registry(?:$|\.))/.test(moduleName)
}

function isViewFrameworkModule(moduleName) {
  return (
    moduleName === '@einfach-excel/canvas' ||
    moduleName === '@einfach-excel/canvas-cells' ||
    moduleName === '@einfach-excel/react-cells' ||
    moduleName.startsWith('@einfach-excel/react-cells/') ||
    moduleName === 'react' ||
    moduleName.startsWith('react/') ||
    moduleName === '@einfach/react' ||
    moduleName.startsWith('@einfach/react/') ||
    moduleName === 'solid-js' ||
    moduleName.startsWith('solid-js/') ||
    moduleName === '@einfach/solid' ||
    moduleName.startsWith('@einfach/solid/') ||
    moduleName === 'vue' ||
    moduleName.startsWith('vue/')
  )
}

function visitReactSource(filePath, sourceFile) {
  if (isConcreteDemoInfrastructureFile(filePath)) {
    report(filePath, sourceFile, '具体 demo 不能拥有专属 view 或 runtime 目录')
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text
      if (filePath.startsWith(`${reactCellsSourceRoot}${path.sep}`) &&
        (moduleName.startsWith('@einfach-excel/react-excel') ||
          moduleName.includes('react-excel/'))) {
        report(filePath, node, 'React cell 包不能反向依赖产品宿主 react-excel')
      }
      if (isDemoHostFile(filePath) && isConcreteDemoImport(moduleName)) {
        report(filePath, node, `演示站外壳不能直接依赖具体 demo：${moduleName}`)
      }
      if (
        moduleName === '@einfach-excel/solid-excel' ||
        moduleName.startsWith('@einfach-excel/solid-excel/') ||
        moduleName === '@einfach/solid' ||
        moduleName.startsWith('@einfach/solid/') ||
        moduleName === 'solid-js' ||
        moduleName.startsWith('solid-js/')
      ) {
        report(filePath, node, `React 主线不能依赖 Solid：${moduleName}`)
      }
      if (moduleName.includes('@einfach-excel/spreadsheet-ui-core/rust-worker') &&
        !(moduleName === '@einfach-excel/spreadsheet-ui-core/rust-worker' && isWorkerLikeTypeImport(filePath, node))) {
        report(filePath, node, 'React 不能绕过 UI Core command atoms 直接使用 Worker 传输')
      }
      if (
        moduleName.includes('@einfach-excel/spreadsheet-ui-core/rust-runtime') &&
        !isPureRustRuntimeEntry(filePath, node, sourceFile)
      ) {
        report(filePath, node, 'Rust runtime 只能由唯一的纯装配 Worker 叶加载')
      }

      const namedBindings = node.importClause?.namedBindings
      if (namedBindings !== undefined && ts.isNamedImports(namedBindings)) {
        for (const specifier of namedBindings.elements) {
          const name = importedName(specifier)
          if (moduleName === '@einfach/core' && name === 'atom') {
            report(filePath, specifier, 'React 包不能导入 atom 创建器')
          }
          if (moduleName === 'react' && (name === 'useState' || name === 'useReducer')) {
            report(filePath, specifier, `React 表格状态不能使用 ${name}，请放入 UI Core atom`)
          }
          if (
            moduleName.startsWith('@einfach-excel/spreadsheet-ui-core') &&
            (name === 'rustWorkbookConnectionAtom' || name === 'setRustWorkbookConnectionAtom')
          ) {
            report(filePath, specifier, 'React 视图不能直接读写 Rust connection atom')
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (callee.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
        const moduleName = node.arguments[0].text
        if (moduleName.includes('@einfach-excel/spreadsheet-ui-core/rust-worker') ||
          moduleName.includes('@einfach-excel/spreadsheet-ui-core/rust-runtime'))
          report(filePath, node, 'React 不能动态加载 Worker 传输或 Rust runtime')
      }
      if (ts.isIdentifier(callee) && callee.text === 'atom') {
        report(filePath, node, 'React 包不能声明 spreadsheet atom')
      }
      if (
        (ts.isIdentifier(callee) && (callee.text === 'useState' || callee.text === 'useReducer')) ||
        (ts.isPropertyAccessExpression(callee) &&
          (callee.name.text === 'useState' || callee.name.text === 'useReducer'))
      ) {
        report(filePath, node, 'React 表格状态必须使用 Einfach atom')
      }
      if (
        ts.isPropertyAccessExpression(callee) &&
        (callee.name.text === 'getter' ||
          callee.name.text === 'setter' ||
          callee.name.text === 'sub')
      ) {
        report(filePath, node, `React 产品不能直接调用 store.${callee.name.text}`)
      }
    }

    if (
      ts.isIdentifier(node) &&
      (node.text === 'SpreadsheetBackend' ||
        node.text === 'runEditingCommitAtom' ||
        node.text === 'retryEditingRefreshAtom')
    ) {
      report(filePath, node, `已删除的展现层抽象不能回流：${node.text}`)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function visitUiCoreSource(filePath, sourceFile) {
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (isViewFrameworkModule(node.moduleSpecifier.text)) {
        report(filePath, node, `UI Core 不能依赖视图框架：${node.moduleSpecifier.text}`)
      }
    }
    if (
      ts.isIdentifier(node) &&
      (node.text === 'SpreadsheetBackend' ||
        node.text === 'runEditingCommitAtom' ||
        node.text === 'retryEditingRefreshAtom')
    ) {
      report(filePath, node, `已删除的展现层抽象不能回流：${node.text}`)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function parseSource(filePath, source = fs.readFileSync(filePath, 'utf8')) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

export function checkReactSource(relative, source) {
  const start = violations.length
  const filePath = path.join(reactSourceRoot, relative)
  visitReactSource(filePath, parseSource(filePath, source))
  return violations.splice(start)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  for (const filePath of collectSourceFiles(reactSourceRoot)) {
    visitReactSource(filePath, parseSource(filePath))
  }
  for (const filePath of collectSourceFiles(reactCellsSourceRoot)) {
    visitReactSource(filePath, parseSource(filePath))
  }
  for (const filePath of collectSourceFiles(canvasCellsSourceRoot)) {
    const sourceFile = parseSource(filePath)
    for (const node of sourceFile.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue
      const moduleName = node.moduleSpecifier.text
      if (/^(?:react(?:\/|$)|react-dom(?:\/|$)|@einfach\/react)/.test(moduleName) ||
        moduleName.includes('react-excel/')) {
        report(filePath, node, 'Canvas cell 包不能依赖 React 或 React 产品宿主')
      }
    }
  }
  for (const filePath of collectSourceFiles(uiCoreSourceRoot)) {
    visitUiCoreSource(filePath, parseSource(filePath))
  }

  if (violations.length > 0) {
    console.error(`展现层边界校验失败（${violations.length} 项）：\n${violations.sort().join('\n')}`)
    process.exitCode = 1
  } else {
    console.log('展现层边界校验通过：React -> UI Core atoms -> Rust/WASM')
  }
}
