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
 * 盖住 —— 那正是这条警告存在的意义。
 *
 * ## 非豁免的环会让构建失败，不是打个警告
 *
 * 2026-08-03 的事故：`spill-collision.ts` 与 `spill-projection.ts` 各引入一行
 * `import { ARRAY_CELL_CAP } from './evaluate'`，构成两条新环。rollup 从那时起
 * 就一直在打印它们，但**没有人看见** —— 因为当时用的核对方式是
 * `npm run build | grep -cE "…|CIRCULAR_DEPENDENCY"`，而 rollup 打印的是
 * `Circular dependencies`，大小写与词形都对不上，那个判据恒为 0。
 * 于是「0 条循环依赖」被反复写进汇报和提交信息，全是假绿。
 *
 * 根子不在 grep 写错，在于**这条从来就不是门禁**：`warn()` 之后构建照样 exit 0，
 * 能不能被发现全看有没有人肉盯输出。所以改成 `throw` —— 环要么在白名单里，
 * 要么让构建红。
 *
 * 新增一个有意的环时：把它加进 `INTENTIONAL_CYCLE`，并在上面写清为什么拆不掉。
 * 「懒得改所以加白名单」和「拆掉需要改逻辑」是两回事，后者才配进这个正则。
 */
const INTENTIONAL_CYCLE = /[/\\]eval[/\\](evaluate|sparse-[a-z-]+)\.ts$/
function onwarn(warning, warn) {
  if (warning.code === 'CIRCULAR_DEPENDENCY') {
    const members = warning.ids ?? warning.cycle ?? []
    if (members.length > 0 && members.every((id) => INTENTIONAL_CYCLE.test(id))) return
    const cycle = members.length > 0 ? members.join('\n  → ') : warning.message
    throw new Error(
      `非预期的循环依赖（不在 INTENTIONAL_CYCLE 白名单里）：\n  ${cycle}\n\n` +
        '要么解掉这个环，要么在 rollup.config.mjs 的 INTENTIONAL_CYCLE 里登记它并写下' +
        '为什么拆不掉。见该处注释。',
    )
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
