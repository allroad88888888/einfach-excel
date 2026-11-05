/**
 * Detect circular edges that survive TypeScript compilation across every
 * maintained TypeScript source tree. The sole exception is the established
 * evaluator/sparse strongly connected component listed in the handoff plan.
 */
module.exports = {
  forbidden: [
    {
      name: 'core-does-not-depend-on-plugins',
      comment: 'The workbook packages must work unchanged without any plugin installed.',
      severity: 'error',
      from: { path: '^(?:excel|packages)/', pathNot: '^excel/react-excel/src/(?:app|page/demo)/' },
      to: { path: '^plugins/' },
    },
    {
      name: 'plugins-are-independent',
      comment: 'A plugin reaches the workbook only through public package entries.',
      severity: 'error',
      from: { path: '^plugins/([^/]+)/' },
      to: { path: '^plugins/', pathNot: '^plugins/$1/' },
    },
    {
      name: 'no-runtime-cycles',
      comment: 'Runtime modules must not form new dependency cycles.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
        pathNot:
          '^excel/excel-core-ts/src/eval/(?:evaluate|sparse-(?:aggregations|criteria|multi-criterion|range-alignment|single-criterion|subtotal))\\.ts$',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: '(^|/)(?:node_modules|\\.pnpm)(?:/|$)',
    },
    exclude:
      '(^|/)(?:@types|__tests__|coverage|dist|cjs|esm|test|wasm-pkg)(?:/|$)|\\.d\\.ts$',
    includeOnly:
      '^(?:excel/(?:excel-core-ts|react-excel|spreadsheet-ui-core)/src|plugins/[^/]+/src)(?:/|$)',
    moduleSystems: ['cjs', 'es6'],
    // 解析工作区包的 exports（插件直接导出 .ts/.tsx 源码），否则跨包边界规则看不到依赖。
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.mjs'],
    },
    tsPreCompilationDeps: false,
  },
}
