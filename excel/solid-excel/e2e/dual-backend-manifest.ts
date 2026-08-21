/**
 * 双后端(?backend= 参数)e2e 分流的单一事实源。
 *
 * 背景:两个 Playwright project(wasm/ts)唯一差别是 baseURL 的 `?backend=`。
 * 全仓只有 VNextWorkerDemo(src-vnext/demos/VNextWorkerDemo.tsx readBackendChoice)
 * 读这个参数 —— 其余 demo 硬接固定后端,对它们双跑只是把同一套 UI 断言原样跑两遍
 * (审计时 611/752 个 test 属于这种浪费,见 e2e/BACKEND_PARITY.md § Projects)。
 *
 * 因此:ts project 只跑 DUAL_BACKEND_SPECS(真正吃参数的)+ TS_ONLY_SPECS
 * (专属 TS demo tab 的影子 spec);wasm project 跑其余全部。
 *
 * 清单靠 test/e2e-dual-backend-manifest.test.ts 防腐:它按 DUAL_MARKERS 扫描
 * 全部 spec 源码,断言"引用 worker demo 的文件集合"与本清单严格相等 ——
 * 新增吃参数的 spec 忘记登记会在 jest 里当场红,而不是静默单跑。
 */

/** 判据:spec 源码命中任一标记 = 它会落到吃 `?backend=` 的 VNextWorkerDemo。 */
export const DUAL_MARKERS: RegExp[] = [
  // gotoRoot + getByRole('button', { name: 'vNext Worker', exact: true })
  /'vNext Worker'/,
  // filter-sort/worker-demo-helpers.ts 的 gotoWorkerDemo()
  /worker-demo-helpers/,
  // getByTestId('nav-tab-vnext-worker')(引号紧跟,排除 nav-tab-vnext-worker-ts)
  /["'`]nav-tab-vnext-worker["'`]/,
  // page.evaluate 内直接读 backend 参数选 workerFactory(perf-virtual ad812/826/827)
  /URLSearchParams\(window\.location\.search\)\.get\('backend'\)/,
]

/**
 * 命中标记但**不**双跑的例外:该 spec 在单次运行里自己写死 backend=wasm 与
 * backend=ts 各跑一遍(gotoRoot 对已含 backend= 的 extra 让路,helpers.ts:130),
 * project 双跑等于同一对后端跑两遍。
 */
export const SELF_PARAMETERIZED_SPECS: string[] = [
  'data-ops/vnext-worker-remove-duplicates-real-backend.spec.ts',
]

/**
 * 专属 VNextWorkerTsDemo tab 的影子 spec:无论哪个 project 跑,页面都硬接 TS
 * worker。保留理由与退役条件见 BACKEND_PARITY.md § "Shadow specs intentionally
 * kept" —— 绑到 ts project 单跑,语义上归位。
 */
export const TS_ONLY_SPECS: string[] = [
  'worker-backend/vnext-worker-ts.spec.ts',
  'worker-backend/vnext-worker-ts-lambda.spec.ts',
]

/** 真正吃 `?backend=` 参数、值得两个 project 各跑一遍的 spec(路径相对 e2e/)。 */
export const DUAL_BACKEND_SPECS: string[] = [
  'clipboard/large-range-paste-projection.spec.ts',
  'clipboard/paste-special-worker-shortcut.spec.ts',
  'clipboard/vnext-clipboard-real-backend.spec.ts',
  'conditional-format/data-bar-projection.spec.ts',
  'conditional-format/rule-param-edit.spec.ts',
  'conditional-format/top-bottom-projection.spec.ts',
  'custom-formulas/async-custom-formulas.spec.ts',
  'custom-formulas/custom-formulas-range-2d.spec.ts',
  'custom-formulas/custom-formulas.spec.ts',
  'data-ops/vnext-text-to-columns-real-backend.spec.ts',
  'data-validation/validation-rules-eval.spec.ts',
  'editing/editing-session-keys.spec.ts',
  'editing/vnext-direct-edit-real-backend.spec.ts',
  'filter-sort/filter-paste-visibility.spec.ts',
  'filter-sort/sort-stability.spec.ts',
  'filter-sort/vnext-filter-sort-real-backend.spec.ts',
  'filter-sort/vnext-filter-structural-shift-real-backend.spec.ts',
  'filter-sort/vnext-menu-sort-confirmation.spec.ts',
  'filter-sort/vnext-reapply-filter-real-backend.spec.ts',
  'filter-sort/vnext-sort-real-backend.spec.ts',
  'history/history-branch-cross-sheet.spec.ts',
  'history/vnext-worker-undo-real-backend.spec.ts',
  'i18n-a11y/a11y-surfaces.spec.ts',
  'i18n-a11y/dialog-escape-aria.spec.ts',
  'i18n-a11y/i18n-vnext-surfaces.spec.ts',
  'merge-freeze/vnext-freeze-real-backend.spec.ts',
  'merge-freeze/vnext-merge-real-backend.spec.ts',
  'named-ranges-tables/named-range-formula.spec.ts',
  'named-ranges-tables/vnext-table-real-backend.spec.ts',
  'named-ranges-tables/vnext-table-totals-real-backend.spec.ts',
  'named-ranges-tables/vnext-table-undo-real-backend.spec.ts',
  'perf-virtual/ad812-scale-contracts.spec.ts',
  'perf-virtual/ad826-first-screen-evaluation.spec.ts',
  'perf-virtual/ad827-bounded-vs-full-range-read.spec.ts',
  'print/print-preview-menu.spec.ts',
  'protection/protection-unlock-range.spec.ts',
  'protection/protection-unlock-office-web.spec.ts',
  'protection/vnext-protection-real-backend.spec.ts',
  'rows-cols-outline/vnext-hidden-rows-real-backend.spec.ts',
  'rows-cols-outline/vnext-outline-multilevel-real-backend.spec.ts',
  'rows-cols-outline/vnext-outline-real-backend.spec.ts',
  'rows-cols-outline/vnext-structural-ref-shift-real-backend.spec.ts',
  'rows-cols-outline/vnext-subtotal-hidden-boundary-real-backend.spec.ts',
  'rows-cols-outline/vnext-subtotal-hidden-real-backend.spec.ts',
  'selection/vnext-selection-real-backend.spec.ts',
  'sheets/sheet-rename-delete-refs.spec.ts',
  'sheets/sheet-tab-pageup-navigation.spec.ts',
  'sheets/sheet-tab-reorder-lifecycle.spec.ts',
  'sheets/vnext-sheet-lifecycle-real-backend.spec.ts',
  'smoke/demo-first-screen-guard.spec.ts',
  'smoke/vnext-real-backend-smoke.spec.ts',
  'toolbar-shell/failclosed-port-matrix.spec.ts',
  'toolbar-shell/vnext-status-bar-real-backend.spec.ts',
  'toolbar-shell/vnext-ts-failclosed-menu.spec.ts',
  'worker-backend/portable-editing-worker-contract.spec.ts',
  'worker-backend/stale-request-consistency.spec.ts',
  'worker-backend/vnext-worker-backend.spec.ts',
]
