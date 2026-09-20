import fs from 'node:fs';
import path from 'node:path';
import {
  cwdConfigPath,
  expandPath,
  findUserConfig,
  packageRoot,
  xdgConfigPath,
} from './config.js';

function insidePackage(cwd: string): boolean {
  const root = path.resolve(packageRoot());
  const here = path.resolve(cwd);
  return here === root || here.startsWith(root + path.sep);
}

function ensureDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefer ./config/upload-server.json whenever its directory is writable
 * (including when cwd is inside the cmd-tools package — the file is gitignored).
 * Fall back to XDG only if the cwd config dir is not writable.
 */
export function chooseInitTarget(explicit?: string): { file: string; via: 'config' | 'cwd' | 'home' } {
  if (explicit?.trim()) {
    return { file: path.resolve(expandPath(explicit.trim())), via: 'config' };
  }
  const cwdFile = cwdConfigPath();
  if (ensureDir(path.dirname(cwdFile))) {
    return { file: cwdFile, via: 'cwd' };
  }
  const homeFile = xdgConfigPath();
  ensureDir(path.dirname(homeFile));
  return { file: homeFile, via: 'home' };
}

/** Minimal empty skeleton — never copy the example (which contains fake projects). */
export function emptyConfigJson(): string {
  return `${JSON.stringify(
    {
      rootPath: '',
      servers: [],
      groups: [],
    },
    null,
    2,
  )}\n`;
}

export const FIELD_TABLE = `
字段说明（upload-server.json）
完整文档见仓库 config/upload-server.fields.md；示例见 upload-server.example.json。

rootPath          本机代码根目录（绝对路径）
servers[]         远端主机列表（name / host / port / user / password）
groups[]          组件分组（一键勾选整组）
  name            组件名
  packages[]      该组件下的发版单元
    name          显示名 / 勾选标识
    dir           相对 rootPath 的本地目录
    build         打包命令（必填，不可省略）
    dest          { "<服务器 name>": "/远端绝对路径" }（key 须与 servers[].name 一致）
    outDir        web 产物目录（可选，可由工具探测）
    jar           api jar 相对路径（可选，可由工具探测）
    module        Maven -pl 模块（可选，可由工具探测）
    releaseName   远端文件名覆盖（可选）
    after         上传成功后钩子：[{ "label": "中文说明", "run": "shell" }, ...]
`;

/** Short next-step hint — do not dump a long AI paste block. */
export function nextStepHint(file: string): string {
  return aiSetupGuide(file).join('\n');
}

/**
 * 给「使用者的 AI」看的首页说明（配置为空时展示）。
 * 准确步骤：先读 README → 问项目名 → 只扫这些项目 → 填 JSON。
 */
export function aiSetupGuide(configPath: string): string[] {
  return [
    '给 AI 的用法（配置尚未填写）',
    '',
    '1. 先读本仓库 README.md（使用步骤）和 config/upload-server.fields.md（字段说明）。',
    '2. 先问使用者：要发版的项目名字是哪些？（可多个）——确认名字之前不要全盘扫描。',
    '3. 只扫描这些项目：目录、package.json / pom.xml、upload/deploy/scp 脚本、Dockerfile、.vscode 上传脚本等。',
    '4. 只改这一份配置（含密码勿提交 git）：',
    `   ${configPath}`,
    '5. 填写：rootPath、servers、groups / packages（name、dir、build 必填、dest；可选 outDir / jar / module / after[{label,run}]）。',
    '6. 可对照 config/upload-server.example.json；填完后让使用者：pnpm start -- upload-server --dry-run，再真发。',
    '7. 查看上次失败日志：pnpm start -- /log（或首页选 /log）。',
  ];
}

/** True when rootPath is blank and servers/groups are empty arrays. */
export function isEmptyUserConfig(file: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      rootPath?: unknown;
      servers?: unknown;
      groups?: unknown;
      packages?: unknown;
    };
    const root = typeof raw.rootPath === 'string' ? raw.rootPath.trim() : '';
    const servers = Array.isArray(raw.servers) ? raw.servers : null;
    const groups = Array.isArray(raw.groups) ? raw.groups : null;
    const packages = Array.isArray(raw.packages) ? raw.packages : [];
    if (root) return false;
    if (!servers || servers.length > 0) return false;
    if (!groups || groups.length > 0) return false;
    if (packages.length > 0) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a user config file exists. First create does not need --force.
 * Writes an empty skeleton (NOT a copy of the example).
 */
export function ensureUserConfig(opts?: { configPath?: string }): { file: string; created: boolean } {
  const existing = findUserConfig(opts?.configPath);
  if (existing) {
    return { file: existing, created: false };
  }

  const { file } = chooseInitTarget(opts?.configPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, emptyConfigJson(), 'utf8');
  return { file, created: true };
}

export function runInit(opts: { force?: boolean; configPath?: string }): number {
  const { file, via } = chooseInitTarget(opts.configPath);
  if (fs.existsSync(file) && !opts.force) {
    console.error(`配置已存在: ${file}`);
    console.error('如需覆盖为空配置请加 --force；或用 --config 指定其它路径。');
    console.error('');
    console.log(nextStepHint(file));
    return 0;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, emptyConfigJson(), 'utf8');
  const where =
    via === 'home'
      ? '（cwd 的 config 目录不可写，已放到用户配置目录）'
      : via === 'cwd'
        ? insidePackage(process.cwd())
          ? '（./config/upload-server.json，已 gitignore）'
          : '（当前工作目录 ./config）'
        : '';
  console.log(`已创建空配置: ${file} ${where}`.trim());
  console.log(nextStepHint(file));
  return 0;
}

export function missingUserConfigMessage(): string {
  return [
    '未找到本机 upload-server.json。',
    '请先运行: cmd-tools upload-server --init',
    '或直接 pnpm dev / pnpm start（会自动生成空配置）。',
    '下一步：先告诉助手要发版的项目名字，再扫描填写。',
    `查找位置: ${cwdConfigPath()} 或 ${xdgConfigPath()}`,
  ].join('\n');
}

