import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveDest, webReleaseName, type Server, type Package } from '../config.js';
import { formatBytes, runShell, tarGzipDir } from './exec.js';
import { scpFile, sshExec } from './ssh.js';
import { runAfterHooks } from './after.js';
import { runStep } from './step.js';
import type { DeployContext } from './types.js';

/** 与 kfi upload-dist.sh 一致：dist-prod-2026年9月18日10:08:48 */
export function webBackupName(releaseName: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const y = get('year');
  const m = String(Number(get('month')));
  const d = String(Number(get('day')));
  const hh = get('hour').padStart(2, '0');
  const mm = get('minute').padStart(2, '0');
  const ss = get('second').padStart(2, '0');
  return `${releaseName}-${y}年${m}月${d}日${hh}:${mm}:${ss}`;
}

export function remoteWebExtractScript(
  remoteDir: string,
  releaseName: string,
  backupName: string,
): string {
  const tgz = `${releaseName}.tgz`;
  return [
    'set -euo pipefail',
    `REMOTE=${JSON.stringify(remoteDir)}`,
    `NAME=${JSON.stringify(releaseName)}`,
    `BACKUP=${JSON.stringify(backupName)}`,
    `TGZ=${JSON.stringify(tgz)}`,
    'mkdir -p "$REMOTE"',
    'cd "$REMOTE"',
    'if [ -d "$NAME" ]; then',
    '  mv "$NAME" "$BACKUP"',
    '  echo "backed up $NAME -> $BACKUP"',
    'fi',
    'mkdir -p "$NAME"',
    'tar --warning=no-unknown-keyword -xzf "$TGZ" -C "$NAME"',
    'rm -f "$TGZ"',
    'echo "extracted $NAME"',
  ].join('\n');
}

export async function deployWeb(opts: {
  ctx: DeployContext;
  server: Server;
  pkg: Package;
}): Promise<void> {
  const { ctx, server, pkg } = opts;
  const project = path.join(ctx.rootPath, pkg.dir);
  const artifactRel = pkg.outDir || 'dist';
  const outDir = path.join(project, artifactRel);
  const releaseName = webReleaseName(pkg);
  const remote = resolveDest(pkg, server.name);
  if (!remote) {
    throw new Error(`未配置远端路径: ${pkg.name} @ ${server.name}`);
  }
  const remoteTgz = `${remote.replace(/\/$/, '')}/${releaseName}.tgz`;
  const localTgz = path.join(os.tmpdir(), `cmd-tools-${pkg.name}-${Date.now()}.tgz`);

  await runStep(ctx, 'build', async () => {
    const cmd = pkg.build?.trim();
    if (!cmd) {
      ctx.log('无构建命令，跳过');
      return;
    }
    if (ctx.dryRun) {
      ctx.log(`[dry-run] skip ${cmd}  (cwd=${project})`);
      return;
    }
    if (!fs.existsSync(project)) {
      throw new Error(`项目不存在: ${project}`);
    }
    ctx.log(`$ ${cmd}`);
    await runShell(cmd, { cwd: project, onLog: ctx.log });
  });

  try {
    await runStep(ctx, 'pack', async () => {
      if (ctx.dryRun) {
        ctx.log(`[dry-run] would pack ${outDir} → ${releaseName}.tgz (--no-xattrs)`);
        return;
      }
      const indexHtml = path.join(outDir, 'index.html');
      if (!fs.existsSync(indexHtml)) {
        throw new Error(`缺少产物 ${indexHtml}`);
      }
      ctx.log(`packing ${outDir}`);
      await tarGzipDir(outDir, localTgz, ctx.log);
      ctx.log(`packed ${formatBytes(fs.statSync(localTgz).size)}`);
    });

    await runStep(ctx, 'upload', async () => {
      const dest = `${server.user}@${server.host}:${remoteTgz}`;
      if (ctx.dryRun) {
        ctx.log(`[dry-run] would scp ${releaseName}.tgz → ${dest}`);
        return;
      }
      ctx.log(`scp ${localTgz} → ${dest}`);
      await scpFile({ server, localPath: localTgz, remotePath: remoteTgz, onLog: ctx.log });
    });

    await runStep(ctx, 'remote', async () => {
      const backup = webBackupName(releaseName);
      const script = remoteWebExtractScript(remote, releaseName, backup);
      if (ctx.dryRun) {
        ctx.log(
          `[dry-run] would ssh ${server.user}@${server.host} : backup ${releaseName} → ${backup}; tar -xzf; rm tgz (${remote})`,
        );
        return;
      }
      ctx.log(`ssh extract ${server.host}:${remote}/${releaseName} (backup ${backup})`);
      await sshExec({ server, command: script, onLog: ctx.log });
    });

    if (pkg.after?.length) {
      await runAfterHooks({
        ctx,
        server,
        remoteDir: remote.replace(/\/$/, ''),
        steps: pkg.after,
      });
    }
  } finally {
    if (fs.existsSync(localTgz)) {
      try {
        fs.unlinkSync(localTgz);
      } catch {
        /* ignore */
      }
    }
  }
}
