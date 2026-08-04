/**
 * Detect circular edges that survive TypeScript compilation across every
 * maintained TypeScript source tree. The sole exception is the established
 * evaluator/sparse strongly connected component listed in the handoff plan.
 */
module.exports = {
  forbidden: [
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
      '^excel/(?:excel-core-ts|excel-site|solid-excel|spreadsheet-ui-core)/(?:src|src-vnext)(?:/|$)',
    moduleSystems: ['cjs', 'es6'],
    tsPreCompilationDeps: false,
  },
}
