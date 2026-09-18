import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyApiPreset } from './preset.js';

export type Server = {
  id: string;
  label: string;
  host: string;
  user: string;
  password: string;
  roles: string[];
};

export type Service = {
  id: string;
  label: string;
  kind: 'web' | 'api';
  projectRel: string;
  buildCommand: string;
  remoteMap: string;
  /** web: 相对项目的产物目录 */
  artifactDir?: string;
  /** web: 远端目录名 / tgz 名（默认 artifactDir 的 basename） */
  remoteReleaseName?: string;
  /** api */
  jarRel?: string;
  moduleRel?: string;
  remoteSubdir?: string;
};

export type LoadedConfig = {
  codeRoot: string;
  servers: Server[];
  services: Service[];
  configPath: string;
  demo: boolean;
  apiPreset: string;
};

function expandPath(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function parseLine(line: string): string[] {
  return line.split('|').map((s) => s.trim());
}

function extractArrayBlock(src: string, name: string): string[] {
  const re = new RegExp(`${name}=\\(([\\s\\S]*?)\\n\\)`, 'm');
  const m = src.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

function quotedValue(src: string, name: string): string | undefined {
  const m = src.match(new RegExp(`^\\s*${name}="([^"]*)"`, 'm'));
  return m?.[1];
}

export function bundledExampleConfigPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist|src /capabilities/upload-server → package root
  return path.resolve(here, '../../../config/upload-server.example.conf');
}

export function xdgConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim()
    ? expandPath(process.env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), '.config');
  return path.join(base, 'cmd-tools', 'upload-server.conf');
}

export function cwdConfigPath(): string {
  return path.resolve(process.cwd(), 'config/upload-server.conf');
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
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new Error(`找不到配置: ${file}`);
    }
    const demo = path.resolve(file) === path.resolve(bundledExampleConfigPath());
    return { file, demo };
  }

  const cwd = cwdConfigPath();
  if (fs.existsSync(cwd) && fs.statSync(cwd).isFile()) {
    return { file: cwd, demo: false };
  }

  const home = xdgConfigPath();
  if (fs.existsSync(home) && fs.statSync(home).isFile()) {
    return { file: home, demo: false };
  }

  const example = bundledExampleConfigPath();
  if (fs.existsSync(example) && fs.statSync(example).isFile()) {
    return { file: example, demo: true };
  }

  const listed = configSearchPaths()
    .map((r) => `  - ${r.label}: ${r.path}`)
    .join('\n');
  throw new Error(
    `找不到配置。请复制 example 到 ./config/upload-server.conf 或 ~/.config/cmd-tools/upload-server.conf\n${listed}`,
  );
}

function parseService(line: string, apiPreset: string): Service {
  const parts = parseLine(line);
  const kind = parts[2] as 'web' | 'api' | undefined;
  if (kind === 'web') {
    if (parts.length < 7) {
      throw new Error(
        `Web 服务字段不足（需要 id|label|web|projectRel|buildCommand|artifactDir|remoteMap）: ${line}`,
      );
    }
    const [id, label, , projectRel, buildCommand, artifactDir, remoteMap, remoteReleaseName] = parts;
    return {
      id,
      label,
      kind,
      projectRel,
      buildCommand,
      remoteMap,
      artifactDir,
      remoteReleaseName: remoteReleaseName || path.basename(artifactDir || 'dist'),
    };
  }
  if (kind === 'api') {
    if (parts.length >= 9) {
      const [id, label, , projectRel, buildCommand, jarRel, moduleRel, remoteSubdir, remoteMap] = parts;
      if (!jarRel || !moduleRel || !remoteSubdir) {
        throw new Error(`API 服务 ${id ?? '?'} 需要非空的 jarRel、moduleRel、remoteSubdir`);
      }
      return {
        id,
        label,
        kind,
        projectRel,
        buildCommand,
        remoteMap,
        jarRel,
        moduleRel,
        remoteSubdir,
      };
    }
    if (parts.length === 6) {
      const [id, label, , projectRel, shortName, remoteMap] = parts;
      const layout = applyApiPreset(apiPreset, shortName);
      return {
        id,
        label,
        kind,
        projectRel,
        buildCommand: layout.buildCommand,
        remoteMap,
        jarRel: layout.jarRel,
        moduleRel: layout.moduleRel,
        remoteSubdir: layout.remoteSubdir,
      };
    }
    throw new Error(
      `API 服务字段不对: ${line}\n写全: id|label|api|projectRel|buildCommand|jarRel|moduleRel|remoteSubdir|remoteMap\n或设置 API_PRESET="yudao" 后使用短名: id|label|api|projectRel|shortName|remoteMap`,
    );
  }
  throw new Error(`未知 kind "${parts[2] ?? ''}"（需要 web 或 api）: ${line}`);
}

export function loadConfig(configPath?: string): LoadedConfig {
  const { file, demo } = resolveConfigFile(configPath);
  const src = fs.readFileSync(file, 'utf8');
  const codeRoot = expandPath(quotedValue(src, 'CODE_ROOT') ?? process.cwd());
  const apiPreset = (quotedValue(src, 'API_PRESET') ?? '').trim();

  const servers = extractArrayBlock(src, 'SERVERS').map((line) => {
    const [id, label, host, user, password, roles] = parseLine(line);
    return {
      id,
      label,
      host,
      user,
      password,
      roles: (roles ?? '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean),
    };
  });

  const services = extractArrayBlock(src, 'SERVICES').map((line) => parseService(line, apiPreset));

  if (!servers.length) {
    throw new Error(`配置没有 SERVERS: ${file}`);
  }
  if (!services.length) {
    throw new Error(`配置没有 SERVICES: ${file}`);
  }

  return { codeRoot, servers, services, configPath: file, demo, apiPreset };
}

export function resolveRemoteMap(map: string, serverId: string): string | undefined {
  for (const pair of map.split(';;')) {
    const idx = pair.indexOf(':');
    if (idx < 0) continue;
    const id = pair.slice(0, idx);
    const p = pair.slice(idx + 1);
    if (id === serverId) return p;
  }
  return undefined;
}

export function webReleaseName(service: Service): string {
  return service.remoteReleaseName || path.basename(service.artifactDir || 'dist');
}

export function apiRemoteSubdir(service: Service): string {
  if (!service.remoteSubdir) {
    throw new Error(`服务 ${service.id} 未配置 remoteSubdir`);
  }
  return service.remoteSubdir;
}

/** 展示用远端目录 */
export function describeRemote(service: Service, serverId: string): string {
  const base = resolveRemoteMap(service.remoteMap, serverId);
  if (!base) return '(未配置远端路径)';
  const root = base.replace(/\/$/, '');
  if (service.kind === 'web') return `${root}/${webReleaseName(service)}`;
  return `${root}/${apiRemoteSubdir(service)}`;
}
