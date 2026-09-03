import { defineConfig } from 'rollup'
import resolve from '@rollup/plugin-node-resolve'
import swc from '@rollup/plugin-swc'
import path, { dirname } from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import yaml from 'js-yaml'
import { babel } from '@rollup/plugin-babel'
import { onwarn, treeshakeOptions } from './rollup.shared.mjs'
import { buildSolidExcelConfig } from './rollup.solid-excel.mjs'

const workspaceConfig = yaml.load(readFileSync('./pnpm-workspace.yaml', 'utf8'))
const topLevelDirs = workspaceConfig.packages.map((p) => p.replace(/\/\*+$/, ''))

function hasRollupLibraryEntrypoint(packageDir) {
  const packageJsonPath = `${packageDir}/package.json`
  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(`${packageDir}/src/index.ts`)) {
    return false
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  return typeof packageJson.main === 'string' && typeof packageJson.module === 'string'
}

// 获取所有子目录
const products = topLevelDirs.reduce((acc, dir) => {
  const subDirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => `${dir}/${dirent.name}`)
    // 只构建声明 cjs 与 esm 发布入口的库；Vite 应用（包括 solid-excel）不产出 Rollup 文件。
    .filter(hasRollupLibraryEntrypoint)
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
    '@einfach/excel-wasm',
    '@einfach/excel-wasm/full',
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
  treeshake: treeshakeOptions,

  plugins: [],
})

/** @type {import('rollup').RollupOptions} */
const productConfigs = products.map((dir) => {
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

  const input = dir.endsWith('/spreadsheet-ui-core')
    ? {
        index: `${dir}/src/index.ts`,
        'rust-worker/index': `${dir}/src/rust-worker/index.ts`,
        'rust-runtime': `${dir}/src/rust-runtime.ts`,
      }
    : `${dir}/src/index.ts`
  // The Rust Worker leaf entries install their message listener at module
  // evaluation time. The shared aggressive treeshake policy erases that call,
  // so UI-core preserves its module graph instead of emitting a dead Worker.
  const treeshake = dir.endsWith('/spreadsheet-ui-core') ? false : treeshakeOptions

  return {
    ...config,
    input,
    treeshake,
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

export default [...productConfigs, buildSolidExcelConfig()]
