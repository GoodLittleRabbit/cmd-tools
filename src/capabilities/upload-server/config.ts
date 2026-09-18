import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Server = {
  /** 显示名（也是 dest 的 key） */
  name: string;
  host: string;
  /** SSH 端口，默认 22 */
  port: number;
  user: string;
  password: string;
};

export type Package = {
  /** 显示名；也是勾选 / CLI 标识 */
  name: string;
  /** 相对 rootPath 的本地目录 */
  dir: string;
  /** 在 dir 下执行的构建命令（必填） */
  build: string;
  /** 服务器 name → 远端最终目录 */
  dest: Record<string, string>;
  outDir?: string;
  releaseName?: string;
  jar?: string;
  module?: string;
  /**
   * 上传成功后在远端 dest 执行的钩子（生命周期）。
   * 每步需中文 label，便于编排器展示「正在…」。
   */
  after?: AfterStep[];
};

export type AfterStep = {
  /** 中文说明，如「整理 jar 到 target」「Docker 构建并启动」 */
  label: string;
  /** 在 dest 目录执行的 shell 命令 */
  run: string;
};

/** 组件分组：一键发版一组 packages */
export type Group = {
  name: string;
  packages: Package[];
};

/** 有 jar+module → api，否则按 web（产物字段可由 detect 补齐） */
export function packageMode(pkg: Package): 'web' | 'api' {
  if (pkg.jar?.trim() && pkg.module?.trim()) return 'api';
  if (pkg.outDir?.trim()) return 'web';
  // 尚未探测时：有任一 java 字段偏 api，否则 web
  if (pkg.jar?.trim() || pkg.module?.trim()) return 'api';
  return 'web';
}


export type LoadedConfig = {
  /** 本地根路径；packages[].dir 相对它 */
  rootPath: string;
  servers: Server[];
  /** 组件分组（一键勾选整组） */
  groups: Group[];
  /** 所有 group 下 packages 展平（兼容旧逻辑） */
  packages: Package[];
  configPath: string;
  demo: boolean;
};

export type RawConfig = {
  rootPath?: string;
  /** @deprecated */
  codeRoot?: string;
  servers?: Array<{
    id?: string;
    name?: string;
    label?: string;
    host?: string;
    port?: number | string;
    user?: string;
    password?: string;
  }>;
  groups?: Array<{ name?: string; packages?: Array<RawPackage> }>;
  packages?: Array<RawPackage>;
  /** @deprecated */
  services?: Array<RawPackage>;
};

type RawPackage = {
  id?: string;
  name?: string;
  label?: string;
  type?: string;
  kind?: string;
  dir?: string;
  project?: string;
  build?: string;
  outDir?: string;
  artifactDir?: string;
  releaseName?: string;
  remoteReleaseName?: string;
  jar?: string;
  module?: string;
  after?: Array<{ label?: string; run?: string }>;
  dest?: Record<string, string>;
  remote?: Record<string, string>;
  destDir?: string;
  remoteSubdir?: string;
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
  return path.join(packageRoot(), 'config', 'upload-server.example.json');
}

export function xdgConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim()
    ? expandPath(process.env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), '.config');
  return path.join(base, 'cmd-tools', 'upload-server.json');
}

export function cwdConfigPath(): string {
  return path.resolve(process.cwd(), 'config', 'upload-server.json');
}

function isFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 用户配置（不含包内 example） */
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
  rows.push({ label: 'bundled example', path: bundledExampleConfigPath() });
  return rows;
}

export function resolveConfigFile(explicit?: string): { file: string; demo: boolean } {
  if (explicit?.trim()) {
    const file = path.resolve(expandPath(explicit.trim()));
    if (!isFile(file)) throw new Error(`找不到配置: ${file}`);
    const demo = path.resolve(file) === path.resolve(bundledExampleConfigPath());
    return { file, demo };
  }
  const user = findUserConfig();
  if (user) return { file: user, demo: false };
  const example = bundledExampleConfigPath();
  if (!isFile(example)) {
    throw new Error('找不到 upload-server.json。请先运行 --init 生成空配置，或填写 ./config/upload-server.json。');
  }
  return { file: example, demo: true };
}

function isBlankRoot(raw: RawConfig): boolean {
  return !String(raw.rootPath ?? raw.codeRoot ?? '').trim();
}

