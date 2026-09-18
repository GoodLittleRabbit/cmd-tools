import { sleep } from './exec.js';
import type { DeployContext, StepId, StepStatus } from './types.js';

export async function runStep(
  ctx: DeployContext,
  step: StepId,
  fn: () => Promise<void>,
): Promise<void> {
  ctx.step(step, 'running');
  try {
    await fn();
    if (ctx.dryRun) await sleep(180);
    ctx.step(step, 'done');
  } catch (e) {
    ctx.step(step, 'fail');
    throw e;
  }
}

export type { StepId, StepStatus };
