import { defineConfig } from 'rollup'
import resolve from '@rollup/plugin-node-resolve'
import swc from '@rollup/plugin-swc'
import path, { dirname } from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import yaml from 'js-yaml'
import { babel } from '@rollup/plugin-babel'

const workspaceConfig = yaml.load(readFileSync('./pnpm-workspace.yaml', 'utf8'))
const topLevelDirs = workspaceConfig.packages.map((p) => p.replace(/\/\*+$/, ''))

// 获取所有子目录
const products = topLevelDirs.reduce((acc, dir) => {
  const subDirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => `${dir}/${dirent.name}`)
    // 跳过没有 src/index.ts 的子包（demo 应用走 vite build，不进 rollup）
    .filter((p) => fs.existsSync(`${p}/src/index.ts`))
  return [...acc, ...subDirs]
}, [])

const filename = fileURLToPath(import.meta.url)
const dirName = dirname(filename)

const outputDirList = ['esm', 'cjs', 'dist']
products.forEach((pName) => {
  outputDirList.forEach((output) => {
    const outputDir = path.resolve(dirName, pName, output)
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true })
    }
  })
})

/** @type {import('rollup').RollupOptions} */
const config = defineConfig({
  external: [
    '@swc/core',
    '@einfach/core',
    '@einfach/spreadsheet-ui-core',
    '@einfach/react',
    '@einfach/utils',
    '@einfach/solid',
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'solid-js',
    'solid-js/web',
    'solid-js/store',
  ],
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    unknownGlobalSideEffects: false,
  },

  plugins: [],
})

/**
 * `eval/evaluate.ts` ↔ `eval/sparse-*.ts` 是一个**有意的**环，别的环不是。
 *
 * 稀疏聚合是求值器的一部分：`evaluate` 在 `case 'COUNT'` 这类分支把调用截给稀疏
 * 版，稀疏版遇到非区域参数又递归回 `evaluate`。这条互递归在语义上真实存在，把它
 * 拆掉需要把一个 5 元 context 穿过约 20 个函数 —— 那是改逻辑，不是拆文件。
 * 详见 `excel/excel-core-ts/src/eval/sparse-aggregations.ts` 的文件头。
 *
 * 这里**只**放行这一个环。全局关掉 `CIRCULAR_DEPENDENCY` 会把将来非预期的环一起
 * 盖住 —— 那正是这条警告存在的意义。新的环仍然会照常打出来。
 */
const INTENTIONAL_CYCLE = /[/\\]eval[/\\](evaluate|sparse-[a-z-]+)\.ts$/
function onwarn(warning, warn) {
  if (warning.code === 'CIRCULAR_DEPENDENCY') {
    const members = warning.ids ?? warning.cycle ?? []
    if (members.length > 0 && members.every((id) => INTENTIONAL_CYCLE.test(id))) return
  }
  warn(warning)
}

/** @type {import('rollup').RollupOptions} */
export default products.map((dir) => {
  /** @type {import('rollup').RollupOptions} */
  const isSolidPackage = dir.includes('solid')

  // 为solid包使用babel，其他包使用swc
  const pluginsConfig = isSolidPackage
    ? [
        resolve({
          extensions: ['.ts', '.tsx'],
        }),
        babel({
          babelHelpers: 'bundled',
          extensions: ['.ts', '.jsx', '.tsx'],
          presets: [
            [
              '@babel/preset-env',
              {
                targets: { node: 'current' },
                modules: false,
              },
            ],
            ['@babel/preset-typescript', { isTsx: true, allowDeclareFields: true }],
          ],
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
      ]
    : [
        resolve({
          extensions: ['.ts', '.tsx'],
        }),
        swc({
          swc: {
            minify: false,
            jsc: {
              target: 'esnext',
              parser: {
                tsx: true,
                syntax: 'typescript',
              },
              transform: {
                react: {
                  runtime: 'automatic',
                },
              },
            },
          },
        }),
      ]

  return {
    ...config,
    input: `${dir}/src/index.ts`,
    // treeshake: false,
    onwarn,
    plugins: pluginsConfig,
    output: [
      {
        format: 'commonjs',
        dir: `${dir}/cjs`,
        entryFileNames: '[name].cjs',
        preserveModules: true, // 保留模块结构
        preserveModulesRoot: 'src', // 去掉 src 的根路径
      },
      {
        format: 'es',
        dir: `${dir}/esm`,
        entryFileNames: '[name].mjs',
        preserveModules: true, // 保留模块结构
        preserveModulesRoot: 'src', // 去掉 src 的根路径
      },
      {
        format: 'commonjs',
        dir: `${dir}/dist`,
        entryFileNames: '[name].js',
      },
      {
        format: 'es',
        dir: `${dir}/dist`,
        entryFileNames: '[name].mjs',
      },
    ],
  }
})
