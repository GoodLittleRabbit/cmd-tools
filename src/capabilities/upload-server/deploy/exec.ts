import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

export function hasCommand(bin: string): boolean {
  const r = spawnSync('sh', ['-c', 'command -v -- "$1"', 'sh', bin], { stdio: 'ignore' });
  return r.status === 0;
}

export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

export type RunOpts = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onLog?: (line: string) => void;
};

function clip(line: string): string {
  const t = stripAnsi(line).replace(/\s+$/g, '');
  if (!t) return '';
  return t.length > 220 ? `${t.slice(0, 217)}...` : t;
}

export async function runCommand(cmd: string, args: string[], opts: RunOpts = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buf = '';
    const feed = (chunk: Buffer | string) => {
      buf += chunk.toString();
      const parts = buf.split(/\r?\n|\r/);
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = clip(part);
        if (line) opts.onLog?.(line);
      }
    };

    child.stdout?.on('data', feed);
    child.stderr?.on('data', feed);
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`找不到命令: ${cmd}`));
        return;
      }
      reject(err);
    });
    child.on('close', (code) => {
      if (buf) {
        const line = clip(buf);
        if (line) opts.onLog?.(line);
      }
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} 退出码 ${code ?? 'null'}`));
    });
  });
}

export async function runShell(command: string, opts: RunOpts = {}): Promise<void> {
  await runCommand('sh', ['-c', command], opts);
}

let tarNoXattrs: boolean | undefined;

export function tarSupportsNoXattrs(): boolean {
  if (tarNoXattrs != null) return tarNoXattrs;
  try {
    const r = spawnSync('tar', ['--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    tarNoXattrs = out.includes('--no-xattrs');
  } catch {
    tarNoXattrs = false;
  }
  return tarNoXattrs;
}

export async function tarGzipDir(
  srcDir: string,
  destTgz: string,
  onLog?: (line: string) => void,
): Promise<void> {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`打包目录不存在: ${srcDir}`);
  }
  const env = { ...process.env, COPYFILE_DISABLE: '1' };
  const args = ['-czf', destTgz, '-C', srcDir, '.'];
  if (tarSupportsNoXattrs()) {
    onLog?.('tar --no-xattrs -czf (COPYFILE_DISABLE=1)');
    await runCommand('tar', ['--no-xattrs', ...args], { env, onLog });
    return;
  }
  onLog?.('tar -czf (COPYFILE_DISABLE=1; --no-xattrs 不可用)');
  await runCommand('tar', args, { env, onLog });
}
