/**
 * 名字的规范化。
 *
 * 职责：把工作簿里的一个名字（定义名 / LAMBDA 参数 / LET 绑定）折成查表用的键
 * —— Excel 的名字大小写不敏感。
 */


export function canonicalName(name: string): string {
  return name.toUpperCase()
}
