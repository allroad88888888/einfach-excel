/**
 * scale-parity 的**比对与失败报告**：把两个引擎的采样对齐成一份完整分歧清单。
 *
 * 刻意收集**全部**不一致再抛，而不是首个不一致就 fail —— 分歧通常成片出现，
 * 只报第一个地址会让人一次只修一格。失败信息里带上两个种子，报告即可复现。
 */
import { expect } from '@jest/globals'

import type { SampledCell } from './scale-parity-engine-types'
import { WORKLOAD_SEED } from './scale-parity-workload'
import { EDIT_SEED } from './scale-parity-edits'

export function diffSamples(
  ts: Map<string, SampledCell>,
  wasm: Map<string, SampledCell>,
): string[] {
  const mismatches: string[] = []
  for (const [key, t] of ts) {
    const w = wasm.get(key)
    if (!w) {
      mismatches.push(`${key}: missing from wasm sample`)
      continue
    }
    if (t.display !== w.display || t.isError !== w.isError) {
      mismatches.push(
        `${key}: ts={display:${JSON.stringify(t.display)},isError:${t.isError}} ` +
          `wasm={display:${JSON.stringify(w.display)},isError:${w.isError}}`,
      )
    }
  }
  return mismatches
}

export function expectParity(
  ts: Map<string, SampledCell>,
  wasm: Map<string, SampledCell>,
  phase: string,
) {
  const mismatches = diffSamples(ts, wasm)
  if (mismatches.length > 0) {
    throw new Error(
      `${phase}: ${mismatches.length} divergent cells ` +
        `(WORKLOAD_SEED=0x${WORKLOAD_SEED.toString(16)}, EDIT_SEED=0x${EDIT_SEED.toString(16)}):\n` +
        mismatches.join('\n'),
    )
  }
  expect(mismatches).toEqual([])
}
