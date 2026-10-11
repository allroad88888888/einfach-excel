import { atom, type Getter, type Setter } from '@einfach/core'

export interface NativeOutlineGroup {
  readonly start: number
  readonly end: number
  readonly collapsed: boolean
}
export interface NativeOutline {
  readonly rows: readonly NativeOutlineGroup[]
  readonly columns: readonly NativeOutlineGroup[]
}
export type NativeOutlineAction =
  | { readonly kind: 'group' | 'ungroup'; readonly start: number; readonly end: number }
  | { readonly kind: 'set-collapsed'; readonly index: number; readonly collapsed: boolean }
  | { readonly kind: 'show-level'; readonly level: number }

export interface NativeOutlineProjection {
  readonly outline?: NativeOutline
  readonly outlineRows?: readonly number[]
  readonly outlineColumns?: readonly number[]
}

export const EMPTY_NATIVE_OUTLINE: NativeOutline = Object.freeze({ rows: [], columns: [] })
/** 只缓存 Rust 已确认的投影；没有本地分组修改、历史或结构位移。 */
export const nativeOutlineProjectionBackingAtom = atom<Record<string, NativeOutlineProjection>>({})

/** 仅检查传输形状；分组重叠、深度与命令规则仍由 Rust 判断。 */
export function validNativeOutline(value: unknown): value is NativeOutline {
  if (!value || typeof value !== 'object') return false
  const outline = value as NativeOutline
  return (
    [
      ['rows', 1_048_576],
      ['columns', 16_384],
    ] as const
  ).every(
    ([axis, count]) =>
      Array.isArray(outline[axis]) &&
      outline[axis].length <= 4096 &&
      outline[axis].every(
        (group) =>
          group &&
          Number.isSafeInteger(group.start) &&
          Number.isSafeInteger(group.end) &&
          group.start >= 0 &&
          group.start <= group.end &&
          group.end < count &&
          typeof group.collapsed === 'boolean',
      ),
  )
}

/** 相同几何保持引用；滚动读取不能不断触发尺寸变化和下一次窗口请求。 */
export function applyNativeOutlineProjection(
  get: Getter,
  set: Setter,
  sheetId: string,
  next: NativeOutlineProjection,
) {
  const map = get(nativeOutlineProjectionBackingAtom)
  const previous = map[sheetId]
  const sameIndices = (a: readonly number[] = [], b: readonly number[] = []) =>
    a.length === b.length && a.every((n, i) => n === b[i])
  const sameGroups = (
    a: readonly NativeOutlineGroup[] = [],
    b: readonly NativeOutlineGroup[] = [],
  ) =>
    a.length === b.length &&
    a.every(
      (g, i) => g.start === b[i].start && g.end === b[i].end && g.collapsed === b[i].collapsed,
    )
  if (
    sameIndices(previous?.outlineRows, next.outlineRows) &&
    sameIndices(previous?.outlineColumns, next.outlineColumns) &&
    sameGroups(previous?.outline?.rows, next.outline?.rows) &&
    sameGroups(previous?.outline?.columns, next.outline?.columns)
  )
    return
  const groups = (values: readonly NativeOutlineGroup[]) =>
    Object.freeze(values.map((group) => Object.freeze({ ...group })))
  set(nativeOutlineProjectionBackingAtom, {
    ...map,
    [sheetId]: Object.freeze({
      outline: Object.freeze({
        rows: groups(next.outline?.rows ?? []),
        columns: groups(next.outline?.columns ?? []),
      }),
      outlineRows: Object.freeze([...(next.outlineRows ?? [])]),
      outlineColumns: Object.freeze([...(next.outlineColumns ?? [])]),
    }),
  })
}

/** 由已排序的原生分组派生画线层级，不在视图里另存大纲模型。 */
export function nativeOutlineLevels(groups: readonly NativeOutlineGroup[]) {
  const ancestors: NativeOutlineGroup[] = []
  return groups.map((group, index) => {
    while (ancestors.length && ancestors[ancestors.length - 1].end < group.start) ancestors.pop()
    const hiddenByParent = ancestors.some((parent) => parent.collapsed)
    ancestors.push(group)
    return { ...group, index, level: ancestors.length, hiddenByParent }
  })
}
