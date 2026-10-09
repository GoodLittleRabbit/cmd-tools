/**
 * 列表可视窗口：按终端行数只渲染一段，光标移出窗口时滚动。
 * 纯函数，供 SelectList / GroupPicker 共用。
 */

export type ListWindow = {
  /** 可见区间 [start, end) */
  start: number
  end: number
  /** 上方还有未显示项 */
  moreAbove: boolean
  /** 下方还有未显示项 */
  moreBelow: boolean
}

/**
 * 根据当前光标与窗口容量，算出应渲染的切片。
 * `scrollStart` 为上一帧窗口起点；返回值里的 `start` 可写回状态。
 */
export function resolveListWindow(
  cursor: number,
  length: number,
  capacity: number,
  scrollStart: number,
): ListWindow {
  if (length <= 0) {
    return { start: 0, end: 0, moreAbove: false, moreBelow: false }
  }
  const cap = Math.max(1, Math.floor(capacity))
  if (length <= cap) {
    return { start: 0, end: length, moreAbove: false, moreBelow: false }
  }

  const cur = Math.min(Math.max(0, cursor), length - 1)
  let start = Math.min(Math.max(0, scrollStart), length - cap)
  if (cur < start) start = cur
  else if (cur >= start + cap) start = cur - cap + 1

  const end = start + cap
  return {
    start,
    end,
    moreAbove: start > 0,
    moreBelow: end < length,
  }
}

/** 终端可用行 → 最多展示几条列表项（每项约占 itemRows 行） */
export function listCapacityFromRows(
  terminalRows: number,
  reservedRows: number,
  itemRows = 2,
): number {
  const usable = Math.max(1, Math.floor(terminalRows) - Math.max(0, reservedRows))
  return Math.max(3, Math.floor(usable / Math.max(1, itemRows)))
}
