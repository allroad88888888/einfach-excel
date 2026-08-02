import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import {
  activeSpillRegionAtom,
  captureSpillRegionCapabilityAtom,
  clearSpillRegionAtom,
  refreshSpillRegionAtom,
  SPILL_REGION_CACHE_MAX,
  spillCellRoleAtom,
  spillRegionSupportedAtom,
  type SpillRegionPort,
  type SpillRegionRequest,
  type SpillRegionResult,
} from '../src/spill'

type AtomHasPublicWrite<Entity> = Entity extends { write: unknown } ? true : false

const SPILL_PUBLIC_STATE_IS_READ_ONLY: readonly [
  AtomHasPublicWrite<typeof activeSpillRegionAtom>,
  AtomHasPublicWrite<typeof spillRegionSupportedAtom>,
  AtomHasPublicWrite<typeof spillCellRoleAtom>,
] = [false, false, false]

const SPILL_COMMANDS_ARE_WRITABLE: readonly [
  AtomHasPublicWrite<typeof refreshSpillRegionAtom>,
  AtomHasPublicWrite<typeof captureSpillRegionCapabilityAtom>,
  AtomHasPublicWrite<typeof clearSpillRegionAtom>,
] = [true, true, true]

/** `H1` 上一个 `=SEQUENCE(10)`：锚点 (0,7)，溢出到 H1:H10。 */
const SEQUENCE_REGION = {
  anchor: { row: 0, col: 7 },
  range: { rowStart: 0, rowEnd: 9, colStart: 7, colEnd: 7 },
}

function portReturning(
  region: SpillRegionResult['region'],
  seen: SpillRegionRequest[] = [],
): SpillRegionPort {
  return {
    async readSpillRegion(request) {
      seen.push(request)
      return {
        kind: 'spill-region',
        sheetId: request.sheetId,
        region,
        requestId: request.requestId,
      }
    },
  }
}

