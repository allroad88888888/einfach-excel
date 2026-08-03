/**
 * 溢出碰撞：**别的数组的投影格也算阻塞物**。
 *
 * TS 侧的投影格是虚的（`cells` 里没有条目，读的时候才从锚点投影出来），所以
 * 「遍历 `cells` 找落在矩形里的条目」这条老检测对「阻塞物是另一个数组的投影格」
 * 这一整类碰撞一条都报不出来 —— 两个数组会当场重叠，还产出**不同于 Rust 的值**。
 *
 * 每一条都走 `createWorkbook` + 真实公式路径（不直接调 `checkSpillCollision`）：
 * 这一族缺陷的形态就是「单测绿、端到端错」，只测内部函数抓不住投影层。
 *
 * 跨引擎那一钉在 `excel/solid-excel/test/cross-engine-parity-spill.test.ts`。
 */

import { describe, expect, test } from '@jest/globals'

import { createWorkbook } from '../src/workbook'
import { keyFor } from '../src/sheet'
import type { Value } from '../src/types'

const num = (value: number): Value => ({ kind: 'number', value })

function makeWorkbook() {
  const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
  const sheet = wb.sheet('s1')!
  const read = (row: number, col: number): Value =>
    wb.store.getter(sheet.formulaCellAtom(keyFor(row, col)))
  return { wb, sheet, read }
}

describe('spill collision — another array’s projection cells occupy the rect', () => {
  test('C1=SEQUENCE(3) 的投影格 C2 挡住后写的 A2={1,2,3,4}', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 2, '=SEQUENCE(3)') // C1 → C1:C3
    wb.setCell('s1', 1, 0, '={1,2,3,4}') // A2 → A2:D2，行主序第一个撞上 C2

    expect(read(1, 0)).toMatchObject({ kind: 'error', code: '#SPILL!' })
    // 先来的那片一字未动。
    expect(read(0, 2)).toMatchObject({ kind: 'array' })
  })

  test('先声明的赢：A2 先写时，反过来是 C1 变 #SPILL!', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 1, 0, '={1,2,3,4}') // A2 → A2:D2
    wb.setCell('s1', 0, 2, '=SEQUENCE(3)') // C1 想占 C1:C3，C2 已被 A2 占住

    expect(read(0, 2)).toMatchObject({ kind: 'error', code: '#SPILL!' })
    expect(read(1, 0)).toMatchObject({ kind: 'array' })
  })

  test('读的顺序不改变判定 —— 先读后来的那一个，答案一样', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 2, '=SEQUENCE(3)')
    wb.setCell('s1', 1, 0, '={1,2,3,4}')

    // 反过来先读 A2：懒求值不能让「谁先被读」决定「谁变 #SPILL!」。
    expect(read(1, 0)).toMatchObject({ kind: 'error', code: '#SPILL!' })
    expect(read(0, 2)).toMatchObject({ kind: 'array' })
  })

  test('清掉先声明的那一片，后来的复活', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 2, '=SEQUENCE(3)')
    wb.setCell('s1', 1, 0, '={1,2,3,4}')
    expect(read(1, 0)).toMatchObject({ kind: 'error', code: '#SPILL!' })

    wb.clearCell('s1', 0, 2, 'all')
    expect(read(1, 0)).toMatchObject({ kind: 'array' })

    // 再把它写回去：现在轮到它是后来的那一个。
    wb.setCell('s1', 0, 2, '=SEQUENCE(3)')
    expect(read(0, 2)).toMatchObject({ kind: 'error', code: '#SPILL!' })
    expect(read(1, 0)).toMatchObject({ kind: 'array' })
  })

  test('矩形只是擦肩而过时不报 —— 相邻但不相交的两片都活着', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 2, '=SEQUENCE(3)') // C1:C3
    wb.setCell('s1', 1, 0, '={1,2}') // A2:B2，右端停在 B2

    expect(read(1, 0)).toMatchObject({ kind: 'array' })
    expect(read(0, 2)).toMatchObject({ kind: 'array' })
  })

  test('挡路的锚点自己是 #SPILL! 时不占地方', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 1, 2, 'blocker') // C2 —— 把 C1 的矩形先堵死
    wb.setCell('s1', 0, 2, '=SEQUENCE(3)') // C1 → #SPILL!，一格都不占
    wb.setCell('s1', 2, 0, '={1,2,3,4}') // A3:D3，只会撞上 C3（若 C1 真溢出了）

    expect(read(0, 2)).toMatchObject({ kind: 'error', code: '#SPILL!' })
    expect(read(2, 0)).toMatchObject({ kind: 'array' })
  })

  test('读锚点格的公式不会被误判成循环引用', () => {
    // 碰撞检测要探测 A1（它排在 C1 前面），而 A1 又回读 C1 —— 若探测时让它撞上
    // 「求值中」，C1 会被错判 #CIRCULAR!。
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 0, '=C1+1') // A1，先声明
    wb.setCell('s1', 0, 2, '=SEQUENCE(3)') // C1:C3

    expect(read(0, 2)).toEqual({
      kind: 'array',
      value: [[num(1)], [num(2)], [num(3)]],
    })
    // 锚点格作为单元格引用被读到时是**左上角那个标量**（Excel / Rust 同判），
    // 所以 A1 = 1 + 1 = 2，不是一片广播出来的数组。整片只有 `C1#` 拿得到。
    expect(read(0, 0)).toEqual(num(2))
  })

  test('往投影格里写入仍然照 ADR 0006 收回整片（无论写的是不是数组）', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 0, '=SEQUENCE(3)') // A1:A3
    expect(read(0, 0)).toMatchObject({ kind: 'array' })

    // A2 是 A1 的投影格：写进去 → A1 收回变 #SPILL!，新公式自己铺开。
    wb.setCell('s1', 1, 0, '={1,2}')
    expect(read(0, 0)).toMatchObject({ kind: 'error', code: '#SPILL!' })
    expect(read(1, 0)).toMatchObject({ kind: 'array' })
  })

  test('探测会嵌套：第三片要先算第二片，而第二片自己也在探测第一片', () => {
    const { wb, read } = makeWorkbook()
    wb.setCell('s1', 0, 1, '=SEQUENCE(3)') // B1:B3，第一片
    wb.setCell('s1', 1, 0, '={1,2}') // A2:B2 撞 B2 → #SPILL!
    wb.setCell('s1', 2, 0, '={1,2,3}') // A3:C3 撞 B3 → #SPILL!

    // 声明顺序严格递减，所以探测链一定终止（不循环、不需要防环）。
    expect(read(0, 1)).toMatchObject({ kind: 'array' })
    expect(read(1, 0)).toMatchObject({ kind: 'error', code: '#SPILL!' })
    expect(read(2, 0)).toMatchObject({ kind: 'error', code: '#SPILL!' })
  })

  test('setCellValue 塞进来的数组锚点同样占地方（不用求值就知道形状）', () => {
    const { wb, read } = makeWorkbook()
    wb.setCellValue('s1', 0, 2, {
      kind: 'array',
      value: [[num(1)], [num(2)], [num(3)]],
    })
    wb.setCell('s1', 1, 0, '={1,2,3,4}')

    expect(read(1, 0)).toMatchObject({ kind: 'error', code: '#SPILL!' })
  })
})
