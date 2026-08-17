// 一句话：ADR 0009 的统计口径与采样协议执行器（5 预热 + 20 有效样本，失败记录并重跑）。

import type { BenchSampleFailure, BenchSampleSeries, BenchStats } from './types'

export const WARMUP_RUNS = 5
export const MEASURED_RUNS = 20

/** 单个样本失败后允许的重跑次数上限；超过即视为场景无法完成。 */
const MAX_ATTEMPTS_PER_SAMPLE = 3

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** 最近秩法：p95 取排序后第 ceil(0.95 * n) 个样本。 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)))
  return sorted[rank - 1]
}

export function computeStats(values: readonly number[]): BenchStats {
  return { median: median(values), p95: percentile(values, 95) }
}

export interface SamplingProtocolOptions {
  /** 执行一次样本；返回样本值。失败抛异常，由协议记录并重跑。 */
  runSample: (phase: 'warmup' | 'measure', sampleIndex: number) => Promise<number>
  sampleMeaning: string
  unit: BenchSampleSeries['unit']
  onProgress?: (message: string) => void
  /** 保留两位小数，避免结果 JSON 里出现无意义的长尾。 */
  roundTo?: number
}

function roundValue(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * 按 ADR 0009 §共同采样规则跑一个序列：5 次预热（不进统计）+ 20 个有效样本。
 * 失败样本记录原因后重跑同一序号；重跑超限时整个场景失败。
 */
export async function runSamplingProtocol(
  options: SamplingProtocolOptions,
): Promise<BenchSampleSeries> {
  const digits = options.roundTo ?? 2
  const warmupSamples: number[] = []
  const samples: number[] = []
  const failures: BenchSampleFailure[] = []

  async function collect(phase: 'warmup' | 'measure', total: number, sink: number[]) {
    for (let index = 0; index < total; index += 1) {
      let attempt = 0
      for (;;) {
        attempt += 1
        options.onProgress?.(`${phase} ${index + 1}/${total} (attempt ${attempt})`)
        try {
          sink.push(roundValue(await options.runSample(phase, index), digits))
          break
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          failures.push({ phase, sampleIndex: index, attempt, reason })
          if (attempt >= MAX_ATTEMPTS_PER_SAMPLE) {
            throw new Error(
              `sample ${phase}[${index}] failed ${attempt} times, last reason: ${reason}`,
            )
          }
        }
      }
    }
  }

  await collect('warmup', WARMUP_RUNS, warmupSamples)
  await collect('measure', MEASURED_RUNS, samples)

  return {
    sampleMeaning: options.sampleMeaning,
    unit: options.unit,
    warmupSamples,
    samples,
    failures,
    stats: computeStats(samples),
  }
}
