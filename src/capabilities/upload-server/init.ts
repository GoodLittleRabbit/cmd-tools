import fs from 'node:fs';
import path from 'node:path';
import {
  bundledExampleConfigPath,
  cwdConfigPath,
  expandPath,
  packageRoot,
  xdgConfigPath,
} from './config.js';

function isInsideToolPackage(cwd: string): boolean {
  const root = path.resolve(packageRoot());
  const here = path.resolve(cwd);
  return here === root || here.startsWith(root + path.sep);
}

function ensureWritableDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** 优先 ./config；在 cmd-tools 源码/安装目录内或无法写入时改用 ~/.config/cmd-tools */
export function chooseInitTarget(explicit?: string): { file: string; via: 'config' | 'cwd' | 'home' } {
  if (explicit?.trim()) {
    return { file: path.resolve(expandPath(explicit.trim())), via: 'config' };
  }
  const cwdFile = cwdConfigPath();
  if (!isInsideToolPackage(process.cwd()) && ensureWritableDir(path.dirname(cwdFile))) {
    return { file: cwdFile, via: 'cwd' };
  }
  const homeFile = xdgConfigPath();
  ensureWritableDir(path.dirname(homeFile));
  return { file: homeFile, via: 'home' };
}

export const FIELD_TABLE = `
CODE_ROOT
  本机代码根目录。各服务的 projectRel 相对此路径。

SERVERS 一行（用 | 分隔）
  id | label | host | user | password | roles
  id        短名，给 -s 和 remoteMap 左侧用
  label     显示名
  host      SSH 主机（IP 或域名）
  user      SSH 用户
  password  SSH 密码；填 CHANGE_ME 或留空则尝试密钥
  roles     逗号分隔：web 和/或 api

SERVICES · Web 一行
  id | label | web | projectRel | buildCommand | artifactDir | remoteMap [| remoteDirName]
  projectRel     相对 CODE_ROOT 的前端项目目录
  buildCommand   如 pnpm build；空则跳过构建
  artifactDir    构建产物目录（须含 index.html）
  remoteMap      serverId:/远端绝对路径  多机用 ;; 分隔
  remoteDirName  可选，远端目录名/tgz 名，默认 artifactDir 的目录名

SERVICES · API 一行（推荐写全）
  id | label | api | projectRel | buildCommand | jarRel | moduleRel | remoteSubdir | remoteMap
  projectRel     相对 CODE_ROOT 的后端项目目录
  buildCommand   如 mvn -pl server -am -DskipTests package；空则跳过
  jarRel         相对项目的 jar 路径
  moduleRel      相对项目的模块目录（找 Dockerfile/start.sh）
  remoteSubdir   远端子目录名
  remoteMap      同上

可选 API_PRESET="yudao"：才允许 API 写成短名
  id | label | api | projectRel | shortName | remoteMap
`.trim();

export function aiPromptForUser(confPath: string): string {
  return `你是在帮使用者填写 cmd-tools 的发版配置，不是在改 cmd-tools 源码。

目标配置文件（只改这一份）：
  ${confPath}

约束：
- 只写/改上述 conf，不要修改 cmd-tools 仓库里的 TypeScript/源码。
- 不要调用或依赖业务仓库里现成的 upload/deploy shell（例如 upload-dist.sh、.vscode 里的上传脚本）；那些脚本只当作「信息来源」来推断主机、路径、构建命令。
- 密码、主机、路径一律写进 conf；不要把密钥写进源码或 README。
- 填完后请让使用者执行：cmd-tools upload-server --dry-run
- 真发是：cmd-tools upload-server

请扫描使用者本机/当前仓库（优先当前工作区），范围包括：
- 文件名或内容含 upload / deploy / scp / ssh / rsync 的脚本
- package.json 的 scripts（build、build-prod、build:prod 等）
- Makefile / justfile / 自定义 scripts 目录
- .vscode 下的上传/部署脚本或 tasks
- 现有的 dist、target/*.jar、Dockerfile、start.sh
- 文档或注释里的主机、用户、远端目录

根据扫描结果填写：
${FIELD_TABLE}

占位符 YOUR_CODE_ROOT、your-web-app、127.0.0.1、CHANGE_ME、your-api 必须换成真实值。
remoteMap 的 serverId 必须与 SERVERS 的 id 一致。`;
}

export function runInit(opts: { force?: boolean; configPath?: string }): number {
  const example = bundledExampleConfigPath();
  if (!fs.existsSync(example)) {
    console.error(`找不到包内 example: ${example}`);
    return 1;
  }

  const { file, via } = chooseInitTarget(opts.configPath);
  const existed = fs.existsSync(file);

  if (existed && !opts.force) {
    console.log(`已存在配置，未覆盖: ${file}`);
    console.log('若要覆盖请加 --force： cmd-tools upload-server --init --force');
    console.log('');
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(example, file);
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* ignore */
    }
    const where =
      via === 'home'
        ? '（当前目录是 cmd-tools 自身或不便写入，已放到用户配置目录）'
        : via === 'config'
          ? '（--config）'
          : '（当前工作目录）';
    console.log(`已写入配置: ${file} ${where}`);
    if (existed) console.log('已按 --force 覆盖旧文件。');
    console.log('请把真实路径 / 主机 / 密码填进该文件（不要提交密钥）。');
    console.log('');
  }

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
  console.log('');
  console.log('下一步：把 ① 交给你的 AI 填 conf → cmd-tools upload-server --dry-run → cmd-tools upload-server');
  return 0;
}

export function missingUserConfigMessage(): string {
  return [
    '未找到本机配置。请先初始化：',
    '',
    '  cmd-tools upload-server --init',
    '',
    '查找位置：',
    `  ${cwdConfigPath()}`,
    `  ${xdgConfigPath()}`,
  ].join('\n');
}
