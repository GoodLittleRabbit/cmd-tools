import fs from 'node:fs';
import path from 'node:path';
import {
  cwdConfigPath,
  expandPath,
  findUserConfig,
  xdgConfigPath,
} from './config.js';

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
 * Prefer ./config/upload-server.json whenever that directory is writable
 * (including when developing inside this package — the file is gitignored).
 * Fall back to XDG only if the cwd config dir cannot be created/written.
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

/** Short next-step text for humans / assistants. Do not dump a long paste-prompt. */
export function nextStepHint(file: string): string {
  return [
    `已准备配置文件：${file}`,
    '下一步：先告诉我要发版的项目名字（可多个）。确认名字之前不要全盘扫描。',
    '说出名字后，只扫描这些项目并填写该 JSON；字段见 config/upload-server.fields.md；示例见 upload-server.example.json；`build` 必填。',
    '填完：`pnpm start -- upload-server --dry-run`，再真发。',
  ].join('\n');
}

function writeEmptyConfig(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, emptyConfigJson(), 'utf8');
}

/**
 * Ensure a user config file exists. First create does not need --force.
 * Writes an empty skeleton (not a copy of the example).
 */
export function ensureUserConfig(opts?: { configPath?: string }): { file: string; created: boolean } {
  const existing = findUserConfig(opts?.configPath);
  if (existing) {
    return { file: existing, created: false };
  }

  const { file } = chooseInitTarget(opts?.configPath);
  writeEmptyConfig(file);
  return { file, created: true };
}

export function runInit(opts: { force?: boolean; configPath?: string }): number {
  const { file, via } = chooseInitTarget(opts.configPath);
  if (fs.existsSync(file) && !opts.force) {
    console.error(`配置已存在: ${file}`);
    console.error('如需覆盖请加 --force；或用 --config 指定其它路径。');
    console.error('');
    console.log(nextStepHint(file));
    return 0;
  }
  writeEmptyConfig(file);
  const where =
    via === 'home'
      ? '（当前工作目录无法写入 ./config，已放到用户配置目录）'
      : via === 'cwd'
        ? '（当前工作目录 ./config）'
        : '';
  console.log(`已写入空配置: ${file} ${where}`.trim());
  console.log(nextStepHint(file));
  return 0;
}

export function missingUserConfigMessage(): string {
  return [
    '未找到本机 upload-server.json。',
    '请先运行: cmd-tools upload-server --init',
    '或直接启动，会自动创建空的 ./config/upload-server.json。',
    '下一步：先告诉我要发版的项目名字，确认后再扫描填写。',
    `查找位置: ${cwdConfigPath()} 或 ${xdgConfigPath()}`,
  ].join('\n');
}

export function emptyConfigHint(): string {
  return '配置仍为空，请先告诉我要发版的项目名字再填写。';
}
