import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))

// 执行各脚本真实的证据目录初始化表达式；不复制路径选择逻辑，也不触发旧目录的打包写入。
for (const script of ['prepare-react-package-consumers.mjs', 'serve-react-package-consumers.mjs',
  'freeze-react-package-inputs.mjs']) {
  test(`${script} preserves default and selects an isolated root-relative candidate`, async () => {
    const source = await readFile(new URL(script, import.meta.url), 'utf8')
    const parsed = ts.createSourceFile(script, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const declarations = parsed.statements.filter(ts.isVariableStatement)
      .flatMap(statement => [...statement.declarationList.declarations])
    const declaration = declarations.find(node => node.name.getText(parsed) === 'evidence')
    assert.ok(declaration?.initializer)
    const expression = declaration.initializer.getText(parsed)
    const evaluate = value => runInNewContext(expression, {
      root, path, process: { env: { REACT_EXCEL_PACKAGE_EVIDENCE_DIR: value } },
    })
    assert.equal(evaluate(undefined), path.join(root, '.codex-artifacts/react-excel-package-004'))
    assert.equal(evaluate(''), path.join(root, '.codex-artifacts/react-excel-package-004'))
    assert.equal(evaluate('.codex-artifacts/candidate'), path.join(root, '.codex-artifacts/candidate'))
    assert.equal(evaluate('/tmp/isolated-package-evidence'), '/tmp/isolated-package-evidence')
  })
}
