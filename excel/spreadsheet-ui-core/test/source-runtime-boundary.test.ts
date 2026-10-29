import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import { repositoryPath } from './support/repository-path'

const SRC_ROOT = repositoryPath('excel/spreadsheet-ui-core/src')
const DOMAIN_TYPES = join(SRC_ROOT, 'rust-workbook/wasm-types')
const HOST_SOURCE = join(SRC_ROOT, 'host/fixture.ts')

function readSourceFiles(dir: string): Array<{ path: string; text: string }> {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return readSourceFiles(path)
    return entry.endsWith('.ts') ? [{ path, text: readFileSync(path, 'utf8') }] : []
  })
}

function domainTypeOnly(node: ts.ImportDeclaration, path: string, module: string): boolean {
  const clause = node.importClause
  const bindings = clause?.namedBindings
  // 仅允许领域合约的纯类型 WasmWorkbook，不给 host 目录或运行时 glue 开例外。
  return resolve(dirname(path), module) === DOMAIN_TYPES && !!clause && !clause.name &&
    !!bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 &&
    bindings.elements.every((entry) => (clause.isTypeOnly || entry.isTypeOnly) &&
      (entry.propertyName ?? entry.name).text === 'WasmWorkbook')
}

function sourceOffenders(path: string, text: string): string[] {
  const matches: string[] = []
  const forbiddenModule = (module: string) =>
    /^(?:solid-js|react|@einfach\/solid|@einfach\/react)(?:\/|$)/.test(module) ||
    module.includes('wasm')
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const module = node.moduleSpecifier.text
      if (forbiddenModule(module) && !domainTypeOnly(node, path, module))
        matches.push(`${path}: forbidden import`)
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) && forbiddenModule(node.moduleSpecifier.text))
      matches.push(`${path}: forbidden import`)
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] && ts.isStringLiteral(node.arguments[0]) &&
      forbiddenModule(node.arguments[0].text))
      matches.push(`${path}: forbidden import`)
    ts.forEachChild(node, visit)
  }
  visit(source)
  // result.window 是投影领域字段；裸全局与 DOM/Worker 构造仍属于运行时越界。
  const forbiddenRuntime =
    /(?<!\.)\b(?:document\.|window\.|HTMLElement|HTMLDivElement)\b|\bnew\s+Worker\s*\(/
  if (forbiddenRuntime.test(text)) matches.push(`${path}: forbidden runtime reference`)
  return matches
}

describe('source runtime boundary', () => {
  test('keeps UI core free of framework runtimes, DOM access, and inline wasm glue', () => {
    const offenders = readSourceFiles(SRC_ROOT)
      // 保留既有原生装配/实现边界；host 必须与其他 Core 业务接受同一检查。
      .filter(({ path }) => !path.endsWith('/rust-runtime.ts'))
      .filter(({ path }) => !path.includes('/rust-workbook/'))
      .flatMap(({ path, text }) => sourceOffenders(path, text))
    expect(offenders).toEqual([])
  })

  test.each([
    ['domain type', "import type { WasmWorkbook } from '../rust-workbook/wasm-types'"],
    ['inline type', "import { type WasmWorkbook } from '../rust-workbook/wasm-types'"],
    ['renamed type', "import type { WasmWorkbook as Book } from '../rust-workbook/wasm-types'"],
    ['multiline type', "import type {\n WasmWorkbook,\n} from '../rust-workbook/wasm-types'"],
    ['projection field', 'const rowStart = result.window.rowStart'],
  ])('allows %s without a runtime dependency', (_name, text) => {
    expect(sourceOffenders(HOST_SOURCE, text)).toEqual([])
  })

  test.each([
    ['domain value', "import { WasmWorkbook } from '../rust-workbook/wasm-types'"],
    ['mixed domain value',
      "import { type WasmWorkbook, runtime } from '../rust-workbook/wasm-types'"],
    ['unapproved domain type', "import type { Other } from '../rust-workbook/wasm-types'"],
    ['domain namespace', "import * as domain from '../rust-workbook/wasm-types'"],
    ['runtime glue', "import * as wasm from '@einfach-excel/excel-wasm'"],
    ['side effect glue', "import '@einfach-excel/excel-wasm'"],
    ['type-only glue', "import type { WasmWorkbook } from '@einfach-excel/excel-wasm'"],
    ['dynamic glue', "const wasm = import('@einfach-excel/excel-wasm')"],
    ['reexported glue', "export * from '@einfach-excel/excel-wasm'"],
    ['reexported framework', "export { useState } from 'react'"],
    ['React', "import { useState } from 'react'"],
    ['React subpath', "import { jsx } from 'react/jsx-runtime'"],
    ['Solid', "import { createSignal } from 'solid-js'"],
    ['React binding', "import { useAtomValue } from '@einfach/react'"],
    ['Solid binding', "import { useAtom } from '@einfach/solid'"],
    ['document', "document.createElement('div')"],
    ['window', 'window.location.href'],
    ['HTMLElement', 'const target = value as HTMLElement'],
    ['HTMLDivElement', 'const target = value as HTMLDivElement'],
    ['Worker constructor', "new Worker('runtime.js')"],
  ])('rejects %s even inside host', (_name, text) => {
    expect(sourceOffenders(HOST_SOURCE, text)).not.toEqual([])
  })
})
