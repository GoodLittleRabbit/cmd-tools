import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOG_DIR = path.join(os.homedir(), '.cache', 'cmd-tools', 'logs');
const FAIL_NAME = 'upload-server-last-fail.log';
const HISTORY_RE = /^upload-server-(\d{8}-\d{6})-(ok|fail)\.log$/;

export function deployLogDir(): string {
  return LOG_DIR;
}

export function lastFailLogPath(): string {
  return path.join(LOG_DIR, FAIL_NAME);
}

export type DeployLogEntry = {
  /** 文件名 */
  name: string;
  path: string;
  /** 时间戳串 YYYYMMDD-HHmmss */
  stamp: string;
  ok: boolean;
  mtimeMs: number;
  size: number;
};

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

/** 文件名用的紧凑时间戳（上海墙钟） */
function stampNow(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
}

/** 新→旧 */
export function listDeployLogHistory(): DeployLogEntry[] {
  const dir = ensureLogDir();
  const out: DeployLogEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(HISTORY_RE);
    if (!m) continue;
    const full = path.join(dir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    out.push({
      name,
      path: full,
      stamp: m[1]!,
      ok: m[2] === 'ok',
      mtimeMs: st.mtimeMs,
      size: st.size,
    });
  }
  out.sort((a, b) => b.stamp.localeCompare(a.stamp) || b.mtimeMs - a.mtimeMs);
  return out;
}

function readLogBody(file: string): string {
  return fs.readFileSync(file, 'utf8').replace(/\s+$/, '');
}

export type DeployLogMeta = {
  /** prod · user@host */
  server?: string;
  /** 发版单元名列表 */
  packages: string[];
  /** dry-run | real */
  mode?: string;
  rootPath?: string;
};

/**
 * 从日志头解析「选了什么」。
 * 兼容 UploadWizard 写入的 server / packages / mode 行，以及 runDeploy 的 ROOT_PATH。
 */
export function parseDeployLogMeta(text: string): DeployLogMeta {
  const lines = text.split('\n').slice(0, 24);
  const meta: DeployLogMeta = { packages: [] };

  for (const raw of lines) {
    // 去掉可选时间戳前缀 [yyyy/…]
    const line = raw.replace(/^\[[^\]]+\]\s*/, '').trim();
    if (!line || line.startsWith('#')) continue;

    const server = line.match(/^server\s+(.+)$/i);
    if (server) {
      meta.server = server[1]!.trim();
      continue;
    }
    const pkgs = line.match(/^packages\s+(.+)$/i);
    if (pkgs) {
      meta.packages = pkgs[1]!
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    const mode = line.match(/^mode=(.+)$/i);
    if (mode) {
      meta.mode = mode[1]!.trim();
      continue;
    }
    const root = line.match(/^ROOT_PATH\s+(.+)$/i);
    if (root) {
      meta.rootPath = root[1]!.trim();
      continue;
    }
  }

  return meta;
}

/** 正文：去掉头信息行后的过程日志（保留 # 标题与时间戳行） */
export function deployLogBodyLines(text: string): string[] {
  const lines = text.replace(/\s+$/, '').split('\n');
  const out: string[] = [];
  let pastHeader = false;

  for (const raw of lines) {
    const stripped = raw.replace(/^\[[^\]]+\]\s*/, '').trim();
    const isMeta =
      /^server\s+/i.test(stripped) ||
      /^packages\s+/i.test(stripped) ||
      /^mode=/i.test(stripped) ||
      /^ROOT_PATH\s+/i.test(stripped) ||
      /^conflicts\s+/i.test(stripped) ||
      /^\s*!\s/.test(stripped);

    if (!pastHeader) {
      if (raw.startsWith('#') || isMeta || !stripped) {
        continue;
      }
      pastHeader = true;
    }
    out.push(raw);
  }

  return out.length ? out : lines;
}

/** 从日志头摘一行 packages / server，供列表 hint */
export function summarizeDeployLog(file: string): string {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const meta = parseDeployLogMeta(text);
    const bits = [
      meta.server,
      meta.packages.length
        ? meta.packages.length <= 3
          ? meta.packages.join(' · ')
          : `${meta.packages.slice(0, 2).join(' · ')} +${meta.packages.length - 2}`
        : undefined,
      meta.mode === 'dry-run' ? 'dry-run' : undefined,
    ].filter(Boolean);
    return bits.join(' · ') || path.basename(file);
  } catch {
    return path.basename(file);
  }
}

