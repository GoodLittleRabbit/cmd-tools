/** 统一时间：Asia/Shanghai，展示用 yyyy-MM-dd HH:mm:ss */

const TZ = 'Asia/Shanghai';

function shanghaiParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** 日志 / 界面：`2026-09-28 16:55:01` */
export function formatDateTime(d = new Date()): string {
  const p = shanghaiParts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * 文件名用紧凑戳：`20260928-165501`（无空格冒号，便于落盘）。
 * 列表展示请用 {@link formatStampDisplay}。
 */
export function formatStamp(d = new Date()): string {
  const p = shanghaiParts(d);
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
}

/** `20260928-165501` → `2026-09-28 16:55:01`；认不出则原样返回 */
export function formatStampDisplay(stamp: string): string {
  const m = stamp.trim().match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return stamp;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
}