function isEmptyServers(raw: RawConfig): boolean {
  return !Array.isArray(raw.servers) || raw.servers.length === 0;
}

function isEmptyGroupsAndPackages(raw: RawConfig): boolean {
  const groupsEmpty = !Array.isArray(raw.groups) || raw.groups.length === 0;
  const packagesEmpty = !Array.isArray(raw.packages) || raw.packages.length === 0;
  const servicesEmpty = !Array.isArray(raw.services) || raw.services.length === 0;
  return groupsEmpty && packagesEmpty && servicesEmpty;
}

/** Completely unfilled skeleton: blank rootPath, no servers, no groups/packages. */
export function isEmptyRawConfig(raw: RawConfig): boolean {
  return isBlankRoot(raw) && isEmptyServers(raw) && isEmptyGroupsAndPackages(raw);
}

export function isEmptyConfigFile(file: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawConfig;
    return isEmptyRawConfig(raw);
  } catch {
    return false;
  }
}

export function isEmptyConfig(config: LoadedConfig): boolean {
  return !config.rootPath.trim() && config.servers.length === 0 && config.groups.length === 0;
}

function requireDest(dest: Record<string, string> | undefined, where: string): Record<string, string> {
  if (!dest || typeof dest !== 'object' || Array.isArray(dest)) {
    throw new Error(`${where}: dest 必须是对象，例如 { "dev": "/var/www/app" }`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(dest)) {
    if (!k.trim() || typeof v !== 'string' || !v.trim()) {
      throw new Error(`${where}: dest["${k}"] 必须是非空绝对路径`);
    }
    out[k.trim()] = v.trim().replace(/\/$/, '');
  }
  if (!Object.keys(out).length) throw new Error(`${where}: dest 不能为空`);
  return out;
}


function parseAfter(raw: RawPackage['after'], where: string): AfterStep[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error(`${where}: after 必须是数组，形如 [{ "label": "中文说明", "run": "shell" }]`);
  }
  if (!raw.length) return undefined;
  return raw.map((item, i) => {
    const at = `${where}.after[${i}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${at}: 必须是对象 { label, run }，不支持字符串`);
    }
    const label = String(item.label ?? '').trim();
    const run = String(item.run ?? '').trim();
    if (!label) throw new Error(`${at}: 缺少 label（中文说明）`);
    if (!run) throw new Error(`${at}: 缺少 run（shell 命令）`);
    return { label, run };
  });
}

function parsePackage(raw: RawPackage, index: number): Package {
  const where = `packages[${index}]`;
  const name = (raw.name ?? raw.label ?? raw.id)?.trim();
  const dir = (raw.dir ?? raw.project)?.trim();
  if (!name) throw new Error(`${where}: 缺少 name`);
  if (!dir) throw new Error(`${where}: 缺少 dir（相对 rootPath）`);

  let destRaw = raw.dest ?? raw.remote;
  const sub = (raw.destDir ?? raw.remoteSubdir)?.trim();
  if (destRaw && sub && !raw.dest) {
    const merged: Record<string, string> = {};
    for (const [k, v] of Object.entries(destRaw)) {
      merged[k] = `${String(v).replace(/\/$/, '')}/${sub}`;
    }
    destRaw = merged;
  }
  const dest = requireDest(destRaw, where);

  return {
    name,
    dir,
    dest,
    build: (() => {
    const b = raw.build?.trim();
    if (!b) throw new Error(`${where}: 缺少 build（该项目的打包命令）`);
    return b;
  })(),
    outDir: (raw.outDir ?? raw.artifactDir)?.trim() || undefined,
    releaseName: (raw.releaseName ?? raw.remoteReleaseName)?.trim() || undefined,
    jar: raw.jar?.trim() || undefined,
    module: raw.module?.trim() || undefined,
    after: parseAfter(raw.after, where),
  };
}

