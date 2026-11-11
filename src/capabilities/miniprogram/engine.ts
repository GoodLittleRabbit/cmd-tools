import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as ci from 'miniprogram-ci';
import { formatDateTime, formatStamp } from '../../time.js';
import {
  appDir,
  type MiniProgramAction,
  type MiniProgramApp,
} from './config.js';
import {
  detectBuildCommand,
  detectProjectPath,
  expectedProjectRel,
  hasProjectConfig,
  resolveConfiguredProjectPath,
  type DetectedPath,
} from './detect.js';
import { findPrivateKeyPath, missingKeyMessage } from './secrets.js';

const COMPILE_SETTINGS = {
  es6: true,
  es7: true,
  minify: true,
  minifyJS: true,
  minifyWXML: true,
  minifyWXSS: true,
  autoPrefixWXSS: false,
  codeProtect: false,
};

export type EngineEvent =
  | { type: 'log'; line: string }
  | { type: 'app-start'; name: string }
  | { type: 'progress'; name: string; message: string }
  | { type: 'app-done'; name: string; ok: boolean; error?: string; qrcodePath?: string };

export type AppPlan = {
  app: MiniProgramApp;
  appDir: string;
  action: MiniProgramAction;
  version: string;
  desc: string;
  build?: string;
  project?: DetectedPath;
  /** 构建后期望出现的工程目录（当前可能还不存在） */
  expectedProjectRel?: string;
  privateKeyPath?: string;
  issues: string[];
};

export type PlanOptions = {
  rootPath: string;
  apps: MiniProgramApp[];
  action: MiniProgramAction;
  version?: string;
  desc?: string;
};

export const DEFAULT_VERSION = '0.0.1';

export function defaultVersion(): string {
  return DEFAULT_VERSION;
}

export function defaultDesc(action: MiniProgramAction, now = new Date()): string {
  const label = action === 'preview' ? '预览' : '上传';
  return `cmd-tools ${label} ${formatDateTime(now)}`;
}

function cacheDir(): string {
  return path.join(os.homedir(), '.cache', 'cmd-tools', 'miniprogram');
}

export function planApps(opts: PlanOptions): AppPlan[] {
  return opts.apps.map((app) => planApp(opts.rootPath, app, opts.action, opts.version, opts.desc));
}

export function planApp(
  rootPath: string,
  app: MiniProgramApp,
  action: MiniProgramAction,
  version?: string,
  desc?: string,
): AppPlan {
  const dir = appDir(rootPath, app);
  const issues: string[] = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    issues.push(`项目目录不存在: ${dir}`);
  }

  const build = app.build?.trim() || (fs.existsSync(dir) ? detectBuildCommand(dir) : undefined);
  let project: DetectedPath | undefined;
  let expected: string | undefined;

  if (app.projectPath?.trim() && fs.existsSync(dir)) {
    project = resolveConfiguredProjectPath(dir, app.projectPath.trim());
    if (!hasProjectConfig(project.abs)) {
      if (build) {
        expected = project.rel;
        issues.push(
          `配置的 projectPath 当前没有 project.config.json: ${project.abs}（将先执行构建）`,
        );
      } else {
        issues.push(`配置的 projectPath 下没有 project.config.json: ${project.abs}`);
      }
    }
  } else if (fs.existsSync(dir)) {
    project = detectProjectPath(dir, action);
    if (!project) {
      expected = expectedProjectRel(action);
      const want = path.join(dir, expected);
      if (build) {
        issues.push(
          `尚未找到含 project.config.json 的工程目录；构建后期望: ${want}`,
        );
      } else {
        issues.push(
          [
            `在 ${dir} 下未找到 project.config.json。`,
            `已探测: ${[...new Set([expectedProjectRel('upload'), expectedProjectRel('preview')])].join('、')}，以及项目根目录。`,
            '请先构建，或在配置中填写 build / projectPath。',
          ].join('\n'),
        );
      }
    } else if (action === 'upload' && project.kind === 'dev') {
      expected = expectedProjectRel('upload');
      issues.push(
        `upload 需要生产构建目录（${expected}），当前仅有开发目录 ${project.rel}。将先执行构建。`,
      );
      if (!build) {
        issues.push('未配置且未探测到 build，无法生成生产构建目录。');
      }
    }
  }

  const keyPath = findPrivateKeyPath(app.appid);
  if (!keyPath) issues.push(missingKeyMessage(app.appid));

  const ver = version?.trim() || defaultVersion();
  const remark = desc?.trim() || (action === 'preview' ? defaultDesc(action) : '');
  if (action === 'upload' && !remark) {
    issues.push('上传必须填写版本备注');
  }

  return {
    app,
    appDir: dir,
    action,
    version: ver,
    desc: remark,
    build,
    project,
    expectedProjectRel: expected,
    privateKeyPath: keyPath,
    issues: unique(issues),
  };
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

