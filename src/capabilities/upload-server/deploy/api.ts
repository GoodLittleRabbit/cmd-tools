import fs from 'node:fs';
import path from 'node:path';
import { resolveDest, type Server, type Package } from '../config.js';
import { formatBytes, runShell, shQuote } from './exec.js';
import { effectivePassword, scpViaTmpSudo, sshExec } from './ssh.js';
import { runAfterHooks } from './after.js';
import { runStep } from './step.js';
import type { DeployContext } from './types.js';

const EXTRA_FILES = ['Dockerfile', 'start.sh', '.dockerignore'] as const;

function findJar(project: string, jar: string): string {
  const exact = path.join(project, jar);
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
  const preferred = matches.find((f) => f === `${base}.jar`) || matches[0];
  if (preferred) return path.join(dir, preferred);
  return exact;
}

function collectExtras(moduleDir: string): string[] {
  return EXTRA_FILES.map((name) => path.join(moduleDir, name)).filter((p) => fs.existsSync(p));
}

export async function deployApi(opts: {
  ctx: DeployContext;
  server: Server;
  pkg: Package;
}): Promise<void> {
  const { ctx, server, pkg } = opts;
  const project = path.join(ctx.rootPath, pkg.dir);
  if (!pkg.jar || !pkg.module) {
    throw new Error(
      `服务 ${pkg.name} 未配置 jar/module（可在配置写全，或依赖 detect 自动探测）`,
    );
  }
  const remoteDir = resolveDest(pkg, server.name)?.replace(/\/$/, '');
  if (!remoteDir) {
    throw new Error(`未配置 dest: ${pkg.name} @ ${server.name}`);
  }
  const moduleDir = path.join(project, pkg.module);

  await runStep(ctx, 'build', async () => {
    const cmd = pkg.build?.trim();
    if (!cmd) {
      ctx.progress('跳过构建（无 build 命令）');
      ctx.log('无构建命令，跳过');
      return;
    }
    ctx.progress(ctx.dryRun ? `演练构建：${cmd}` : `构建中：${cmd}`);
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

  let jarAbs = '';
  let extras: string[] = [];

  await runStep(ctx, 'pack', async () => {
    ctx.progress(ctx.dryRun ? '演练：核对 jar / Docker 附属文件' : '核对 jar / Docker 附属文件');
    if (ctx.dryRun) {
      ctx.log(`[dry-run] jar ${pkg.jar} → ${remoteDir}/ （经 /tmp + sudo mv）`);
      ctx.log('[dry-run] extras Dockerfile / start.sh / .dockerignore（若存在）');
      return;
    }
    jarAbs = findJar(project, pkg.jar!);
    if (!fs.existsSync(jarAbs)) {
      throw new Error(`缺少 jar: ${jarAbs}`);
    }
    extras = collectExtras(moduleDir);
    ctx.log(`jar ${jarAbs} (${formatBytes(fs.statSync(jarAbs).size)})`);
    if (extras.length === 0) ctx.log('无 Dockerfile/start.sh/.dockerignore');
    for (const extra of extras) ctx.log(`extra ${extra}`);
  });

  await runStep(ctx, 'upload', async () => {
    ctx.progress(
      ctx.dryRun ? `演练上传 → ${remoteDir}` : `上传 jar${extras.length ? ' 与 Docker 文件' : ''} → ${remoteDir}`,
    );
    if (ctx.dryRun) {
      ctx.log(`[dry-run] would scp jar/extras → /tmp then sudo mv → ${remoteDir}/`);
      return;
    }
    const jarName = path.basename(jarAbs);
    // 通用：只传到 dest 根目录（与常见上传脚本一致）。
    // 若 Dockerfile 需要 target/*.jar，在 packages[].after 里自己整理，例如：
    //   "after": ["mkdir -p target && cp -f <jar> target/", "bash ./deploy.sh"]
    await scpViaTmpSudo({
      server,
      localPath: jarAbs,
      remoteFinalPath: `${remoteDir}/${jarName}`,
      onLog: ctx.log,
    });
    for (const extra of extras) {
      const name = path.basename(extra);
      const remoteExtra = `${remoteDir}/${name}`;
      await scpViaTmpSudo({
        server,
        localPath: extra,
        remoteFinalPath: remoteExtra,
        onLog: ctx.log,
        afterMove: name === 'start.sh' ? `chmod +x ${shQuote(remoteExtra)}` : undefined,
      });
    }
  });

  await runStep(ctx, 'remote', async () => {
    ctx.progress(ctx.dryRun ? `演练：远端核对 ${remoteDir}` : `远端核对目录 ${remoteDir}`);
    if (ctx.dryRun) {
      ctx.log(`[dry-run] would ssh ls ${remoteDir}`);
      return;
    }
    ctx.log(`ssh ls ${remoteDir}`);
    try {
      await sshExec({
        server,
        command: `ls -lh ${shQuote(remoteDir)}`,
        onLog: ctx.log,
      });
    } catch {
      const pw = effectivePassword(server);
      if (!pw) throw new Error(`无法列出 ${remoteDir}（无密码做 sudo）`);
      ctx.log('普通 ls 失败，改用 sudo ls');
      const body = `ls -lh ${shQuote(remoteDir)}`;
      await sshExec({
        server,
        command: `echo ${shQuote(pw)} | sudo -S -p '' sh -c ${shQuote(body)}`,
        onLog: ctx.log,
        forceTty: true,
      });
    }
  });

  if (pkg.after?.length) {
    await runAfterHooks({ ctx, server, remoteDir, steps: pkg.after });
  } else {
    ctx.progress('上传完成（无远端钩子）');
  }
}
