/** `@einfach-excel/xlsx` 的函数形状；组件包不直接依赖它，由宿主按需注入。 */
export interface XlsxConverter {
  xlsxToNative(bytes: Uint8Array, title: string): string
  nativeToXlsx(text: string): Uint8Array
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
