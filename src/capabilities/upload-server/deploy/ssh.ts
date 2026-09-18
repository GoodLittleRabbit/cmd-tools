import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from '../config.js';
import { hasCommand, runCommand, type RunOpts } from './exec.js';

const SSH_OPTS = [
  '-o',
  'StrictHostKeyChecking=accept-new',
  '-o',
  'NumberOfPasswordPrompts=1',
  '-o',
  'ConnectTimeout=20',
];

const EXPECT_SCRIPT = `set timeout 1800
log_user 1
spawn {*}$argv
expect {
  -re {(?i)are you sure you want to continue connecting} {
    send -- "yes\\r"
    exp_continue
  }
  -re {(?i)(password:|passphrase)} {
    send -- "$env(SSH_PASSWORD)\\r"
    exp_continue
  }
  timeout {
    puts stderr "timeout waiting for ssh/scp"
    exit 124
  }
  eof
}
lassign [wait] pid spawnid os_error_flag value
if {$os_error_flag == 1} { exit 1 }
exit $value
`;

export type AuthBackend = 'none' | 'sshpass' | 'expect';

export function effectivePassword(server: Server): string | undefined {
  const p = server.password?.trim();
  if (!p || p === 'CHANGE_ME') return undefined;
  return p;
}

export function resolveAuthBackend(password?: string): AuthBackend {
  if (!password) return 'none';
  if (hasCommand('sshpass')) return 'sshpass';
  if (hasCommand('expect')) return 'expect';
  throw new Error('密码登录需要 sshpass 或 expect，当前都未安装');
}

function dest(server: Server, remotePath: string): string {
  return `${server.user}@${server.host}:${remotePath}`;
}

let expectScriptPath: string | undefined;

function expectFile(): string {
  if (expectScriptPath && fs.existsSync(expectScriptPath)) return expectScriptPath;
  expectScriptPath = path.join(os.tmpdir(), `cmd-tools-ssh-${process.pid}.exp`);
  fs.writeFileSync(expectScriptPath, EXPECT_SCRIPT, { mode: 0o600 });
  return expectScriptPath;
}

async function runAuth(
  server: Server,
  argv: string[],
  onLog?: (line: string) => void,
): Promise<void> {
  const password = effectivePassword(server);
  const backend = resolveAuthBackend(password);
  const opts: RunOpts = { onLog };

  if (backend === 'none') {
    await runCommand(argv[0]!, argv.slice(1), opts);
    return;
  }

  if (backend === 'sshpass') {
    await runCommand('sshpass', ['-e', ...argv], {
      ...opts,
      env: { ...process.env, SSHPASS: password! },
    });
    return;
  }

  await runCommand('expect', ['-f', expectFile(), '--', ...argv], {
    ...opts,
    env: { ...process.env, SSH_PASSWORD: password! },
  });
}

export async function scpFile(opts: {
  server: Server;
  localPath: string;
  remotePath: string;
  onLog?: (line: string) => void;
}): Promise<void> {
  if (!fs.existsSync(opts.localPath)) {
    throw new Error(`本地文件不存在: ${opts.localPath}`);
  }
  const argv = ['scp', ...SSH_OPTS, opts.localPath, dest(opts.server, opts.remotePath)];
  await runAuth(opts.server, argv, opts.onLog);
}

export async function sshExec(opts: {
  server: Server;
  command: string;
  onLog?: (line: string) => void;
}): Promise<void> {
  const argv = ['ssh', ...SSH_OPTS, `${opts.server.user}@${opts.server.host}`, 'bash', '-lc', opts.command];
  await runAuth(opts.server, argv, opts.onLog);
}
