export const DEPLOY_STEPS = ['build', 'pack', 'upload', 'remote'] as const;
export type StepId = (typeof DEPLOY_STEPS)[number];
export type StepStatus = 'pending' | 'running' | 'done' | 'fail';

export type DeployEvent =
  | {
      type: 'service-start';
      index: number;
      total: number;
      serviceId: string;
      label: string;
    }
  | {
      type: 'step';
      serviceId: string;
      step: StepId;
      status: StepStatus;
      dryRun?: boolean;
    }
  | { type: 'log'; line: string; serviceId?: string }
  | { type: 'service-done'; serviceId: string; ok: boolean; error?: string }
  | { type: 'done'; ok: boolean };

export type Emit = (event: DeployEvent) => void;

export type DeployContext = {
  codeRoot: string;
  dryRun: boolean;
  emit: Emit;
  log: (line: string) => void;
  step: (id: StepId, status: StepStatus) => void;
};
