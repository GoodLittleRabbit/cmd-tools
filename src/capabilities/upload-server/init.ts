import fs from 'node:fs';
import path from 'node:path';
import {
  bundledExampleConfigPath,
  cwdConfigPath,
  expandPath,
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

/** Prefer ./config; if inside cmd-tools package or not writable, use ~/.config/cmd-tools */
export function chooseInitTarget(explicit?: string): { file: string; via: 'config' | 'cwd' | 'home' } {
  if (explicit?.trim()) {
    return { file: path.resolve(expandPath(explicit.trim())), via: 'config' };
  }
  const cwdFile = cwdConfigPath();
  if (!insidePackage(process.cwd()) && ensureDir(path.dirname(cwdFile))) {
    return { file: cwdFile, via: 'cwd' };
  }
  const homeFile = xdgConfigPath();
  ensureDir(path.dirname(homeFile));
  return { file: homeFile, via: 'home' };
}

export const FIELD_TABLE = `
字段说明（upload-server.json）

rootPath
  本机根路径。groups[]
  name      组件名（一键勾选整组）
  packages  该组件下的发版单元

groups[].packages[]
  name      显示名 / 勾选标识
  dir       相对 rootPath 的本地目录
  build     打包命令（必填）
  dest      { "<服务器 name>": "/远端绝对路径" }
  outDir / jar / module / releaseName 可选
  after    上传成功后钩子数组（仅此格式）：[{ "label": "中文说明", "run": "shell" }, ...]
`;

export function aiPromptForUser(confPath: string): string {
  return `你是在帮使用者填写 cmd-tools 的发版配置，不是在改 cmd-tools 源码。

目标配置文件（只改这一份 JSON）：
  ${confPath}

约束：
- 只写/改上述 JSON，不要修改 cmd-tools 仓库里的 TypeScript/源码。
- 不要调用或依赖业务仓库里现成的 upload/deploy shell；那些脚本只当作「信息来源」来推断主机、路径。
- 密码、主机、路径一律写进 JSON；不要把密钥写进源码或 README。
- JSON 必须合法（双引号、无尾逗号、无注释）。
- 填完后请让使用者执行：cmd-tools upload-server --dry-run
- 真发：cmd-tools upload-server

请扫描使用者本机/当前工作区，范围包括：
- 文件名或内容含 upload / deploy / scp / ssh / rsync 的脚本
- package.json、pom.xml
- Makefile / justfile / scripts 目录
- .vscode 下的上传/部署脚本或 tasks
- dist、target/*.jar、Dockerfile、start.sh
- 文档或注释里的主机、用户、远端目录

根据扫描结果，按下列结构填写 JSON（可参考同目录 example）：
{
  "rootPath": "/绝对路径",
  "servers": [
    { "name": "开发机", "host": "127.0.0.1", "port": 22, "user": "deploy", "password": "CHANGE_ME" }
  ],
  "groups": [
    {
      "name": "your-web-app",
      "packages": [
        {
          "name": "web",
          "dir": "your-web-app",
          "build": "pnpm build",
          "dest": { "开发机": "/var/www/your-web-app" }
        }
      ]
    }
  ]
}

${FIELD_TABLE}

占位符必须换成真实值。
dest 的 key 必须与 servers[].name 一致。
build / outDir / jar / module 通常可省略，由工具自动探测。`;
}

export function runInit(opts: { force?: boolean; configPath?: string }): number {
  const example = bundledExampleConfigPath();
  if (!fs.existsSync(example)) {
    console.error(`缺少示例配置: ${example}`);
    return 1;
  }
  const { file, via } = chooseInitTarget(opts.configPath);
  if (fs.existsSync(file) && !opts.force) {
    console.error(`配置已存在: ${file}`);
    console.error('如需覆盖请加 --force；或用 --config 指定其它路径。');
    console.error('');
    console.error('------------------------------------------------------------');
    console.error('① 给使用者 AI 的提示词（下面整段复制）');
    console.error('------------------------------------------------------------');
    console.log(aiPromptForUser(file));
    console.error('------------------------------------------------------------');
    return 0;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(example, file);
  const where =
    via === 'home'
      ? '（当前在 cmd-tools 目录内或不便写入，已放到用户配置目录）'
      : via === 'cwd'
        ? '（当前工作目录 ./config）'
        : '';
  console.log(`已写入配置: ${file} ${where}`.trim());
  console.log('请把真实路径 / 主机 / 密码填进该 JSON（不要提交密钥）。');
  console.log('');
  console.log('------------------------------------------------------------');
  console.log('① 给使用者 AI 的提示词（下面整段复制）');
  console.log('------------------------------------------------------------');
  console.log(aiPromptForUser(file));
  console.log('------------------------------------------------------------');
  console.log('① 结束');
  console.log('');
  console.log('------------------------------------------------------------');
  console.log('② 字段对应表');
  console.log('------------------------------------------------------------');
  console.log(FIELD_TABLE);
  console.log('------------------------------------------------------------');
  console.log('下一步: 把上面提示词交给你的 AI 填 JSON，然后:');
  console.log('  cmd-tools upload-server --dry-run');
  return 0;
}

export function missingUserConfigMessage(): string {
  return [
    '未找到本机 upload-server.json。',
    '请先运行: cmd-tools upload-server --init',
    '然后把终端里的提示词交给你的 AI，扫描本机项目并填写 JSON。',
    `查找位置: ${cwdConfigPath()} 或 ${xdgConfigPath()}`,
  ].join('\n');
}
