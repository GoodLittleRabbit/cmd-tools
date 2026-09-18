import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRemoteMap, webReleaseName, type Server, type Service } from '../config.js';
import { formatBytes, runShell, tarGzipDir } from './exec.js';
import { scpFile, sshExec } from './ssh.js';
import { runStep } from './step.js';
import type { DeployContext } from './types.js';

export function remoteWebExtractScript(remoteDir: string, releaseName: string): string {
  const tgz = `${releaseName}.tgz`;
  return [
    'set -euo pipefail',
    `REMOTE=${JSON.stringify(remoteDir)}`,
    `NAME=${JSON.stringify(releaseName)}`,
    `TGZ=${JSON.stringify(tgz)}`,
    'mkdir -p "$REMOTE"',
    'cd "$REMOTE"',
    'TS=$(date +%Y%m%d%H%M%S)',
    'if [ -d "$NAME" ]; then',
    '  mv "$NAME" "$NAME.$TS"',
    '  echo "backed up $NAME -> $NAME.$TS"',
    'fi',
    'mkdir -p "$NAME"',
    'tar -xzf "$TGZ" -C "$NAME"',
    'rm -f "$TGZ"',
    'echo "extracted $NAME"',
  ].join('\n');
}

export async function deployWeb(opts: {
  ctx: DeployContext;
  server: Server;
  service: Service;
}): Promise<void> {
  const { ctx, server, service } = opts;
  const project = path.join(ctx.codeRoot, service.projectRel);
  const artifactRel = service.artifactDir || 'dist';
  const artifactDir = path.join(project, artifactRel);
  const releaseName = webReleaseName(service);
  const remote = resolveRemoteMap(service.remoteMap, server.id);
  if (!remote) {
    throw new Error(`未配置远端路径: ${service.id} @ ${server.id}`);
  }
  const remoteTgz = `${remote.replace(/\/$/, '')}/${releaseName}.tgz`;
  const localTgz = path.join(os.tmpdir(), `cmd-tools-${service.id}-${Date.now()}.tgz`);

  await runStep(ctx, 'build', async () => {
    const cmd = service.buildCommand?.trim();
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
        ctx.log(`[dry-run] would pack ${artifactDir} → ${releaseName}.tgz (--no-xattrs)`);
        return;
      }
      const indexHtml = path.join(artifactDir, 'index.html');
      if (!fs.existsSync(indexHtml)) {
        throw new Error(`缺少产物 ${indexHtml}`);
      }
      ctx.log(`packing ${artifactDir}`);
      await tarGzipDir(artifactDir, localTgz, ctx.log);
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
      const script = remoteWebExtractScript(remote, releaseName);
      if (ctx.dryRun) {
        ctx.log(
          `[dry-run] would ssh ${server.user}@${server.host} : backup ${releaseName} → ${releaseName}.$TS; tar -xzf; rm tgz (${remote})`,
        );
        return;
      }
      ctx.log(`ssh extract ${server.host}:${remote}/${releaseName}`);
      await sshExec({ server, command: script, onLog: ctx.log });
    });
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
