import { useEffect, useMemo, useState } from 'react'
import { useStdout } from 'ink'

import { listCapacityFromRows, resolveListWindow, type ListWindow } from './list-window.js'

/** Banner + 步骤条 + 上下文 + 说明 + 底栏，给向导页预留的默认行数 */
export const DEFAULT_LIST_RESERVED_ROWS = 12

/**
 * 按终端高度裁剪列表可视窗口；光标移出时滚动，并响应 resize。
 */
export function useListWindow(
  cursor: number,
  length: number,
  reservedRows = DEFAULT_LIST_RESERVED_ROWS,
): ListWindow {
  const { stdout } = useStdout()
  const [rows, setRows] = useState(() => stdout?.rows ?? 24)
  const [scrollStart, setScrollStart] = useState(0)

  useEffect(() => {
    if (!stdout) return
    const sync = () => setRows(stdout.rows || 24)
    sync()
    stdout.on('resize', sync)
    return () => {
      stdout.off('resize', sync)
    }
  }, [stdout])

  const capacity = useMemo(
    () => listCapacityFromRows(rows, reservedRows),
    [rows, reservedRows],
  )

  const win = useMemo(
    () => resolveListWindow(cursor, length, capacity, scrollStart),
    [cursor, length, capacity, scrollStart],
  )

  useEffect(() => {
    if (win.start !== scrollStart) setScrollStart(win.start)
  }, [win.start, scrollStart])

  return win
}
