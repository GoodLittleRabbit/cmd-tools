import { describeDest, packageMode, type Package, type Server } from '../config.js';
import { resolvePackageBuild } from '../detect.js';
import { deployApi } from './api.js';
import { effectivePassword } from './ssh.js';
import type { DeployContext, Emit, StepStatus } from './types.js';
import { deployWeb } from './web.js';

export async function runDeploy(opts: {
  rootPath: string;
  server: Server;
  packages: Package[];
  dryRun: boolean;
  emit: Emit;
}): Promise<boolean> {
  const { rootPath, server, packages, dryRun, emit } = opts;
  emit({ type: 'log', line: `server ${server.name} · ${server.user}@${server.host}` });
  emit({ type: 'log', line: `ROOT_PATH ${rootPath}` });
  emit({
    type: 'log',
    line: dryRun ? 'mode=dry-run · 跳过重构建 / scp / ssh' : 'mode=real · 本地构建后 scp + ssh',
  });
  if (!dryRun && !effectivePassword(server)) {
    emit({ type: 'log', line: '未配置密码（空或 CHANGE_ME）· 将尝试 SSH 密钥登录' });
  }

  // 先探测产物字段，再 plan / 发版（避免 packageMode 在缺 outDir 时误报）
  const resolvedPackages = packages.map((pkg) => {
    const resolved = resolvePackageBuild(rootPath, pkg);
    if (resolved.detectReason) {
      emit({ type: 'log', line: `[${resolved.name}] ${resolved.detectReason}` });
    }
    return resolved;
  });

  for (const svc of resolvedPackages) {
    emit({
      type: 'log',
      line: `plan ${svc.name} (${packageMode(svc)})  ${rootPath}/${svc.dir} → ${describeDest(svc, server.name)}`,
    });
  }

  let ok = true;
  for (let i = 0; i < resolvedPackages.length; i++) {
    const pkg = resolvedPackages[i]!;
    emit({
      type: 'pkg-start',
      index: i,
      total: packages.length,
      packageId: pkg.name,
      label: pkg.name,
    });

    const ctx: DeployContext = {
      rootPath,
      dryRun,
      emit,
      log: (line) => emit({ type: 'log', packageId: pkg.name, line: `[${pkg.name}] ${line}` }),
      step: (id, status: StepStatus) =>
        emit({ type: 'step', packageId: pkg.name, step: id, status, dryRun }),
    };

    try {
      if (packageMode(pkg) === 'web') {
        await deployWeb({ ctx, server, pkg });
      } else {
        await deployApi({ ctx, server, pkg });
      }
      emit({ type: 'pkg-done', packageId: pkg.name, ok: true });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      ctx.log(error);
      emit({ type: 'pkg-done', packageId: pkg.name, ok: false, error });
      ok = false;
      break;
    }
  }

  emit({ type: 'done', ok });
  return ok;
}
