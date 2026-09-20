import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOG_DIR = path.join(os.homedir(), '.cache', 'cmd-tools', 'logs');
const FAIL_NAME = 'upload-server-last-fail.log';

export function lastFailLogPath(): string {
  return path.join(LOG_DIR, FAIL_NAME);
}

/** 打印上次失败日志；无文件时提示。返回 exit code。 */
export function printLastFailLog(): number {
  const file = lastFailLogPath();
  if (!fs.existsSync(file)) {
    console.log('暂无失败日志。');
    console.log(`路径（失败时写入）：${file}`);
    return 0;
  }
  console.log(`失败日志：${file}`);
  console.log('------------------------------------------------------------');
  console.log(fs.readFileSync(file, 'utf8').replace(/\s+$/, ''));
  console.log('------------------------------------------------------------');
  return 0;
}


/** 本机 Asia/Shanghai 墙钟 */
export function formatNow(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m${String(r).padStart(2, '0')}s`;
}

function ensureLogDir(): string {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  return LOG_DIR;
}

/** 清掉目录里多余的 upload-server 日志，只保留失败那一份（若有） */
export function cleanupDeployLogs(): void {
  const dir = ensureLogDir();
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith('upload-server') || !name.endsWith('.log')) continue;
    if (name === FAIL_NAME) continue;
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* ignore */
    }
  }
}

export type DeployLogSession = {
  append: (line: string) => void;
  /**
   * 结束会话：成功 → 不落盘并清理旧文件；失败 → 覆盖写入唯一失败日志。
   * @returns 失败时返回日志路径，成功返回 undefined
   */
  finish: (ok: boolean) => string | undefined;
};

/**
 * 内存缓冲发版日志。
 * 成功不写文件；失败只保留一份 `upload-server-last-fail.log`。
 */
export function openDeployLogFile(tag = 'upload-server'): DeployLogSession {
  const lines: string[] = [`# cmd-tools ${tag}  ${formatNow()}`];

  return {
    append(line: string) {
      lines.push(`[${formatNow()}] ${line}`);
    },
    finish(ok: boolean) {
      cleanupDeployLogs();
      if (ok) {
        // 成功不记录；若曾有失败文件也清掉（本次已成功）
        const failPath = path.join(LOG_DIR, FAIL_NAME);
        try {
          if (fs.existsSync(failPath)) fs.unlinkSync(failPath);
        } catch {
          /* ignore */
        }
        return undefined;
      }
      const dir = ensureLogDir();
      const file = path.join(dir, FAIL_NAME);
      lines.push(`[${formatNow()}] FAIL`);
      fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
      return file;
    },
  };
}
