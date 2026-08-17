// 一句话：AD-828 演示服务端的内存工作簿 —— 确定性种子、窗口读取与单格写入。
//
// 100,000 行 × 6 列全部在服务端进程内存中物化；浏览器侧只经
// `server.mjs` 的三个端点按视口窗口读取。种子是确定性的（同一坐标恒得同一值），
// 便于探针断言远端数据真的渲染出来了。

export const REMOTE_SHEET_ID = 'remote-sheet'
export const ROW_COUNT = 100_000
export const COL_COUNT = 6

/** 防御性响应上限：单次投影响应最多携带的格数（正常视口窗口远低于此）。 */
export const MAX_CELLS_PER_RESPONSE = 20_000

const CATEGORIES = ['north', 'south', 'east', 'west', 'online', 'retail', 'ship', 'direct']

function seedRow(rowIndex) {
  const n = rowIndex + 1
  return [
    `R${n}`,
    n,
    (n * 37) % 9973,
    ((n * 7919) % 100_000) / 100,
    CATEGORIES[rowIndex % CATEGORIES.length],
    ((rowIndex % 13) + 1) * ((rowIndex % 7) + 1),
  ]
}

function toDisplayCell(row, col, value) {
  if (typeof value === 'number') {
    return { row, col, displayValue: String(value), valueKind: 'number', numericValue: value }
  }
  return { row, col, displayValue: String(value), valueKind: 'string' }
}

function clampIndex(value, max) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(Math.trunc(value), 0), max)
}

export function createRemoteWorkbook() {
  const rows = new Array(ROW_COUNT)
  for (let r = 0; r < ROW_COUNT; r += 1) {
    rows[r] = seedRow(r)
  }
  let revision = 1
  let fullWorkbookCellsJsonBytes = null

  /** 把窗口内的已填充格投影成 DisplayCell 数组（含防御性 cap）。 */
  function readCells(window) {
    const rowStart = clampIndex(window.rowStart, ROW_COUNT - 1)
    const rowEnd = clampIndex(window.rowEnd, ROW_COUNT - 1)
    const colStart = clampIndex(window.colStart, COL_COUNT - 1)
    const colEnd = clampIndex(window.colEnd, COL_COUNT - 1)
    const cells = []
    let truncated = false
    for (let r = rowStart; r <= rowEnd && !truncated; r += 1) {
      for (let c = colStart; c <= colEnd; c += 1) {
        if (cells.length >= MAX_CELLS_PER_RESPONSE) {
          truncated = true
          break
        }
        cells.push(toDisplayCell(r, c, rows[r][c]))
      }
    }
    return { cells, truncated }
  }

  /**
   * 提交一格原始输入。公式在这个演示后端不受支持 —— 按契约必须拒绝而不是
   * 回一个成功形状的 ACK（否则击键会凭空消失）。
   */
  function setCellInput(row, col, input) {
    if (
      !Number.isInteger(row) || !Number.isInteger(col) ||
      row < 0 || row >= ROW_COUNT || col < 0 || col >= COL_COUNT
    ) {
      return { ok: false, message: `cell out of bounds: row=${row} col=${col}` }
    }
    if (typeof input !== 'string') {
      return { ok: false, message: 'input must be a string' }
    }
    if (input.startsWith('=')) {
      return { ok: false, message: 'formulas are not supported by the AD-828 demo remote backend' }
    }
    const numeric = input.trim() === '' ? Number.NaN : Number(input)
    rows[row][col] = Number.isFinite(numeric) ? numeric : input
    revision += 1
    return { ok: true, revision }
  }

  /**
   * 全簿单元格按与视口响应完全相同的 DisplayCell JSON 形状序列化成一个
   * `cells` 数组时的 UTF-8 字节数。惰性计算一次、之后缓存 —— 它只用来给
   * 观察记录一个「同口径的全簿基线」，不是传输实现。写入会让缓存失效。
   */
  function measureFullWorkbookCellsJsonBytes() {
    if (fullWorkbookCellsJsonBytes !== null) return fullWorkbookCellsJsonBytes
    let bytes = 2 // '[' + ']'
    let count = 0
    for (let r = 0; r < ROW_COUNT; r += 1) {
      for (let c = 0; c < COL_COUNT; c += 1) {
        bytes += Buffer.byteLength(JSON.stringify(toDisplayCell(r, c, rows[r][c])), 'utf8')
        count += 1
      }
    }
    bytes += count - 1 // separating commas
    fullWorkbookCellsJsonBytes = bytes
    return bytes
  }

  return {
    sheetId: REMOTE_SHEET_ID,
    rowCount: ROW_COUNT,
    colCount: COL_COUNT,
    populatedCellCount: ROW_COUNT * COL_COUNT,
    getRevision: () => revision,
    readCells,
    setCellInput: (row, col, input) => {
      const outcome = setCellInput(row, col, input)
      if (outcome.ok) fullWorkbookCellsJsonBytes = null
      return outcome
    },
    measureFullWorkbookCellsJsonBytes,
  }
}
