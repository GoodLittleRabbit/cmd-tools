import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  buildOrShort: string;
  artifactOrMap: string;
  remoteMap: string;
};

function parseLine(line: string): string[] {
  return line.split('|').map((s) => s.trim());
}

function extractArrayBlock(src: string, name: string): string[] {
  const re = new RegExp(`${name}=\\(([\\s\\S]*?)\\n\\)`, 'm');
  const m = src.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

export function defaultConfigPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/capabilities/upload-server -> repo root
  const fromDist = path.resolve(here, '../../../config/upload-server.conf');
  if (fs.existsSync(fromDist) || fs.existsSync(fromDist.replace(/\.conf$/, '.example.conf'))) {
    return fromDist;
  }
  return path.resolve(process.cwd(), 'config/upload-server.conf');
}

export function loadConfig(configPath?: string): {
  codeRoot: string;
  servers: Server[];
  services: Service[];
  configPath: string;
} {
  const resolved = configPath ?? defaultConfigPath();
  const example = resolved.replace(/upload-server\.conf$/, 'upload-server.example.conf');
  const file = fs.existsSync(resolved) ? resolved : example;
  if (!fs.existsSync(file)) {
    throw new Error(`找不到配置: ${resolved}`);
  }
  const src = fs.readFileSync(file, 'utf8');
  const codeRootMatch = src.match(/CODE_ROOT="([^"]+)"/);
  const codeRoot = codeRootMatch?.[1] ?? process.cwd();

  const servers = extractArrayBlock(src, 'SERVERS').map((line) => {
    const [id, label, host, user, password, roles] = parseLine(line);
    return {
      id,
      label,
      host,
      user,
      password,
      roles: (roles ?? '').split(',').map((r) => r.trim()).filter(Boolean),
    };
  });

  const services = extractArrayBlock(src, 'SERVICES').map((line) => {
    const parts = parseLine(line);
    const kind = parts[2] as 'web' | 'api';
    if (kind === 'web') {
      const [id, label, , projectRel, buildOrShort, artifactOrMap, remoteMap] = parts;
      return { id, label, kind, projectRel, buildOrShort, artifactOrMap, remoteMap };
    }
    const [id, label, , projectRel, buildOrShort, remoteMap] = parts;
    return {
      id,
      label,
      kind,
      projectRel,
      buildOrShort,
      artifactOrMap: '',
      remoteMap,
    };
  });

  return { codeRoot, servers, services, configPath: file };
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
