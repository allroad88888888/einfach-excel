/** 单类未转换或降级项的计数。 */
export interface XlsxConversionReportItem {
  readonly kind: string
  readonly count: number
}

/** 导入或导出 XLSX 时的结构化转换报告。 */
export interface XlsxConversionReport {
  readonly items?: readonly XlsxConversionReportItem[]
  readonly summary: string
}

/** `@einfach-excel/xlsx` 的函数形状；组件包不直接依赖它，由宿主按需注入。 */
export interface XlsxConverter {
  xlsxToNative(bytes: Uint8Array, title: string): string
  nativeToXlsx(text: string): Uint8Array
  xlsxToNativeWithReport?(
    bytes: Uint8Array,
    title: string,
  ): {
    readonly text: string
    readonly report: string
  }
  nativeToXlsxWithReport?(text: string): {
    readonly bytes: Uint8Array
    readonly report: string
  }
}

/** 宿主传入的懒加载器，例如 `async () => { const m = await import('@einfach-excel/xlsx'); await m.default(); return m }`。 */
export type XlsxConverterLoader = () => Promise<XlsxConverter>

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const loaded = new WeakMap<XlsxConverterLoader, Promise<XlsxConverter>>()

/** 同一加载器只下载一次 WASM；失败后清缓存，下次手势可以重试。 */
export function loadXlsxConverter(loader: XlsxConverterLoader): Promise<XlsxConverter> {
  let pending = loaded.get(loader)
  if (!pending) {
    pending = loader().catch((error: unknown) => {
      loaded.delete(loader)
      throw error
    })
    loaded.set(loader, pending)
  }
  return pending
}

export function isXlsxFile(file: File): boolean {
  return /\.xlsx$/i.test(file.name) || file.type === XLSX_MIME_TYPE
}

/** 工作簿标题取文件名去扩展名。 */
export function workbookTitleOf(file: File): string {
  return file.name.replace(/\.[^.]+$/, '').trim() || 'Workbook'
}

export function xlsxFilename(nativeFilename: string): string {
  return `${nativeFilename.replace(/\.einfach\.json$/i, '')}.xlsx`
}

function parseReport(raw: string): XlsxConversionReport {
  try {
    const parsed = JSON.parse(raw) as Partial<XlsxConversionReport>
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    }
  } catch {
    return { items: [], summary: '' }
  }
}

/** 导入 XLSX 并提取转换警告报告；若注入旧版转换器则退化为无报告导入。 */
export function convertXlsxToNative(
  converter: XlsxConverter,
  bytes: Uint8Array,
  title: string,
): {
  readonly text: string
  readonly report: XlsxConversionReport
  readonly message: string
} {
  if (typeof converter.xlsxToNativeWithReport === 'function') {
    const output = converter.xlsxToNativeWithReport(bytes, title)
    const report = parseReport(output.report)
    return { text: output.text, report, message: report.summary }
  }
  return {
    text: converter.xlsxToNative(bytes, title),
    report: { items: [], summary: '' },
    message: '',
  }
}

/** 导出 XLSX 并提取转换警告报告；若注入旧版转换器则退化为无报告导出。 */
export function convertNativeToXlsx(
  converter: XlsxConverter,
  text: string,
): {
  readonly bytes: Uint8Array
  readonly report: XlsxConversionReport
  readonly message: string
} {
  if (typeof converter.nativeToXlsxWithReport === 'function') {
    const output = converter.nativeToXlsxWithReport(text)
    const report = parseReport(output.report)
    return { bytes: output.bytes, report, message: report.summary }
  }
  return {
    bytes: converter.nativeToXlsx(text),
    report: { items: [], summary: '' },
    message: '',
  }
}