/**
 * 打印历史列表；无记录时提示。
 * @returns exit code
 */
export function printDeployLogHistory(): number {
  const list = listDeployLogHistory();
  const fail = lastFailLogPath();
  console.log(`日志目录：${LOG_DIR}`);
  if (!list.length) {
    console.log('暂无发版历史。');
    if (fs.existsSync(fail)) {
      console.log(`（仍有 last-fail 指针：${fail}）`);
    }
    console.log('查看：pnpm start -- /log 1   或   /log fail');
    return 0;
  }
  console.log(`共 ${list.length} 条`);
  console.log('------------------------------------------------------------');
  list.forEach((e, i) => {
    const mark = e.ok ? 'ok  ' : 'FAIL';
    const summary = summarizeDeployLog(e.path);
    console.log(`  ${String(i + 1).padStart(2)}  ${mark}  ${e.stamp}  ${summary}`);
  });
  console.log('------------------------------------------------------------');
  console.log('查看：pnpm start -- /log <序号>   ·   /log fail   ·   /log latest');
  return 0;
}

/**
 * 打印一条历史。
 * selector: 数字序号(1=最新) | fail | latest | ok | 文件名片段
 */
export function printDeployLog(selector?: string): number {
  const raw = selector?.trim().toLowerCase();
  if (!raw) return printDeployLogHistory();

  let file: string | undefined;

  if (raw === 'fail' || raw === 'last-fail' || raw === 'last') {
    file = lastFailLogPath();
    if (!fs.existsSync(file)) {
      const firstFail = listDeployLogHistory().find((e) => !e.ok);
      file = firstFail?.path;
    }
  } else if (raw === 'latest' || raw === 'ok') {
    const list = listDeployLogHistory();
    const hit = raw === 'ok' ? list.find((e) => e.ok) : list[0];
    file = hit?.path;
  } else if (/^\d+$/.test(raw)) {
    const idx = Number(raw) - 1;
    const list = listDeployLogHistory();
    file = list[idx]?.path;
  } else {
    const list = listDeployLogHistory();
    const hit = list.find((e) => e.name.includes(raw) || e.stamp.includes(raw));
    file = hit?.path;
  }

  if (!file || !fs.existsSync(file)) {
    console.log(`未找到日志：${selector}`);
    printDeployLogHistory();
    return 1;
  }

  console.log(`发版日志：${file}`);
  const body = readLogBody(file);
  const meta = parseDeployLogMeta(body);
  if (meta.server || meta.packages.length || meta.mode) {
    if (meta.server) console.log(`目标  ${meta.server}`);
    if (meta.packages.length) console.log(`发版单元  ${meta.packages.join(' · ')}`);
    if (meta.mode) console.log(`模式  ${meta.mode}`);
    if (meta.rootPath) console.log(`ROOT  ${meta.rootPath}`);
  }
  console.log('------------------------------------------------------------');
  console.log(deployLogBodyLines(body).join('\n'));
  console.log('------------------------------------------------------------');
  return 0;
}

/** @deprecated 用 printDeployLog('fail') */
export function printLastFailLog(): number {
  return printDeployLog('fail');
}

export type DeployLogSession = {
  append: (line: string) => void;
  /**
   * 结束会话：成功/失败都写入历史；失败额外更新 last-fail。
   * @returns 本次日志路径
   */
  finish: (ok: boolean) => string;
};

/**
 * 内存缓冲发版日志。
 * 每次发版落一条历史；失败同步覆盖 `upload-server-last-fail.log`。
 */
export function openDeployLogFile(tag = 'upload-server'): DeployLogSession {
  const lines: string[] = [`# cmd-tools ${tag}  ${formatNow()}`];

  return {
    append(line: string) {
      lines.push(`[${formatNow()}] ${line}`);
    },
    finish(ok: boolean) {
      const dir = ensureLogDir();
      const stamp = stampNow();
      const name = `upload-server-${stamp}-${ok ? 'ok' : 'fail'}.log`;
      const file = path.join(dir, name);
      lines.push(`[${formatNow()}] ${ok ? 'DONE' : 'FAIL'}`);
      fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');

      if (!ok) {
        const failPath = path.join(dir, FAIL_NAME);
        try {
          fs.copyFileSync(file, failPath);
        } catch {
          fs.writeFileSync(failPath, lines.join('\n') + '\n', 'utf8');
        }
      }

      return file;
    },
  };
}
