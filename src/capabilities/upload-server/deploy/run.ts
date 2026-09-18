import { describeRemote, type Server, type Service } from '../config.js';
import { deployApi } from './api.js';
import { effectivePassword } from './ssh.js';
import type { DeployContext, Emit, StepStatus } from './types.js';
import { deployWeb } from './web.js';

export async function runDeploy(opts: {
  codeRoot: string;
  server: Server;
  services: Service[];
  dryRun: boolean;
  emit: Emit;
}): Promise<boolean> {
  const { codeRoot, server, services, dryRun, emit } = opts;
  emit({ type: 'log', line: `server ${server.label} · ${server.user}@${server.host}` });
  emit({ type: 'log', line: `CODE_ROOT ${codeRoot}` });
  emit({
    type: 'log',
    line: dryRun ? 'mode=dry-run · 跳过重构建 / scp / ssh' : 'mode=real · 本地构建后 scp + ssh',
  });
  if (!dryRun && !effectivePassword(server)) {
    emit({ type: 'log', line: '未配置密码（空或 CHANGE_ME）· 将尝试 SSH 密钥登录' });
  }
  for (const svc of services) {
    emit({
      type: 'log',
      line: `plan ${svc.id} (${svc.kind})  ${codeRoot}/${svc.projectRel} → ${describeRemote(svc, server.id)}`,
    });
  }

  let ok = true;
  for (let i = 0; i < services.length; i++) {
    const service = services[i]!;
    emit({
      type: 'service-start',
      index: i,
      total: services.length,
      serviceId: service.id,
      label: service.label,
    });

    const ctx: DeployContext = {
      codeRoot,
      dryRun,
      emit,
      log: (line) => emit({ type: 'log', serviceId: service.id, line: `[${service.id}] ${line}` }),
      step: (id, status: StepStatus) =>
        emit({ type: 'step', serviceId: service.id, step: id, status, dryRun }),
    };

    try {
      if (service.kind === 'web') {
        await deployWeb({ ctx, server, service });
      } else {
        await deployApi({ ctx, server, service });
      }
      emit({ type: 'service-done', serviceId: service.id, ok: true });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      ctx.log(error);
      emit({ type: 'service-done', serviceId: service.id, ok: false, error });
      ok = false;
      break;
    }
  }

  emit({ type: 'done', ok });
  return ok;
}
