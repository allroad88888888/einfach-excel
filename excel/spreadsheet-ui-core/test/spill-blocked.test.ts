/**
 * `#SPILL!` 说得出自己被谁挡住 —— UI core 这一侧。
 *
 * 与 `spill.test.ts` 分开：那边问「框画不画、画在哪」，这边问「说不说得出理由、
 * 什么时候必须闭嘴」。后者的失效模式是**误导**（指着一个清了也没用的格子），比
 * 「框没画出来」严重得多，所以单独钉。
 */
import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import {
  activeSpillBlockageAtom,
  activeSpillRegionAtom,
  captureSpillRegionCapabilityAtom,
  clearSpillRegionAtom,
  refreshSpillRegionAtom,
  SPILL_BLOCKAGE_CACHE_MAX,
  type SpillRegionPort,
  type SpillRegionResult,
} from '../src/spill'

type AtomHasPublicWrite<Entity> = Entity extends { write: unknown } ? true : false

const BLOCKAGE_STATE_IS_READ_ONLY: AtomHasPublicWrite<typeof activeSpillBlockageAtom> = false

/** `H1` 上一个 `=SEQUENCE(10)`：锚点 (0,7)，溢出到 H1:H10。 */
const SEQUENCE_REGION = {
  anchor: { row: 0, col: 7 },
  range: { rowStart: 0, rowEnd: 9, colStart: 7, colEnd: 7 },
}

/** 后端说「你不在任何数组里」，外加一条可选的阻塞线索。 */
function portAnswering(payload: Partial<SpillRegionResult>): SpillRegionPort {
  return {
    async readSpillRegion(request) {
      return {
        kind: 'spill-region',
        sheetId: request.sheetId,
        region: null,
        requestId: request.requestId,
        ...payload,
      }
    },
  }
}

/** H3(2,7) 挡住 H1 上的数组。 */
const H3 = { row: 2, col: 7 }