export function describePlan(plan: AppPlan, dryRun: boolean): string[] {
  const lines = [
    `[${plan.app.name}] ${dryRun ? 'dry-run' : plan.action}`,
    `  appid      ${plan.app.appid}`,
    `  类型       ${plan.app.type}`,
    `  目录       ${plan.appDir}`,
    `  动作       ${plan.action === 'preview' ? '预览 preview' : '上传 upload'}`,
    `  版本       ${plan.version}`,
    `  备注       ${plan.desc}`,
    `  构建       ${plan.build ? `${plan.build}${dryRun ? '（演练不执行）' : ''}` : '（无）'}`,
  ];
  if (plan.project && hasProjectConfig(plan.project.abs) && plan.action === 'preview') {
    lines.push(`  工程目录   ${plan.project.abs}`);
  } else if (plan.project && hasProjectConfig(plan.project.abs) && plan.action === 'upload' && plan.project.kind !== 'dev') {
    lines.push(`  工程目录   ${plan.project.abs}`);
  } else if (plan.expectedProjectRel) {
    lines.push(`  工程目录   ${path.join(plan.appDir, plan.expectedProjectRel)}（构建后期望）`);
  } else if (plan.project) {
    lines.push(`  工程目录   ${plan.project.abs}`);
  } else {
    lines.push('  工程目录   （未找到）');
  }
  if (plan.privateKeyPath) {
    lines.push(`  密钥       已找到  ${plan.privateKeyPath}`);
  } else {
    lines.push('  密钥       未找到');
  }
  return lines;
}

export function blockingIssues(plan: AppPlan, dryRun: boolean): string[] {
  const out: string[] = [];
  for (const issue of plan.issues) {
    const buildWillFix =
      Boolean(plan.build) &&
      (issue.includes('构建后期望') ||
        issue.includes('将先执行构建') ||
        issue.includes('当前仅有开发目录'));
    if (dryRun && buildWillFix) continue;
    if (!dryRun && buildWillFix) continue;
    out.push(issue);
  }
  if (!plan.privateKeyPath) {
    /* already in issues */
  }
  return out;
}

export async function runPlans(
  plans: AppPlan[],
  opts: { dryRun: boolean; emit?: (ev: EngineEvent) => void },
): Promise<{ ok: boolean; results: { name: string; ok: boolean; error?: string; qrcodePath?: string }[] }> {
  const emit = opts.emit ?? (() => undefined);
  const results: { name: string; ok: boolean; error?: string; qrcodePath?: string }[] = [];
  let allOk = true;
  for (const plan of plans) {
    emit({ type: 'app-start', name: plan.app.name });
    for (const line of describePlan(plan, opts.dryRun)) emit({ type: 'log', line });
    const result = await runPlan(plan, opts);
    if (!result.ok) allOk = false;
    results.push({ name: plan.app.name, ...result });
    emit({
      type: 'app-done',
      name: plan.app.name,
      ok: result.ok,
      error: result.error,
      qrcodePath: result.qrcodePath,
    });
  }
  return { ok: allOk, results };
}

