/** 按可见索引移动；边界命令向表内找，步进命令越过隐藏项，不改变源坐标体系。 */
export function visibleAxisDestination(
  from: number,
  count: number,
  hidden: ReadonlySet<number> | undefined,
  absolute: number | undefined,
  delta: number | undefined,
): number | undefined {
  if (!hidden?.size || (absolute === undefined && delta === undefined)) return absolute
  if (absolute !== undefined) {
    const step = absolute === 0 ? 1 : -1
    for (let index = absolute; index >= 0 && index < count; index += step)
      if (!hidden.has(index)) return index
    return from
  }
  const direction = Math.sign(delta ?? 0)
  let remaining = Math.abs(delta ?? 0)
  let result = from
  for (
    let index = from + direction;
    direction !== 0 && index >= 0 && index < count && remaining > 0;
    index += direction
  ) {
    if (!hidden.has(index)) {
      result = index
      remaining--
    }
  }
  return result
}