describe('spill blockage', () => {
  test('声明的上限是 1 —— 只留当前选中那个锚点的一条线索', () => {
    expect(SPILL_BLOCKAGE_CACHE_MAX).toBe(1)
  })

  test('公开 atom 只读，debugLabel 按约定前缀', () => {
    const store = createStore()
    expect(BLOCKAGE_STATE_IS_READ_ONLY).toBe(false)
    expect('write' in activeSpillBlockageAtom).toBe(false)
    expect(() =>
      Reflect.apply(store.setter, store, [activeSpillBlockageAtom, null]),
    ).toThrow(TypeError)
    expect(activeSpillBlockageAtom.debugLabel).toBe('spreadsheet.spill.activeBlockage')
  })

  test('碰撞态锚点：没有框，但有一条线索，且 outcome 与「什么都没有」区分得开', async () => {
    const store = createStore()
    const outcome = await store.setter(refreshSpillRegionAtom, {
      source: portAnswering({ blockedBy: H3 }),
      sheetId: 'sheet-1',
      cell: { row: 0, col: 7 },
    })

    expect(outcome).toBe('blocked')
    expect(store.getter(activeSpillRegionAtom)).toBeNull()
    expect(store.getter(activeSpillBlockageAtom)).toEqual({
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 7 },
      blockedBy: H3,
    })
  })

  test('后端不带线索 → 什么都不说，outcome 退回 cleared', async () => {
    const store = createStore()
    const outcome = await store.setter(refreshSpillRegionAtom, {
      source: portAnswering({}),
      sheetId: 'sheet-1',
      cell: { row: 0, col: 7 },
    })

    expect(outcome).toBe('cleared')
    expect(store.getter(activeSpillBlockageAtom)).toBeNull()
  })

  test('线索坐标不合法就整条丢掉 —— 宁可不说，也不指一个错格子', async () => {
    const store = createStore()
    for (const bad of [{ row: -1, col: 7 }, { row: 1.5, col: 7 }, { row: 2 }, 'H3', null]) {
      const outcome = await store.setter(refreshSpillRegionAtom, {
        source: portAnswering({ blockedBy: bad as never }),
        sheetId: 'sheet-1',
        cell: { row: 0, col: 7 },
      })
      expect(outcome).toBe('cleared')
      expect(store.getter(activeSpillBlockageAtom)).toBeNull()
    }
  })

  test('选区移进一个活着的数组 → 线索必须消失，否则会挂着上一个锚点的话', async () => {
    const store = createStore()
    await store.setter(refreshSpillRegionAtom, {
      source: portAnswering({ blockedBy: H3 }),
      sheetId: 'sheet-1',
      cell: { row: 0, col: 7 },
    })
    expect(store.getter(activeSpillBlockageAtom)).not.toBeNull()

    const outcome = await store.setter(refreshSpillRegionAtom, {
      source: portAnswering({ region: SEQUENCE_REGION }),
      sheetId: 'sheet-1',
      cell: { row: 3, col: 7 },
    })
    expect(outcome).toBe('updated')
    expect(store.getter(activeSpillBlockageAtom)).toBeNull()
    expect(store.getter(activeSpillRegionAtom)).not.toBeNull()
  })

  test('端口抛错 / 应答形状不对 → 线索一起清掉', async () => {
    const store = createStore()
    await store.setter(refreshSpillRegionAtom, {
      source: portAnswering({ blockedBy: H3 }),
      sheetId: 'sheet-1',
      cell: { row: 0, col: 7 },
    })

    const thrown = await store.setter(refreshSpillRegionAtom, {
      source: {
        async readSpillRegion() {
          throw new Error('worker gone')
        },
      },
      sheetId: 'sheet-1',
      cell: { row: 0, col: 7 },
    })
    expect(thrown).toBe('error')
    expect(store.getter(activeSpillBlockageAtom)).toBeNull()
  })

  test('端口缺席 / 手动清空 → 线索一起没', async () => {
    const store = createStore()
    const seed = async () => {
      await store.setter(refreshSpillRegionAtom, {
        source: portAnswering({ blockedBy: H3 }),
        sheetId: 'sheet-1',
        cell: { row: 0, col: 7 },
      })
      expect(store.getter(activeSpillBlockageAtom)).not.toBeNull()
    }

    await seed()
    expect(store.setter(captureSpillRegionCapabilityAtom, {})).toBe(false)
    expect(store.getter(activeSpillBlockageAtom)).toBeNull()

    await seed()
    store.setter(clearSpillRegionAtom)
    expect(store.getter(activeSpillBlockageAtom)).toBeNull()

    await seed()
    const unsupported = await store.setter(refreshSpillRegionAtom, {
      source: {},
      sheetId: 'sheet-1',
      cell: { row: 0, col: 7 },
    })
    expect(unsupported).toBe('unsupported')
    expect(store.getter(activeSpillBlockageAtom)).toBeNull()
  })

  test('迟到的旧应答不许把线索塞回来', async () => {
    const store = createStore()
    let releaseSlow: () => void = () => {}
    const slowPort: SpillRegionPort = {
      async readSpillRegion(request) {
        await new Promise<void>((resolve) => {
          releaseSlow = resolve
        })
        return { kind: 'spill-region', sheetId: request.sheetId, region: null, blockedBy: H3 }
      },
    }

    const slow = store.setter(refreshSpillRegionAtom, {
      source: slowPort,
      sheetId: 'sheet-1',
      cell: { row: 0, col: 7 },
    })
    const fast = await store.setter(refreshSpillRegionAtom, {
      source: portAnswering({ region: SEQUENCE_REGION }),
      sheetId: 'sheet-1',
      cell: { row: 3, col: 7 },
    })
    expect(fast).toBe('updated')

    releaseSlow()
    expect(await slow).toBe('stale')
    expect(store.getter(activeSpillBlockageAtom)).toBeNull()
    expect(store.getter(activeSpillRegionAtom)).not.toBeNull()
  })
})
