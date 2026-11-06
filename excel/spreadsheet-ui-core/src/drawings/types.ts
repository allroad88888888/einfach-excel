/** 浮动对象左上角挂在单元格上；偏移与尺寸是 100% 缩放下的 CSS 像素。 */
export interface DrawingAnchor {
  readonly row: number
  readonly col: number
  readonly offsetX: number
  readonly offsetY: number
  readonly width: number
  readonly height: number
}

/**
 * 对象读取的区域；结构编辑删光时 Rust 写成 `null`（等同 #REF!），下标保持不变。
 * `sheetId` 缺省是对象所在表；指向其他表时，那张表插删行列也会移动这条引用。
 */
export interface DrawingRange {
  readonly sheetId?: string
  readonly startRow: number
  readonly startCol: number
  readonly endRow: number
  readonly endCol: number
}

/** `kind` 与 `payload` 由插件定义；核心只负责位置、引用随结构移动、历史与保存。 */
export interface SheetDrawing {
  readonly id: string
  readonly kind: string
  readonly anchor: DrawingAnchor
  readonly refs: readonly (DrawingRange | null)[]
  readonly payload: Readonly<Record<string, unknown>>
}

export const MAX_DRAWING_SIZE_PX = 10_000
export const MIN_DRAWING_SIZE_PX = 16
