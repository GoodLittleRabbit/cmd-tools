export const DEPLOY_STEPS = ['build', 'pack', 'upload', 'remote', 'after'] as const;
export type StepId = (typeof DEPLOY_STEPS)[number];
export type StepStatus = 'pending' | 'running' | 'done' | 'fail';

export type DeployEvent =
  | {
      type: 'pkg-start';
      index: number;
      total: number;
      packageId: string;
      label: string;
    }
  | {
      type: 'step';
      packageId: string;
      step: StepId;
      status: StepStatus;
      dryRun?: boolean;
    }
  | { type: 'log'; line: string; packageId?: string }
  | { type: 'pkg-done'; packageId: string; ok: boolean; error?: string }
  | { type: 'done'; ok: boolean };

export type Emit = (event: DeployEvent) => void;

export type DeployContext = {
  rootPath: string;
  dryRun: boolean;
  emit: Emit;
  log: (line: string) => void;
  step: (id: StepId, status: StepStatus) => void;
};
