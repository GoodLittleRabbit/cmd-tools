import type { AfterStep, Server } from '../config.js';
import { shQuote } from './exec.js';
import { withRemoteHookGate } from './gates.js';
import { effectivePassword, sshExec } from './ssh.js';
import { runStep } from './step.js';
import type { DeployContext } from './types.js';

/**
 * 发版完成后的远端钩子：在 dest 目录逐步执行 packages[].after。
 * 每步用中文 label 打日志，编排器可展示「正在：xxx」。
 *
 * 同服务器互斥（withRemoteHookGate）：钩子里的 docker build / image prune
 * 并行会互删在途缓存层；一次只放一个包的钩子，其余在本机排队。
 */
export async function runAfterHooks(opts: {
  ctx: DeployContext;
  server: Server;
  remoteDir: string;
  steps: AfterStep[];
  onStepLabel?: (label: string) => void;
}): Promise<void> {
  const { ctx, server, remoteDir, steps, onStepLabel } = opts;
  if (!steps.length) return;

  await runStep(ctx, 'after', async () => {
    // 整段钩子（可能多步）作为整体过闸，保证 prune 不会撞上别人的 build
    await withRemoteHookGate(server.host, async () => {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;
        const title = `${step.label}（${i + 1}/${steps.length}）`;
        ctx.progress(ctx.dryRun ? `演练：${title}` : title);
        onStepLabel?.(step.label);
        ctx.log(`正在：${title}`);
        ctx.log(`$ ${step.run}`);

        if (ctx.dryRun) {
          ctx.log(`[dry-run] would (cd ${remoteDir} && ${step.run})`);
          continue;
        }

        const pw = effectivePassword(server);
        const body = `cd ${shQuote(remoteDir)} && ${step.run}`;
        if (pw) {
          await sshExec({
            server,
            command: `echo ${shQuote(pw)} | sudo -S -p '' bash -lc ${shQuote(body)}`,
            onLog: ctx.log,
            forceTty: true,
          });
        } else {
          await sshExec({
            server,
            command: `bash -lc ${shQuote(body)}`,
            onLog: ctx.log,
            forceTty: true,
          });
        }
        ctx.log(`完成：${step.label}`);
      }
    });
  });
}
