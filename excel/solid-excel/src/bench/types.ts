// 一句话：对外性能基准的契约类型 —— 场景接口与结构化结果 JSON（AD-505 / AD-510）。
//
// 结果结构在这里钉死：每个场景的 run() 必须产出 BenchScenarioOutput，页面壳再
// 把它与 ADR 0011 环境记录、ADR 0010 非承诺声明组装成 BenchScenarioResult。

/** AD-509 数据档位 ID（docs/AD509_BENCHMARK_DATA_TIERS.md）。 */
export type BenchTierId = 'smoke' | 'small' | 'medium' | 'large'

/** ADR 0008 定义的四类公开证据；本页当前实现前三类。 */
export type BenchCategory = 'scroll' | 'recalc' | 'first-screen' | 'bundle-size'

/** ADR 0009 §共同采样规则 3：失败样本必须记录原因并重跑，不得隐去。 */
export interface BenchSampleFailure {
  phase: 'warmup' | 'measure'
  sampleIndex: number
  attempt: number
  reason: string
}

export interface BenchStats {
  median: number
  p95: number
}

/** 一个结果序列：原始样本 + 中位数/p95（ADR 0009 §共同采样规则 4）。 */
export interface BenchSampleSeries {
  /** 单个样本值的含义（如 "一次滚动过程中帧时长落在预算内的比例"）。 */
  sampleMeaning: string
  unit: 'ms' | 'ratio'
  warmupSamples: number[]
  samples: number[]
  failures: BenchSampleFailure[]
  stats: BenchStats
}

/** 场景 run() 的返回结构 —— AD-510 钉死，页面壳只做组装不做再计算。 */
export interface BenchScenarioOutput {
  /** 主序列：样本口径严格按 ADR 0009 对应小节。 */
  primary: BenchSampleSeries
  /** 场景自留的原始细节（逐帧间隔等），必须可 JSON 序列化。 */
  detail?: unknown
}

export interface BenchRunContext {
  /** 场景可向其中挂载夹具的可见容器；run() 结束时必须清空。 */
  stage: HTMLElement
  /** 页面壳的进度回显。 */
  onProgress?: (message: string) => void
}

/**
 * 基准场景登记条目（AD-505 验收契约）：新增场景 = 在 registry.ts 里加一个条目。
 * id、标题、口径引用与 run() 返回结构都在登记时定死。
 */
export interface BenchScenario {
  id: string
  title: string
  category: BenchCategory
  /** 口径引用：指向 ADR 0009 的具体小节。 */
  methodologyRef: string
  /** 场景修订号；场景定义（方向、距离、完成条件……）一变即换新修订。 */
  scenarioRevision: string
  dataScaleId: BenchTierId
  /** 固定下来的场景定义全文（ADR 0009 要求逐项固定的内容）。 */
  definition: string
  /** 本场景运行方式蕴含的缓存状态，写进环境记录 conditions.cacheState。 */
  cacheState: string
  run(context: BenchRunContext): Promise<BenchScenarioOutput>
}

// ---------------------------------------------------------------------------
// ADR 0011 环境记录（einfach.performance-environment/v1）
// 字段不得省略：暂不适用写 null / "not-applicable"，取不到写 "unknown" 并附原因。
// ---------------------------------------------------------------------------

export interface BenchEnvironmentRecord {
  schema: 'einfach.performance-environment/v1'
  runId: string
  capturedAt: string
  implementation: {
    sourceRevision: string
    buildProfile: string
    packageVersions: Record<string, string>
  }
  machine: {
    os: { name: string; version: string; architecture: string }
    cpu: { model: string; logicalCores: number | 'unknown' }
    memoryGiB: number | 'unknown'
    powerState: string
    displayRefreshHz: number | 'unknown'
  }
  browser: {
    name: string
    version: string
    engine: { name: string; version: string }
    headless: boolean | 'unknown'
    viewportCssPx: { width: number; height: number }
    devicePixelRatio: number
  } | null
  conditions: {
    cacheState: string
    network: string
    backgroundLoad: string
  }
  workload: {
    scenarioId: string
    scenarioRevision: string
    dataScaleId: string
    dataDefinition: string
  }
}

/** 页面壳最终导出的单场景结果 JSON（AD-510）。 */
export interface BenchScenarioResult {
  schema: 'einfach.benchmark-result/v1'
  scenarioId: string
  title: string
  category: BenchCategory
  methodologyRef: string
  definition: string
  protocol: { warmupRuns: number; measuredRuns: number }
  output: BenchScenarioOutput
  environment: BenchEnvironmentRecord
  /** ADR 0010：结果是一次具名运行的观测证据，不构成任何承诺。 */
  nonGuarantee: string
}
