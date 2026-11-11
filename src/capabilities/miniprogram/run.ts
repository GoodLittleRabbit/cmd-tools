import { loadConfig, parseAction, parseAppSelectors, resolveApps } from './config.js';
import { planApps, runPlans, type AppPlan } from './engine.js';
import type { MiniProgramAction } from './config.js';

export type MiniprogramCliOptions = {
  configPath?: string;
  app?: string;
  action?: string;
  version?: string;
  desc?: string;
  dryRun?: boolean;
};

export async function runMiniprogramCli(opts: MiniprogramCliOptions): Promise<number> {
  const config = loadConfig(opts.configPath);
  const selectors = parseAppSelectors(opts.app);
  if (!selectors?.length) {
    console.error('请用 --app 指定小程序（name 或 appid，逗号可多选）。');
    const available = config.apps.map((a) => `  ${a.name}  ${a.appid}`).join('\n');
    if (available) console.error(`已配置:\n${available}`);
    return 1;
  }
  const action = parseAction(opts.action);
  if (!action) {
    console.error('请用 --action preview 或 --action upload 指定动作。');
    return 1;
  }
  if (action === 'upload' && !opts.desc?.trim()) {
    console.error('上传必须用 --desc 填写版本备注。');
    return 1;
  }
  const apps = resolveApps(config, selectors);
  const plans = planApps({
    rootPath: config.rootPath,
    apps,
    action,
    version: opts.version,
    desc: opts.desc,
  });
  printHeader(config.configPath, opts.dryRun ?? false, action, plans);
  const { ok, results } = await runPlans(plans, {
    dryRun: Boolean(opts.dryRun),
    emit: (ev) => {
      if (ev.type === 'log') console.log(ev.line);
    },
  });
  const failed = results.filter((r) => !r.ok);
  if (ok) {
    console.log(opts.dryRun ? '全部校验通过。' : '全部完成。');
    return 0;
  }
  console.error(`失败 ${failed.length}/${results.length}：${failed.map((f) => f.name).join('、')}`);
  return 1;
}

function printHeader(
  configPath: string,
  dryRun: boolean,
  action: MiniProgramAction,
  plans: AppPlan[],
): void {
  console.log(`配置    ${configPath}`);
  console.log(`模式    ${dryRun ? 'dry-run（不构建、不调用微信）' : '正式执行'}`);
  console.log(`动作    ${action === 'preview' ? '预览 preview' : '上传 upload'}`);
  console.log(`小程序  ${plans.map((p) => p.app.name).join('、')}`);
  console.log('');
}
