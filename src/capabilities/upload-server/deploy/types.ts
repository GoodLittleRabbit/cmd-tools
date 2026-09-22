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
  /** 给人看的当前动作（优先展示，不要用空泛阶段名） */
  | { type: 'progress'; packageId: string; message: string }
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
  /** 更新该包当前状态文案（构建命令 / after.label 等） */
  progress: (message: string) => void;
};
