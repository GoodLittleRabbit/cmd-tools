import fs from 'node:fs';
import path from 'node:path';
import { resolveApiLayout, resolveRemoteMap, type Server, type Service } from '../config.js';
import { formatBytes, runCommand, shQuote } from './exec.js';
import { scpFile, sshExec } from './ssh.js';
import { runStep } from './step.js';
import type { DeployContext } from './types.js';

const EXTRA_FILES = ['Dockerfile', 'start.sh', '.dockerignore'] as const;

function findJar(project: string, jarRel: string): string {
  const exact = path.join(project, jarRel);
  if (fs.existsSync(exact)) return exact;
  const dir = path.dirname(exact);
  const base = path.basename(exact, '.jar');
  if (!fs.existsSync(dir)) return exact;
  const matches = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.startsWith(base) &&
        f.endsWith('.jar') &&
        !f.endsWith('-sources.jar') &&
        !f.endsWith('-javadoc.jar') &&
        !f.includes('-original'),
    );
  if (matches.length === 1) return path.join(dir, matches[0]!);
  return exact;
}

function collectExtras(moduleDir: string): string[] {
  return EXTRA_FILES.map((name) => path.join(moduleDir, name)).filter((p) => fs.existsSync(p));
}

export async function deployApi(opts: {
  ctx: DeployContext;
  server: Server;
  service: Service;
}): Promise<void> {
  const { ctx, server, service } = opts;
  const project = path.join(ctx.codeRoot, service.projectRel);
  const layout = resolveApiLayout(service.buildOrShort);
  const remoteRoot = resolveRemoteMap(service.remoteMap, server.id);
  if (!remoteRoot) {
    throw new Error(`未配置远端路径: ${service.id} @ ${server.id}`);
  }
  const remoteDir = `${remoteRoot.replace(/\/$/, '')}/${layout.remoteSubdir}`;
  const jarAbs = findJar(project, layout.jarRel);
  const moduleDir = path.join(project, layout.moduleRel);

  await runStep(ctx, 'build', async () => {
    const mvnArgs = ['-pl', layout.moduleRel, '-am', '-DskipTests', 'package'];
    const shown = `mvn ${mvnArgs.join(' ')}`;
    if (ctx.dryRun) {
      ctx.log(`[dry-run] skip ${shown}  (cwd=${project})`);
      return;
    }
    if (!fs.existsSync(project)) {
      throw new Error(`项目不存在: ${project}`);
    }
    ctx.log(`$ ${shown}`);
    await runCommand('mvn', mvnArgs, { cwd: project, onLog: ctx.log });
  });

  let extras: string[] = [];
  await runStep(ctx, 'pack', async () => {
    if (ctx.dryRun) {
      ctx.log(`[dry-run] jar ${layout.jarRel} → ${remoteDir}/`);
      ctx.log('[dry-run] extras Dockerfile / start.sh / .dockerignore（若存在）');
      return;
    }
    if (!fs.existsSync(jarAbs)) {
      throw new Error(`缺少 jar: ${jarAbs}`);
    }
    extras = collectExtras(moduleDir);
    ctx.log(`jar ${jarAbs} (${formatBytes(fs.statSync(jarAbs).size)})`);
    if (extras.length === 0) ctx.log('无 Dockerfile/start.sh/.dockerignore');
    for (const extra of extras) ctx.log(`extra ${extra}`);
  });

  await runStep(ctx, 'upload', async () => {
    const destHost = `${server.user}@${server.host}:${remoteDir}/`;
    if (ctx.dryRun) {
      ctx.log(`[dry-run] would mkdir -p ${remoteDir}`);
      ctx.log(`[dry-run] would scp ${path.basename(jarAbs)} → ${destHost}`);
      return;
    }
    ctx.log(`ssh mkdir -p ${remoteDir}`);
    await sshExec({ server, command: `mkdir -p ${shQuote(remoteDir)}`, onLog: ctx.log });
    ctx.log(`scp ${path.basename(jarAbs)} → ${destHost}`);
    await scpFile({
      server,
      localPath: jarAbs,
      remotePath: `${remoteDir}/${path.basename(jarAbs)}`,
      onLog: ctx.log,
    });
    for (const extra of extras) {
      const name = path.basename(extra);
      ctx.log(`scp ${name} → ${destHost}`);
      await scpFile({ server, localPath: extra, remotePath: `${remoteDir}/${name}`, onLog: ctx.log });
    }
  });

  await runStep(ctx, 'remote', async () => {
    const startSh = `${remoteDir}/start.sh`;
    const script = [
      `ls -lh ${shQuote(remoteDir)}`,
      `if [ -f ${shQuote(startSh)} ]; then chmod +x ${shQuote(startSh)}; echo chmod +x start.sh; fi`,
    ].join('\n');
    if (ctx.dryRun) {
      ctx.log(`[dry-run] would ssh ls ${remoteDir} && chmod +x start.sh (if present)`);
      return;
    }
    ctx.log(`ssh verify ${remoteDir}`);
    await sshExec({ server, command: script, onLog: ctx.log });
  });
}
