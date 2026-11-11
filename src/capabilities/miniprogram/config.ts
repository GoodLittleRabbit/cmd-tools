import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_TYPES = [
  'miniProgram',
  'miniGame',
  'miniProgramPlugin',
  'miniGamePlugin',
] as const;

export type MiniProgramType = (typeof PROJECT_TYPES)[number];

export type MiniProgramAction = 'preview' | 'upload';

export type MiniProgramApp = {
  /** 显示名；也是 CLI --app 标识 */
  name: string;
  appid: string;
  /** 相对 rootPath 的本地目录 */
  dir: string;
  /** 在 dir 下执行的构建命令；省略时运行时探测 */
  build?: string;
  /** 相对 dir 的微信工程目录；省略时运行时探测 */
  projectPath?: string;
  type: MiniProgramType;
};

export type LoadedMiniProgramConfig = {
  rootPath: string;
  apps: MiniProgramApp[];
  configPath: string;
};

type RawApp = {
  name?: string;
  appid?: string;
  dir?: string;
  build?: string;
  projectPath?: string;
  type?: string;
};

type RawConfig = {
  rootPath?: string;
  apps?: RawApp[];
};

export function expandPath(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function packageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../..');
}

export function bundledExampleConfigPath(): string {
  return path.join(packageRoot(), 'config', 'miniprogram.example.json');
}

export function xdgConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim()
    ? expandPath(process.env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), '.config');
  return path.join(base, 'cmd-tools', 'miniprogram.json');
}

export function cwdConfigPath(): string {
  return path.resolve(process.cwd(), 'config', 'miniprogram.json');
}

function isFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function findUserConfig(explicit?: string): string | undefined {
  if (explicit?.trim()) {
    const file = path.resolve(expandPath(explicit.trim()));
    return isFile(file) ? file : undefined;
  }
  for (const p of [cwdConfigPath(), xdgConfigPath()]) {
    if (isFile(p)) return p;
  }
  return undefined;
}

export function configSearchPaths(explicit?: string): { label: string; path: string }[] {
  const rows: { label: string; path: string }[] = [];
  if (explicit?.trim()) {
    rows.push({ label: '--config', path: path.resolve(expandPath(explicit.trim())) });
  }
  rows.push({ label: 'cwd', path: cwdConfigPath() });
  rows.push({ label: '~/.config/cmd-tools', path: xdgConfigPath() });
  return rows;
}

export function resolveConfigFile(explicit?: string): string {
  if (explicit?.trim()) {
    const file = path.resolve(expandPath(explicit.trim()));
    if (!isFile(file)) throw new Error(`找不到配置: ${file}`);
    return file;
  }
  const user = findUserConfig();
  if (user) return user;
  const searched = configSearchPaths()
    .map((r) => `  ${r.label}: ${r.path}`)
    .join('\n');
  throw new Error(
    [
      '未找到本机 miniprogram.json。',
      '请复制 config/miniprogram.example.json 为 config/miniprogram.json 并填写（已 gitignore）。',
      '字段说明见 config/miniprogram.fields.md。',
      '查找位置:',
      searched,
    ].join('\n'),
  );
}

function parseType(raw: string | undefined, where: string): MiniProgramType {
  const t = (raw ?? 'miniProgram').trim() || 'miniProgram';
  if ((PROJECT_TYPES as readonly string[]).includes(t)) return t as MiniProgramType;
  throw new Error(`${where}: type 须是 ${PROJECT_TYPES.join(' / ')}，收到 "${t}"`);
}

function parseApp(raw: RawApp, index: number): MiniProgramApp {
  const where = `apps[${index}]`;
  const name = raw.name?.trim();
  const appid = raw.appid?.trim();
  const dir = raw.dir?.trim();
  if (!name) throw new Error(`${where}: 缺少 name`);
  if (!appid) throw new Error(`${where}: 缺少 appid`);
  if (!dir) throw new Error(`${where}: 缺少 dir（相对 rootPath）`);
  return {
    name,
    appid,
    dir,
    build: raw.build?.trim() || undefined,
    projectPath: raw.projectPath?.trim() || undefined,
    type: parseType(raw.type, where),
  };
}

export function loadConfig(configPath?: string): LoadedMiniProgramConfig {
  const file = resolveConfigFile(configPath);
  let raw: RawConfig;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawConfig;
  } catch (e) {
    throw new Error(`配置不是合法 JSON: ${file}\n${e instanceof Error ? e.message : e}`);
  }

  const rootRaw = raw.rootPath?.trim();
  if (!rootRaw) throw new Error(`配置缺少 rootPath: ${file}`);
  const rootPath = expandPath(rootRaw);
  const appsRaw = Array.isArray(raw.apps) ? raw.apps : [];
  if (!appsRaw.length) throw new Error(`配置缺少 apps: ${file}`);

  const apps = appsRaw.map((a, i) => parseApp(a, i));
  const names = new Set<string>();
  const appids = new Set<string>();
  for (const app of apps) {
    if (names.has(app.name)) throw new Error(`apps name 重复: "${app.name}"`);
    if (appids.has(app.appid)) throw new Error(`apps appid 重复: "${app.appid}"`);
    names.add(app.name);
    appids.add(app.appid);
  }

  return { rootPath, apps, configPath: file };
}

/** 按 name 或 appid 解析；未指定则返回空数组（交给 TUI 勾选） */
export function resolveApps(config: LoadedMiniProgramConfig, selectors?: string[]): MiniProgramApp[] {
  if (!selectors?.length) return [];
  return selectors.map((sel) => {
    const key = sel.trim();
    const hits = config.apps.filter((a) => a.name === key || a.appid === key);
    if (!hits.length) {
      const available = config.apps.map((a) => `${a.name}（${a.appid}）`).join('、');
      throw new Error(`找不到小程序: "${key}"。已配置: ${available}`);
    }
    return hits[0]!;
  });
}

export function parseAppSelectors(raw?: string): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

export function parseAction(raw?: string): MiniProgramAction | undefined {
  const v = raw?.trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'preview' || v === 'upload') return v;
  throw new Error(`--action 须是 preview 或 upload，收到 "${raw}"`);
}

export function appDir(rootPath: string, app: MiniProgramApp): string {
  return path.isAbsolute(app.dir) ? app.dir : path.resolve(rootPath, app.dir);
}
