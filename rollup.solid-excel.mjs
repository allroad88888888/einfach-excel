/**
 * `@einfach/solid-excel` 的双形态预编译管线（ADR 0019）。不走通用 products 管线：
 * 多入口（现役公共面 + worker 运行时族 + legacy）、只出 ESM
 * （worker-factory 依赖 `import.meta`，CJS 形态无意义）、依赖一律 external
 * （尤其 solid-js —— 打进产物会复发 ADR 0001 的双实例 bug）。
 *
 * worker-factory 源码里 `new URL('./worker-runtime.ts', import.meta.url)` 指向
 * 同目录源文件；预编译树里它们是 `.mjs`，由 rewriteWorkerUrls 在产出时改写字面量。
 */
import { defineConfig } from 'rollup'
import resolve from '@rollup/plugin-node-resolve'
import { babel } from '@rollup/plugin-babel'
import path, { dirname } from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { onwarn, treeshakeOptions } from './rollup.shared.mjs'

const dirName = dirname(fileURLToPath(import.meta.url))
const SOLID_EXCEL = 'excel/solid-excel'
const esmDir = path.resolve(dirName, SOLID_EXCEL, 'esm')

const entries = {
  'legacy/index': `${SOLID_EXCEL}/legacy/index.tsx`,
  'src/index': `${SOLID_EXCEL}/src/index.ts`,
  'src/public': `${SOLID_EXCEL}/src/public.ts`,
  'src/demos/index': `${SOLID_EXCEL}/src/demos/index.ts`,
  'src/i18n/index': `${SOLID_EXCEL}/src/i18n/index.ts`,
  'src/adapter/worker-factory': `${SOLID_EXCEL}/src/adapter/worker-factory.ts`,
  'src/adapter/worker-runtime': `${SOLID_EXCEL}/src/adapter/worker-runtime.ts`,
  'src/adapter/worker-runtime-full': `${SOLID_EXCEL}/src/adapter/worker-runtime-full.ts`,
  'src/adapter/worker-runtime-core': `${SOLID_EXCEL}/src/adapter/worker-runtime-core.ts`,
  'src/adapter/worker-entry-ts': `${SOLID_EXCEL}/src/adapter/worker-entry-ts.ts`,
}

/** 把 worker URL 字面量里的源码后缀改写成预编译后缀。 */
function rewriteWorkerUrls() {
  return {
    name: 'rewrite-worker-urls',
    renderChunk(code) {
      if (!code.includes('import.meta.url')) return null
      return code.replace(/new URL\((['"])\.\/(worker-[a-z-]+)\.ts\1/g, 'new URL($1./$2.mjs$1')
    },
  }
}

/**
 * CSS import 不打包：说明符原样保留（包说明符归消费者的解析链，相对路径靠
 * writeBundle 把 css 文件按原相对位置拷进 esm 树，使相对引用继续成立）。
 */
function keepCssExternal() {
  const copyCssTree = (fromDir, toDir) => {
    if (!fs.existsSync(fromDir)) return
    for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
      const from = path.join(fromDir, entry.name)
      const to = path.join(toDir, entry.name)
      if (entry.isDirectory()) copyCssTree(from, to)
      else if (entry.name.endsWith('.css')) {
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.copyFileSync(from, to)
      }
    }
  }
  return {
    name: 'keep-css-external',
    resolveId(source) {
      if (source.endsWith('.css')) return { id: source, external: true }
      return null
    },
    writeBundle() {
      copyCssTree(path.resolve(dirName, SOLID_EXCEL, 'legacy'), path.resolve(esmDir, 'legacy'))
      copyCssTree(path.resolve(dirName, SOLID_EXCEL, 'src'), path.resolve(esmDir, 'src'))
    },
  }
}

export function buildSolidExcelConfig() {
  if (fs.existsSync(esmDir)) {
    fs.rmSync(esmDir, { recursive: true, force: true })
  }

  return defineConfig({
    input: entries,
    // 依赖一律 external：预编译树只含本包代码，solid-js / @einfach/* / @lingui
    // 全部保留为裸导入，由消费者的解析链提供（单实例不变式的前提）。
    external: (id) => !id.startsWith('.') && !path.isAbsolute(id),
    treeshake: {
      ...treeshakeOptions,
      // 通用口径的 moduleSideEffects:false 会把纯副作用的 `import 'x.css'` 摇掉，
      // 预编译树里样式就丢了；.css 必须按有副作用保留。
      moduleSideEffects: (id) => id.endsWith('.css'),
    },
    onwarn,
    plugins: [
      resolve({ extensions: ['.ts', '.tsx'] }),
      babel({
        babelHelpers: 'bundled',
        extensions: ['.ts', '.tsx'],
        // 根上的 babel 配置是给 jest 的（含 CJS module 变换）；这里必须隔离，
        // 只用下面这组内联 preset，保持 ESM 语法交给 rollup。
        babelrc: false,
        configFile: false,
        presets: [['@babel/preset-typescript', { isTsx: true, allowDeclareFields: true }]],
        plugins: [
          [
            'babel-plugin-jsx-dom-expressions',
            {
              moduleName: 'solid-js/web',
              builtIns: ['createElement', 'spread', 'insert', 'createComponent'],
              contextToCustomElements: true,
              wrapConditionals: true,
            },
          ],
        ],
      }),
      rewriteWorkerUrls(),
      keepCssExternal(),
    ],
    output: {
      format: 'es',
      dir: `${SOLID_EXCEL}/esm`,
      entryFileNames: '[name].mjs',
      chunkFileNames: '[name].mjs',
      preserveModules: true,
      preserveModulesRoot: SOLID_EXCEL,
    },
  })
}