export async function runPlan(
  plan: AppPlan,
  opts: { dryRun: boolean; emit?: (ev: EngineEvent) => void },
): Promise<{ ok: boolean; error?: string; qrcodePath?: string }> {
  const emit = opts.emit ?? (() => undefined);
  const failIssues = blockingIssues(plan, opts.dryRun);
  if (failIssues.length) {
    const error = failIssues.join('\n');
    emit({ type: 'log', line: `  失败       ${error}` });
    return { ok: false, error };
  }

  if (opts.dryRun) {
    emit({ type: 'log', line: '  结果       校验通过（未构建，未调用微信）' });
    return { ok: true };
  }

  try {
    if (plan.build) {
      emit({ type: 'progress', name: plan.app.name, message: `构建：${plan.build}` });
      emit({ type: 'log', line: `  构建中     ${plan.build}` });
      await runBuild(plan.build, plan.appDir);
      emit({ type: 'log', line: '  构建       完成' });
    }

    const project = resolveProjectAfterBuild(plan);
    if (!project || !hasProjectConfig(project.abs)) {
      const want = plan.expectedProjectRel
        ? path.join(plan.appDir, plan.expectedProjectRel)
        : plan.appDir;
      throw new Error(`构建后仍未找到 project.config.json（期望: ${want}）`);
    }
    if (!plan.privateKeyPath) throw new Error(missingKeyMessage(plan.app.appid));

    emit({ type: 'log', line: `  工程目录   ${project.abs}` });
    const projectInst = new ci.Project({
      appid: plan.app.appid,
      type: plan.app.type,
      projectPath: project.abs,
      privateKeyPath: plan.privateKeyPath,
      ignores: ['node_modules/**/*'],
    });

    if (plan.action === 'preview') {
      const dest = path.join(cacheDir(), `${plan.app.appid}-preview-${formatStamp()}.jpg`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      emit({ type: 'progress', name: plan.app.name, message: '正在向微信申请预览码' });
      await ci.preview({
        project: projectInst,
        version: plan.version,
        desc: plan.desc,
        setting: COMPILE_SETTINGS,
        qrcodeFormat: 'image',
        qrcodeOutputDest: dest,
        onProgressUpdate: (task) => {
          const msg = progressMessage(task);
          if (msg) emit({ type: 'progress', name: plan.app.name, message: msg });
        },
      });
      emit({ type: 'log', line: `  预览码     ${dest}` });
      emit({ type: 'log', line: '  结果       预览成功' });
      return { ok: true, qrcodePath: dest };
    }

    emit({ type: 'progress', name: plan.app.name, message: '正在上传到微信' });
    await ci.upload({
      project: projectInst,
      version: plan.version,
      desc: plan.desc,
      setting: COMPILE_SETTINGS,
      onProgressUpdate: (task) => {
        const msg = progressMessage(task);
        if (msg) emit({ type: 'progress', name: plan.app.name, message: msg });
      },
    });
    emit({ type: 'log', line: '  结果       上传成功' });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    emit({ type: 'log', line: `  失败       ${error}` });
    return { ok: false, error };
  }
}

function resolveProjectAfterBuild(plan: AppPlan): DetectedPath | undefined {
  if (plan.app.projectPath?.trim()) {
    const configured = resolveConfiguredProjectPath(plan.appDir, plan.app.projectPath.trim());
    if (hasProjectConfig(configured.abs)) return configured;
  }
  const detected = detectProjectPath(plan.appDir, plan.action);
  if (plan.action === 'upload' && detected?.kind === 'dev') {
    const prod = detectProjectPath(plan.appDir, 'upload');
    // detectProjectPath(upload) already prefers prod; if it still returns dev, prod is missing
    return prod?.kind === 'prod' ? prod : detected;
  }
  return detected;
}

function progressMessage(task: unknown): string | undefined {
  if (typeof task === 'string') {
    const s = task.trim();
    return s || undefined;
  }
  if (!task || typeof task !== 'object') return undefined;
  const rec = task as { message?: unknown; status?: unknown };
  const message = typeof rec.message === 'string' ? rec.message.trim() : '';
  const status = typeof rec.status === 'string' ? rec.status.trim() : '';
  if (message && status) return `${status}: ${message}`;
  return message || status || undefined;
}

function runBuild(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
    });
    const chunks: string[] = [];
    const take = (buf: Buffer) => {
      const s = buf.toString('utf8');
      chunks.push(s);
      if (chunks.join('').length > 80_000) chunks.splice(0, Math.floor(chunks.length / 2));
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);
    child.on('error', (err) => reject(new Error(`无法启动构建命令: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = chunks.join('').trim().split('\n').slice(-20).join('\n');
      reject(
        new Error(
          `构建失败（命令: ${command}，退出码 ${code ?? 'null'}）${tail ? `\n${tail}` : ''}`,
        ),
      );
    });
  });
}
