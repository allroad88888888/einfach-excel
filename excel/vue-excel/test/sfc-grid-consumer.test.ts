import { transformSync } from '@swc/core'
import { describe, expect, it } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Component } from 'vue'
import { createApp } from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as vueRuntime from 'vue'
import * as vueExcel from '../src'

const FIXTURE_PATH = join(__dirname, 'fixtures', 'sfc-grid-consumer.vue')
const ALLOWED_IMPORTS = new Set(['vue', '@einfach/vue-excel'])
const IMPORT_SOURCE_RE = /\bfrom\s*['"]([^'"]+)['"]/g

type CompiledModule = { exports: { default?: Component } }
type CompiledExecutor = (
  exports: CompiledModule['exports'],
  module: CompiledModule,
  require: (specifier: string) => unknown,
) => void

function parseImportSources(source: string): Set<string> {
  return new Set(
    [...source.matchAll(IMPORT_SOURCE_RE)]
      .map((match) => match[1])
      .filter((specifier): specifier is string => Boolean(specifier)),
  )
}

function loadSfcDependency(specifier: string): unknown {
  if (specifier === 'vue') return vueRuntime
  if (specifier === '@einfach/vue-excel') return vueExcel
  throw new Error(`The SFC may only import Vue or the Vue adapter, received ${specifier}.`)
}

function compileFixture(): Component {
  const source = readFileSync(FIXTURE_PATH, 'utf8')
  const parsed = parse(source, { filename: FIXTURE_PATH })
  if (parsed.errors.length) throw new Error(`Unable to parse SFC: ${parsed.errors.join('\n')}`)

  const compiled = compileScript(parsed.descriptor, {
    id: 'sfc-grid-consumer',
    inlineTemplate: true,
  })
  expect(parseImportSources(compiled.content)).toEqual(ALLOWED_IMPORTS)

  const transformed = transformSync(compiled.content, {
    filename: FIXTURE_PATH,
    jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  })
  const compiledModule: CompiledModule = { exports: {} }
  const execute = new Function('exports', 'module', 'require', transformed.code) as CompiledExecutor
  execute(compiledModule.exports, compiledModule, loadSfcDependency)
  if (!compiledModule.exports.default) throw new Error('The compiled SFC has no default component.')
  return compiledModule.exports.default
}

describe('SFC grid consumer', () => {
  it('compiles a script-setup grid consumer and renders its A1 projection in jsdom', () => {
    const host = document.createElement('div')
    const app = createApp(compileFixture())

    document.body.append(host)

    app.mount(host)

    expect(host.querySelector('[role="grid"]')).toBeInTheDocument()
    expect(host.querySelector('[data-row="1"][data-col="1"]')).toHaveTextContent('A1')

    app.unmount()

    expect(host).toBeEmptyDOMElement()
    host.remove()
  })
})
