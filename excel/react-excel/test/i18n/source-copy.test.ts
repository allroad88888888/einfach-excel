import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// 使用仓库根已声明的 TypeScript 编译器，不为静态检查重复安装。
// eslint-disable-next-line import/no-extraneous-dependencies
import ts from 'typescript'
import { expect, test } from 'vitest'

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')
const untranslatedTokens = new Set(['fx', 'px', 'English', '↑ ↓ · Tab / Enter'])

/** 防止新弹窗绕过 Lingui；只检查用户可见字面量，不把数据、CSS 和内部命令键当文案。 */
test('product JSX copy and literal accessible labels are marked for extraction', () => {
  const failures: string[] = []
  for (const relative of fs.readdirSync(directory, { recursive: true }) as string[]) {
    if (!relative.endsWith('.tsx')) continue
    const file = path.join(directory, relative)
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest,
      true, ts.ScriptKind.TSX)
    function check(node: ts.Node, value: string) {
      const copy = value.replace(/\s+/g, ' ').trim()
      if (/[A-Za-z]{2}/.test(copy) && !untranslatedTokens.has(copy)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
        failures.push(`${relative}:${line} ${copy}`)
      }
    }
    function walk(node: ts.Node) {
      if (ts.isJsxElement(node) &&
        ['Trans', 'Plural', 'Select', 'SelectOrdinal'].includes(
          node.openingElement.tagName.getText(source),
        )) return
      if (ts.isJsxText(node)) check(node, node.text)
      if (ts.isJsxAttribute(node) && ['aria-label', 'title', 'placeholder', 'label', 'alt'].includes(
        node.name.getText(source),
      ) && node.initializer && ts.isStringLiteral(node.initializer)) {
        check(node, node.initializer.text)
      }
      ts.forEachChild(node, walk)
    }
    walk(source)
  }
  expect(failures).toEqual([])
})
