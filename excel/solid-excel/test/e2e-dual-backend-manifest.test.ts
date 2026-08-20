/**
 * e2e 双后端清单防腐守卫。
 *
 * playwright.config.ts 的 ts project 只跑 e2e/dual-backend-manifest.ts 登记的
 * spec。清单是手工维护的,会腐坏 —— 本测试按 DUAL_MARKERS 扫描全部 spec 源码,
 * 断言「引用 worker demo(唯一吃 ?backend= 的页面)的文件集合」与清单严格相等:
 * 新写的吃参数 spec 忘记登记 → 这里红;spec 改造后不再吃参数却留在清单 → 也红。
 */
import { describe, expect, test } from '@jest/globals'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  DUAL_BACKEND_SPECS,
  DUAL_MARKERS,
  SELF_PARAMETERIZED_SPECS,
  TS_ONLY_SPECS,
} from '../e2e/dual-backend-manifest'

const E2E_ROOT = join(__dirname, '..', 'e2e')

function listSpecs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) listSpecs(full, out)
    else if (full.endsWith('.spec.ts')) out.push(relative(E2E_ROOT, full))
  }
  return out
}

describe('e2e dual-backend manifest', () => {
  const allSpecs = listSpecs(E2E_ROOT)
  const hitsMarker = (spec: string): boolean => {
    const source = readFileSync(join(E2E_ROOT, spec), 'utf8')
    return DUAL_MARKERS.some((marker) => marker.test(source))
  }

  test('清单与「引用 worker demo 的 spec」集合严格相等', () => {
    const classified = allSpecs
      .filter((spec) => hitsMarker(spec) && !SELF_PARAMETERIZED_SPECS.includes(spec))
      .sort()
    const manifest = [...DUAL_BACKEND_SPECS].sort()

    const missingFromManifest = classified.filter((spec) => !manifest.includes(spec))
    const staleInManifest = manifest.filter((spec) => !classified.includes(spec))

    expect({
      漏登记的双后端spec_请加进DUAL_BACKEND_SPECS: missingFromManifest,
      清单里已不吃参数的spec_请移出: staleInManifest,
    }).toEqual({
      漏登记的双后端spec_请加进DUAL_BACKEND_SPECS: [],
      清单里已不吃参数的spec_请移出: [],
    })
  })

  test('清单里的每个文件都存在', () => {
    const gone = [...DUAL_BACKEND_SPECS, ...TS_ONLY_SPECS, ...SELF_PARAMETERIZED_SPECS].filter(
      (spec) => !existsSync(join(E2E_ROOT, spec)),
    )
    expect(gone).toEqual([])
  })

  test('自参数化例外仍然名副其实(命中标记但自己双跑两个后端)', () => {
    for (const spec of SELF_PARAMETERIZED_SPECS) {
      expect(hitsMarker(spec)).toBe(true)
      const source = readFileSync(join(E2E_ROOT, spec), 'utf8')
      expect(source).toMatch(/backend=wasm/)
      expect(source).toMatch(/backend=ts/)
    }
  })

  test('TS 影子 spec 与双后端清单互斥', () => {
    const overlap = TS_ONLY_SPECS.filter((spec) => DUAL_BACKEND_SPECS.includes(spec))
    expect(overlap).toEqual([])
  })
})
