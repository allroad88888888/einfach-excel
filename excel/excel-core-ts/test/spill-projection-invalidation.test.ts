/**
 * 溢出投影的**失效**这一半：读到投影值的公式，什么时候必须重新算。
 *
 * 值这一半在兄弟文件 `spill-projection.test.ts`。分开的理由是失败时要回答的问题
 * 不同：那边问「这一格该读到什么」，这边问「锚点动了之后读者跟不跟」。
 *
 * 难点在于投影格在 `cells` 里**没有条目**：读者 `=A2` 的静态依赖指向 A2 自己，
 * 而没有任何一次写入会落在 A2 上 —— 是 A1 的重算让 A2 的值变了。所以求值器要
 * 额外登记一条**运行期区域依赖**（锚点可能待的那片回看象限）。最后一条
 * （「锚点在读者之后才出现」）钉的正是这条象限依赖：只看住「已经见过的候选」
 * 答不出那一刻，同一条公式的答案会取决于两次写入的先后。
 */

import { describe, expect, test } from '@jest/globals'

import { createWorkbook } from '../src/workbook'
import { keyFor } from '../src/sheet'
import type { Value } from '../src/types'

const num = (value: number): Value => ({ kind: 'number', value })

function makeWorkbook(seed = '=SEQUENCE(3)') {
  const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
  const sheet = wb.sheet('s1')!
  const read = (row: number, col: number): Value =>
    wb.store.getter(sheet.formulaCellAtom(keyFor(row, col)))
  if (seed.length > 0) wb.setCell('s1', 0, 0, seed) // A1 → A1:A3 = 1,2,3
  return { wb, read }
}

describe('spill projection — 依赖与失效', () => {
  test('锚点变形状 → 读投影的公式跟着改口', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 2, '=SUM(A1:A3)')
    wb.setCell('s1', 1, 2, '=A2')
    expect(read(0, 2)).toEqual(num(6))
    expect(read(1, 2)).toEqual(num(2))

    wb.setCell('s1', 0, 0, '=SEQUENCE(2)') // A1:A2 = 1,2
    expect(read(0, 2)).toEqual(num(3))
    expect(read(1, 2)).toEqual(num(2))
  })

  test('锚点变值 → 单地址读跟着改口', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 2, '=A2')
    expect(read(0, 2)).toEqual(num(2))
    wb.setCell('s1', 0, 0, '=SEQUENCE(3)*10')
    expect(read(0, 2)).toEqual(num(20))
  })

  test('清掉锚点 → 投影消失', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 2, '=A2')
    wb.setCell('s1', 1, 2, '=SUM(A1:A3)')
    expect(read(0, 2)).toEqual(num(2))
    expect(read(1, 2)).toEqual(num(6))

    wb.clearCell('s1', 0, 0, 'all')
    expect(read(0, 2)).toEqual({ kind: 'blank' })
    expect(read(1, 2)).toEqual(num(0))
  })

  test('锚点在读者**之后**才出现 —— 读者仍然要被叫醒', () => {
    // 这一条是运行期依赖登记的关键：读者算过一次的时候 A 列一格都没有，
    // 「看住已经见过的候选」答不出这一刻。所以看住的是**回看象限**。
    const { wb, read } = makeWorkbook('')
    wb.setCell('s1', 0, 2, '=A2')
    wb.setCell('s1', 1, 2, '=SUM(A1:A3)')
    expect(read(0, 2)).toEqual({ kind: 'blank' })
    expect(read(1, 2)).toEqual(num(0))

    wb.setCell('s1', 0, 0, '=SEQUENCE(3)')
    expect(read(0, 2)).toEqual(num(2))
    expect(read(1, 2)).toEqual(num(6))
  })

  test('投影格被真正写入 → 按 ADR 0006 整片收回，读者看到的是写进去的值', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 2, '=A2')
    expect(read(0, 2)).toEqual(num(2))

    wb.setCell('s1', 1, 0, '99') // 往 A2 里打字
    expect(read(0, 0)).toMatchObject({ kind: 'error', code: '#SPILL!' })
    expect(read(0, 2)).toEqual(num(99))
  })
})