describe('spill core', () => {
  test('声明的上限是 1 —— 只留活动单元格所在的那一个溢出区', () => {
    expect(SPILL_REGION_CACHE_MAX).toBe(1)
  })

  test('公开 atom 只读，命令 atom 可写，debugLabel 按约定前缀', () => {
    const store = createStore()
    expect(SPILL_PUBLIC_STATE_IS_READ_ONLY).toEqual([false, false, false])
    expect(SPILL_COMMANDS_ARE_WRITABLE).toEqual([true, true, true])
    expect('write' in activeSpillRegionAtom).toBe(false)
    expect(() =>
      Reflect.apply(store.setter, store, [activeSpillRegionAtom, SEQUENCE_REGION]),
    ).toThrow(TypeError)
    expect(store.getter(activeSpillRegionAtom)).toBeNull()
    expect(activeSpillRegionAtom.debugLabel).toBe('spreadsheet.spill.activeRegion')
    expect(spillCellRoleAtom.debugLabel).toBe('spreadsheet.spill.cellRole')
    expect(spillRegionSupportedAtom.debugLabel).toBe('spreadsheet.spill.supported')
  })

  test('端口缺席 = 功能不存在：不报错、不留区域、能力证据为 false', async () => {
    const store = createStore()
    expect(store.setter(captureSpillRegionCapabilityAtom, {})).toBe(false)
    expect(store.getter(spillRegionSupportedAtom)).toBe(false)

    const outcome = await store.setter(refreshSpillRegionAtom, {
      source: {},
      sheetId: 'sheet-1',
      cell: { row: 3, col: 7 },
    })
    expect(outcome).toBe('unsupported')
    expect(store.getter(activeSpillRegionAtom)).toBeNull()
  })

  test('落在数组里 → 缓存区域；选择器分得清锚点与投影格', async () => {
    const store = createStore()
    const seen: SpillRegionRequest[] = []
    const port = portReturning(SEQUENCE_REGION, seen)
    expect(store.setter(captureSpillRegionCapabilityAtom, port)).toBe(true)

    const outcome = await store.setter(refreshSpillRegionAtom, {
      source: port,
      sheetId: 'sheet-1',
      cell: { row: 3, col: 7 },
      revision: 7,
    })
    expect(outcome).toBe('updated')
    expect(seen).toEqual([
      { kind: 'spill-region', sheetId: 'sheet-1', row: 3, col: 7, requestId: 1, revision: 7 },
    ])
    expect(store.getter(activeSpillRegionAtom)).toEqual({ sheetId: 'sheet-1', ...SEQUENCE_REGION })

    const roleAt = store.getter(spillCellRoleAtom)
    expect(roleAt('sheet-1', { row: 0, col: 7 })).toBe('anchor')
    expect(roleAt('sheet-1', { row: 9, col: 7 })).toBe('projected')
    // 区外、另一张表 —— 都不是这个数组的一部分。
    expect(roleAt('sheet-1', { row: 10, col: 7 })).toBeNull()
    expect(roleAt('sheet-1', { row: 3, col: 6 })).toBeNull()
    expect(roleAt('sheet-2', { row: 3, col: 7 })).toBeNull()
  })

  test('region: null 是明确的「不在任何数组里」，清空缓存而不是保留旧框', async () => {
    const store = createStore()
    const port = portReturning(SEQUENCE_REGION)
    await store.setter(refreshSpillRegionAtom, {
      source: port,
      sheetId: 'sheet-1',
      cell: { row: 3, col: 7 },
    })
    expect(store.getter(activeSpillRegionAtom)).not.toBeNull()

    const outcome = await store.setter(refreshSpillRegionAtom, {
      source: portReturning(null),
      sheetId: 'sheet-1',
      cell: { row: 0, col: 0 },
    })
    expect(outcome).toBe('cleared')
    expect(store.getter(activeSpillRegionAtom)).toBeNull()
  })

  test('迟到的旧应答被丢弃 —— 否则框会在两个数组之间来回跳', async () => {
    const store = createStore()
    // 不写成 `(() => void) | null`：TS 的控制流分析看不进 Promise executor，
    // 会把它在 `releaseSlow?.()` 处窄化成 `never`（`tsc -build` 报 TS2349，而
    // jest 走 SWC 剥类型、`solid-excel` 的 tsconfig 又不覆盖本目录，两边都放行）。
    // 一个 no-op 起手值同时表达了「一定有东西可调」。
    let releaseSlow: () => void = () => {}
    const slowRegion = {
      anchor: { row: 0, col: 0 },
      range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 },
    }
    const slowPort: SpillRegionPort = {
      async readSpillRegion(request) {
        await new Promise<void>((resolve) => {
          releaseSlow = resolve
        })
        return { kind: 'spill-region', sheetId: request.sheetId, region: slowRegion }
      },
    }

    const slow = store.setter(refreshSpillRegionAtom, {
      source: slowPort,
      sheetId: 'sheet-1',
      cell: { row: 1, col: 0 },
    })
    // 第二次查询后发先至。
    const fast = await store.setter(refreshSpillRegionAtom, {
      source: portReturning(SEQUENCE_REGION),
      sheetId: 'sheet-1',
      cell: { row: 3, col: 7 },
    })
    expect(fast).toBe('updated')

    releaseSlow()
    expect(await slow).toBe('stale')
    expect(store.getter(activeSpillRegionAtom)).toEqual({ sheetId: 'sheet-1', ...SEQUENCE_REGION })
  })

  test('应答形状不对就整块丢弃，绝不画一个歪掉的框', async () => {
    const store = createStore()
    // 锚点不在矩形左上角 —— wire 坏了。
    const skewed = await store.setter(refreshSpillRegionAtom, {
      source: portReturning({
        anchor: { row: 5, col: 7 },
        range: { rowStart: 0, rowEnd: 9, colStart: 7, colEnd: 7 },
      }),
      sheetId: 'sheet-1',
      cell: { row: 5, col: 7 },
    })
    expect(skewed).toBe('error')
    expect(store.getter(activeSpillRegionAtom)).toBeNull()

    // 端口抛错：装饰性读失败不留陈旧的框。
    const thrown = await store.setter(refreshSpillRegionAtom, {
      source: {
        async readSpillRegion() {
          throw new Error('worker gone')
        },
      },
      sheetId: 'sheet-1',
      cell: { row: 3, col: 7 },
    })
    expect(thrown).toBe('error')
    expect(store.getter(activeSpillRegionAtom)).toBeNull()
  })

  test('后端换成没有端口的那种，旧区域立刻被清掉', async () => {
    const store = createStore()
    await store.setter(refreshSpillRegionAtom, {
      source: portReturning(SEQUENCE_REGION),
      sheetId: 'sheet-1',
      cell: { row: 3, col: 7 },
    })
    expect(store.getter(activeSpillRegionAtom)).not.toBeNull()

    expect(store.setter(captureSpillRegionCapabilityAtom, {})).toBe(false)
    expect(store.getter(activeSpillRegionAtom)).toBeNull()
    expect(store.getter(spillCellRoleAtom)('sheet-1', { row: 3, col: 7 })).toBeNull()
  })

  test('clearSpillRegionAtom 清掉当前区域', async () => {
    const store = createStore()
    await store.setter(refreshSpillRegionAtom, {
      source: portReturning(SEQUENCE_REGION),
      sheetId: 'sheet-1',
      cell: { row: 3, col: 7 },
    })
    store.setter(clearSpillRegionAtom)
    expect(store.getter(activeSpillRegionAtom)).toBeNull()
  })
})
