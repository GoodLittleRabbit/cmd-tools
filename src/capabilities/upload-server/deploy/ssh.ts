import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from '../config.js';
import { hasCommand, runCommand, shQuote, type RunOpts } from './exec.js';

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

/** ssh uses -p, scp uses -P */
function portArgs(server: Server, kind: 'ssh' | 'scp'): string[] {
  const port = server.port && server.port !== 22 ? server.port : server.port;
  // always pass explicitly when set; default 22 still fine to omit
  if (!server.port || server.port === 22) return [];
  return kind === 'ssh' ? ['-p', String(server.port)] : ['-P', String(server.port)];
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
  const argv = ['scp', ...SSH_OPTS, ...portArgs(opts.server, 'scp'), opts.localPath, dest(opts.server, opts.remotePath)];
  await runAuth(opts.server, argv, opts.onLog);
}

export async function sshExec(opts: {
  server: Server;
  command: string;
  onLog?: (line: string) => void;
  /** 与 upload-jars 一致：sudo 管道需要 -tt，避免远端把命令拆碎 */
  forceTty?: boolean;
}): Promise<void> {
  // 整段 command 作为 ssh 的单一远端参数（不要拆成 bash -lc + 多段，expect/argv 易截断）
  const argv = [
    'ssh',
    ...SSH_OPTS,
    ...(opts.forceTty ? ['-tt'] : []),
    ...portArgs(opts.server, 'ssh'),
    `${opts.server.user}@${opts.server.host}`,
    opts.command,
  ];
  await runAuth(opts.server, argv, opts.onLog);
}

/**
 * 与 kfi upload-jars 一致：先 scp 到 /tmp，再 sudo mv 到工作目录
 * （kfi 用户通常不能直接写 api 服务目录）。
 */
export async function scpViaTmpSudo(opts: {
  server: Server;
  localPath: string;
  /** 远端最终完整路径，含文件名 */
  remoteFinalPath: string;
  onLog?: (line: string) => void;
  /** sudo mv 成功后追加的远端命令（已在同一 sudo sh -c 内） */
  afterMove?: string;
}): Promise<void> {
  const password = effectivePassword(opts.server);
  if (!password) {
    throw new Error(
      '后端发版需要服务器密码：远端工作目录须 sudo 写入（与 upload-jars-to-devtest.sh 相同）',
    );
  }
  if (!fs.existsSync(opts.localPath)) {
    throw new Error(`本地文件不存在: ${opts.localPath}`);
  }
  const base = path.basename(opts.localPath);
  const tmp = `/tmp/cmd-tools-upload-${Date.now()}-${process.pid}-${base}`;
  const finalDir = path.posix.dirname(opts.remoteFinalPath);

  opts.onLog?.(`scp ${base} → ${opts.server.user}@${opts.server.host}:${tmp}`);
  await scpFile({
    server: opts.server,
    localPath: opts.localPath,
    remotePath: tmp,
    onLog: opts.onLog,
  });

  let sudoBody =
    `mkdir -p ${shQuote(finalDir)} && ` +
    `rm -f -- ${shQuote(opts.remoteFinalPath)} && ` +
    `mv -f ${shQuote(tmp)} ${shQuote(opts.remoteFinalPath)}`;
  if (opts.afterMove?.trim()) {
    sudoBody += ` && ${opts.afterMove.trim()}`;
  }

  // echo 管道喂 sudo，避免登录密码与 sudo 密码双 expect 打架
  const remoteCmd =
    `echo ${shQuote(password)} | sudo -S -p '' sh -c ${shQuote(sudoBody)}`;

  opts.onLog?.(`sudo mv ${tmp} → ${opts.remoteFinalPath}`);
  await sshExec({
    server: opts.server,
    command: remoteCmd,
    onLog: opts.onLog,
    forceTty: true,
  });
}
