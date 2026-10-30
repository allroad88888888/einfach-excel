/** 用临时 Blob 地址触发浏览器下载。 */
export function downloadFile(body: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename
  document.body.append(anchor); anchor.click(); anchor.remove()
  // 给浏览器下载任务一个读取 Blob 的机会，随后回收临时地址。
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
