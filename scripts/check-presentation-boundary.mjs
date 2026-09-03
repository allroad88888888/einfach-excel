import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// 这里只检查能稳定机械判断的边界；抽象是否有必要由 react-excel/SKILL.md 审查。
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reactSourceRoot = path.join(repositoryRoot, 'excel/react-excel/src')
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

function isRustRuntimeHost(filePath) {
  return reactRelativePath(filePath) === 'page/WorkbookRuntimeProvider.tsx'
}

function isConcreteDemoImport(moduleName) {
  return /(?:^|\/)demo\/(?!demo-registry(?:$|\.))/.test(moduleName)
}

function isViewFrameworkModule(moduleName) {
  return (
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
      if (isDemoHostFile(filePath) && isConcreteDemoImport(moduleName)) {
        report(filePath, node, `演示站外壳不能直接依赖具体 demo：${moduleName}`)
      }
      if (
        moduleName === '@einfach/solid-excel' ||
        moduleName.startsWith('@einfach/solid-excel/') ||
        moduleName === '@einfach/solid' ||
        moduleName.startsWith('@einfach/solid/') ||
        moduleName === 'solid-js' ||
        moduleName.startsWith('solid-js/')
      ) {
        report(filePath, node, `React 主线不能依赖 Solid：${moduleName}`)
      }
      if (moduleName.includes('@einfach/spreadsheet-ui-core/rust-worker')) {
        report(filePath, node, 'React 不能绕过 UI Core command atoms 直接使用 Worker 传输')
      }
      if (
        moduleName.includes('@einfach/spreadsheet-ui-core/rust-runtime') &&
        !isRustRuntimeHost(filePath)
      ) {
        report(filePath, node, 'Rust Worker 入口只能由共享 WorkbookRuntimeProvider 加载')
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
            moduleName.startsWith('@einfach/spreadsheet-ui-core') &&
            (name === 'rustWorkbookConnectionAtom' || name === 'setRustWorkbookConnectionAtom')
          ) {
            report(filePath, specifier, 'React 视图不能直接读写 Rust connection atom')
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression
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

function parseSource(filePath) {
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

for (const filePath of collectSourceFiles(reactSourceRoot)) {
  visitReactSource(filePath, parseSource(filePath))
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