export function loadConfig(configPath?: string): LoadedConfig {
  const { file, demo } = resolveConfigFile(configPath);
  let raw: RawConfig;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawConfig;
  } catch (e) {
    throw new Error(`配置不是合法 JSON: ${file}\n${e instanceof Error ? e.message : e}`);
  }

  if (raw.servers != null && !Array.isArray(raw.servers)) {
    throw new Error(`配置 servers 必须是数组: ${file}`);
  }
  if (raw.groups != null && !Array.isArray(raw.groups)) {
    throw new Error(`配置 groups 必须是数组: ${file}`);
  }

  const serversEmpty = isEmptyServers(raw);
  const groupsAndPackagesEmpty = isEmptyGroupsAndPackages(raw);

  // Empty skeleton (and any unfilled config with no servers/groups) must load without crashing.
  if (serversEmpty && groupsAndPackagesEmpty) {
    const rootPath = expandPath((raw.rootPath ?? raw.codeRoot)?.trim() || '');
    return { rootPath, servers: [], groups: [], packages: [], configPath: file, demo };
  }

  const rootPath = expandPath((raw.rootPath ?? raw.codeRoot)?.trim() || process.cwd());
  const serversRaw = raw.servers;
  if (serversEmpty || !serversRaw?.length) {
    throw new Error(`配置缺少 servers: ${file}`);
  }
  const hasGroups = Array.isArray(raw.groups) && raw.groups.length > 0;
  const flatLegacy = raw.packages?.length ? raw.packages : raw.services;
  if (!hasGroups && (!Array.isArray(flatLegacy) || !flatLegacy.length)) {
    throw new Error(`配置缺少 groups（或旧字段 packages）: ${file}`);
  }

  const servers: Server[] = serversRaw.map((s, i) => {
    const where = `servers[${i}]`;
    if (!s.host?.trim()) throw new Error(`${where}: 缺少 host`);
    if (!s.user?.trim()) throw new Error(`${where}: 缺少 user`);
    const name = (s.name ?? s.label ?? s.id)?.trim();
    if (!name) throw new Error(`${where}: 缺少 name`);
    const portRaw = s.port;
    let port = 22;
    if (portRaw !== undefined && portRaw !== null && String(portRaw).trim() !== '') {
      port = Number(portRaw);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(`${where}: port 必须是 1–65535 的整数`);
      }
    }
    return {
      name,
      host: s.host.trim(),
      port,
      user: s.user.trim(),
      password: s.password ?? '',
    };
  });

  let groups: Group[];
  if (hasGroups) {
    groups = raw.groups!.map((g, gi) => {
      const gname = g.name?.trim() || `group-${gi + 1}`;
      const list = g.packages;
      if (!Array.isArray(list) || !list.length) {
        throw new Error(`groups[${gi}] "${gname}" 缺少 packages`);
      }
      return {
        name: gname,
        packages: list.map((p, pi) => parsePackage(p, pi)),
      };
    });
  } else {
    // 旧版扁平 packages → 单个默认组
    groups = [
      {
        name: 'default',
        packages: flatLegacy!.map((p, i) => parsePackage(p, i)),
      },
    ];
  }

  const packages = groups.flatMap((g) => g.packages);
  const names = new Set<string>();
  for (const pkg of packages) {
    if (names.has(pkg.name)) {
      throw new Error(`package name 重复: "${pkg.name}"（需全局唯一）`);
    }
    names.add(pkg.name);
  }

  const serverNames = new Set(servers.map((s) => s.name));
  for (const pkg of packages) {
    for (const key of Object.keys(pkg.dest)) {
      if (!serverNames.has(key)) {
        throw new Error(`package "${pkg.name}" 的 dest 引用了未知服务器 name: ${key}`);
      }
    }
  }

  return { rootPath, servers, groups, packages, configPath: file, demo };
}

export function resolveDest(pkg: Package, serverName: string): string | undefined {
  return pkg.dest[serverName];
}

export function webReleaseName(pkg: Package): string {
  return pkg.releaseName || path.basename(pkg.outDir || 'dist');
}

/** 该 package 在指定服务器上的最终远端路径 */
export function describeDest(pkg: Package, serverName: string): string {
  const dest = resolveDest(pkg, serverName);
  if (!dest) return '(未配置 dest)';
  if (packageMode(pkg) === 'web' && (pkg.outDir || pkg.releaseName)) {
    // web：dest 为部署根；有产物信息时再拼发布子目录
    return `${dest.replace(/\/$/, '')}/${webReleaseName(pkg)}`;
  }
  return dest;
}

/** @deprecated use describeDest */
export const describeRemote = describeDest;
