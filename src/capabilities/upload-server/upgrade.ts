import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findUserConfig, packageRoot } from './config.js';
import { chooseInitTarget, emptyConfigJson, ensureUserConfig } from './init.js';

/** Written as `configVersion` in JSON. */
export const CONFIG_SCHEMA_VERSION = 1;

const DEPRECATED_TOP_KEYS = new Set(['apiPreset', 'roles', 'type', 'id']);

function shanghaiStamp(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
}

function backupDir(): string {
  return path.join(os.homedir(), '.cache', 'cmd-tools', 'backup');
}

/** Copy user config to ~/.cache/cmd-tools/backup/upload-server-YYYYMMDD-HHmmss.json (Asia/Shanghai). */
export function backupUserConfig(configPath: string): string {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `upload-server-${shanghaiStamp()}.json`);
  fs.copyFileSync(configPath, dest);
  return dest;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function migrateAfter(raw: unknown): Array<{ label: string; run: string }> | undefined {
  if (raw == null) return undefined;
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  const out: Array<{ label: string; run: string }> = [];
  for (const item of items) {
    if (typeof item === 'string') {
      const run = item.trim();
      if (run) out.push({ label: '发布后', run });
      continue;
    }
    if (isPlainObject(item)) {
      const label = String(item.label ?? '').trim() || '发布后';
      const run = String(item.run ?? '').trim();
      if (run) out.push({ label, run });
    }
  }
  return out.length ? out : undefined;
}

function migratePackage(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const name = String(raw.name ?? raw.label ?? raw.id ?? '').trim();
  const dir = String(raw.dir ?? raw.project ?? '').trim();
  if (!name && !dir) return null;

  const destSrc = (raw.dest ?? raw.remote) as unknown;
  let dest: Record<string, string> | undefined;
  if (isPlainObject(destSrc)) {
    dest = {};
    for (const [k, v] of Object.entries(destSrc)) {
      if (typeof v === 'string' && k.trim() && v.trim()) {
        dest[k.trim()] = v.trim().replace(/\/$/, '');
      }
    }
    if (!Object.keys(dest).length) dest = undefined;
  }

  const pkg: Record<string, unknown> = {
    name: name || dir || 'unnamed',
    dir: dir || name || '.',
  };
  if (typeof raw.build === 'string' && raw.build.trim()) pkg.build = raw.build.trim();
  const outDir = String(raw.outDir ?? raw.artifactDir ?? '').trim();
  if (outDir) pkg.outDir = outDir;
  const releaseName = String(raw.releaseName ?? raw.remoteReleaseName ?? '').trim();
  if (releaseName) pkg.releaseName = releaseName;
  if (typeof raw.jar === 'string' && raw.jar.trim()) pkg.jar = raw.jar.trim();
  if (typeof raw.module === 'string' && raw.module.trim()) pkg.module = raw.module.trim();
  if (dest) pkg.dest = dest;
  const after = migrateAfter(raw.after);
  if (after) pkg.after = after;
  return pkg;
}

function migrateServer(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const name = String(raw.name ?? raw.label ?? raw.id ?? '').trim();
  const host = String(raw.host ?? '').trim();
  if (!name && !host) return null;
  let port = 22;
  if (raw.port !== undefined && raw.port !== null && String(raw.port).trim() !== '') {
    const n = Number(raw.port);
    if (Number.isInteger(n) && n > 0 && n <= 65535) port = n;
  }
  const server: Record<string, unknown> = {
    name: name || host || 'server',
    host: host || '127.0.0.1',
    port,
    user: String(raw.user ?? '').trim(),
    password: typeof raw.password === 'string' ? raw.password : '',
  };
  return server;
}

/**
 * Normalize legacy upload-server.json → current schema.
 * Preserves passwords / hosts / paths / build / dest / after content.
 */
export function migrateConfig(raw: unknown): Record<string, unknown> {
  const src = isPlainObject(raw) ? raw : {};

  const rootPath = String(src.rootPath ?? src.codeRoot ?? '').trim();

  const serversRaw = Array.isArray(src.servers) ? src.servers : [];
  const servers = serversRaw.map(migrateServer).filter(Boolean) as Record<string, unknown>[];

  let groups: Array<{ name: string; packages: Record<string, unknown>[] }>;
  if (Array.isArray(src.groups) && src.groups.length > 0) {
    groups = src.groups.map((g, i) => {
      const go = isPlainObject(g) ? g : {};
      const gname = String(go.name ?? '').trim() || `group-${i + 1}`;
      const list = Array.isArray(go.packages) ? go.packages : [];
      const packages = list.map(migratePackage).filter(Boolean) as Record<string, unknown>[];
      return { name: gname, packages };
    });
  } else {
    const flat = Array.isArray(src.packages)
      ? src.packages
      : Array.isArray(src.services)
        ? src.services
        : [];
    if (flat.length) {
      groups = [
        {
          name: 'default',
          packages: flat.map(migratePackage).filter(Boolean) as Record<string, unknown>[],
        },
      ];
    } else {
      groups = [];
    }
  }

  const out: Record<string, unknown> = {
    configVersion: CONFIG_SCHEMA_VERSION,
    rootPath,
    servers,
    groups,
  };

  // Do not copy deprecated top-level keys (apiPreset, roles, type, id, codeRoot, packages, services).
  for (const key of Object.keys(src)) {
    if (DEPRECATED_TOP_KEYS.has(key)) continue;
    if (key === 'codeRoot' || key === 'packages' || key === 'services' || key === 'configVersion') {
      continue;
    }
    // Already handled
    if (key === 'rootPath' || key === 'servers' || key === 'groups') continue;
    // Preserve unknown non-deprecated extras carefully — prefer strip of known junk only.
    // Spec: strip unknown deprecated keys; keep current shape fields only.
  }

  return out;
}

function summarizeMigration(before: unknown, after: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const b = isPlainObject(before) ? before : {};
  if ('codeRoot' in b && !('rootPath' in b && String(b.rootPath ?? '').trim())) {
    lines.push('codeRoot → rootPath');
  } else if ('codeRoot' in b) {
    lines.push('移除 deprecated codeRoot（已有 rootPath）');
  }
  if (!Array.isArray(b.groups) || !(b.groups as unknown[]).length) {
    if (Array.isArray(b.packages) || Array.isArray(b.services)) {
      lines.push('扁平 packages/services → groups[{ name: "default", packages }]');
    }
  }
  const samplePkg =
    (Array.isArray(b.packages) && b.packages[0]) ||
    (Array.isArray(b.services) && b.services[0]) ||
    (Array.isArray(b.groups) &&
      isPlainObject(b.groups[0]) &&
      Array.isArray((b.groups[0] as Record<string, unknown>).packages) &&
      ((b.groups[0] as Record<string, unknown>).packages as unknown[])[0]);
  if (isPlainObject(samplePkg)) {
    if ('id' in samplePkg || 'label' in samplePkg) lines.push('package id/label → name');
    if ('project' in samplePkg) lines.push('project → dir');
    if ('artifactDir' in samplePkg) lines.push('artifactDir → outDir');
    if ('remote' in samplePkg) lines.push('remote → dest');
    if (typeof samplePkg.after === 'string' || (Array.isArray(samplePkg.after) && samplePkg.after.some((x) => typeof x === 'string'))) {
      lines.push('after: string|string[] → [{ label: "发布后", run }]');
    }
  }
  if (Array.isArray(b.servers) && b.servers.some((s) => isPlainObject(s) && ('id' in s || 'label' in s))) {
    lines.push('servers id/label → name；port 默认 22');
  }
  for (const k of DEPRECATED_TOP_KEYS) {
    if (k in b) lines.push(`剥离顶层 deprecated: ${k}`);
  }
  lines.push(`configVersion → ${after.configVersion}`);
  const gCount = Array.isArray(after.groups) ? after.groups.length : 0;
  const sCount = Array.isArray(after.servers) ? after.servers.length : 0;
  const pCount = Array.isArray(after.groups)
    ? (after.groups as Array<{ packages?: unknown[] }>).reduce(
        (n, g) => n + (Array.isArray(g.packages) ? g.packages.length : 0),
        0,
      )
    : 0;
  lines.push(`结果: servers=${sCount}, groups=${gCount}, packages=${pCount}`);
  return lines;
}

function isNonEmptyConfigFile(file: string): boolean {
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    if (!text || text === '{}' || text === 'null') return false;
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (!isPlainObject(raw)) return Boolean(text);
    const root = String(raw.rootPath ?? raw.codeRoot ?? '').trim();
    const servers = Array.isArray(raw.servers) ? raw.servers : [];
    const groups = Array.isArray(raw.groups) ? raw.groups : [];
    const packages = Array.isArray(raw.packages) ? raw.packages : [];
    const services = Array.isArray(raw.services) ? raw.services : [];
    return Boolean(root || servers.length || groups.length || packages.length || services.length);
  } catch {
    return true; // treat unreadable/non-json as worth backing up
  }
}

function runCmd(cmd: string, cwd: string): { ok: boolean; status: number | null; output: string } {
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: 'utf8',
    env: process.env,
  });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  return { ok: r.status === 0, status: r.status, output };
}

export function printUpgradeHelp(): void {
  console.log(`升级控制中心（别人更新代码时用）

本机 upload-server.json 已 gitignore，git pull 一般不会覆盖。
仍建议显式升级，避免字段结构变更导致配置失效：

  pnpm start -- /upgrade
  # 或
  pnpm start -- upgrade

步骤：备份配置 → git pull --ff-only → pnpm install + build → 字段迁回新结构

备份目录：~/.cache/cmd-tools/backup/upload-server-YYYYMMDD-HHmmss.json
（时间戳为 Asia/Shanghai）
`);
}

export function runUpgrade(opts?: { skipGit?: boolean; configPath?: string }): number {
  const root = packageRoot();
  console.log('══ 升级控制中心 ══');
  console.log(`包目录: ${root}`);

  // 1. Resolve / ensure user config
  let configPath = findUserConfig(opts?.configPath);
  if (!configPath) {
    const ensured = ensureUserConfig({ configPath: opts?.configPath });
    configPath = ensured.file;
    console.log(
      ensured.created
        ? `未找到配置，已创建空骨架: ${configPath}`
        : `配置路径: ${configPath}`,
    );
  } else {
    console.log(`配置路径: ${configPath}`);
  }
  // If explicit path was given but file missing, chooseInitTarget + ensure
  if (opts?.configPath?.trim() && !fs.existsSync(configPath)) {
    const { file } = chooseInitTarget(opts.configPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, emptyConfigJson(), 'utf8');
    configPath = file;
    console.log(`已确保配置存在: ${configPath}`);
  }

  // 2. Backup if file exists
  let backupPath: string | undefined;
  if (fs.existsSync(configPath)) {
    const nonempty = isNonEmptyConfigFile(configPath);
    backupPath = backupUserConfig(configPath);
    console.log(`备份${nonempty ? '' : '（空/骨架）'}: ${backupPath}`);
  } else {
    console.log('配置文件尚不存在，跳过备份');
  }

  // 3. git pull
  let pullOk = true;
  let pullMsg = '跳过 git（skipGit）';
  if (!opts?.skipGit) {
    console.log('执行: git pull --ff-only …');
    let r = runCmd('git pull --ff-only', root);
    if (!r.ok) {
      console.log('ff-only 失败，尝试 git pull …');
      r = runCmd('git pull', root);
    }
    pullOk = r.ok;
    pullMsg = r.ok ? (r.output || '已是最新 / pull 成功') : r.output || `pull 失败 (exit ${r.status})`;
    console.log(pullOk ? `pull 结果: 成功\n${pullMsg}` : `pull 结果: 失败\n${pullMsg}`);
    if (!pullOk) {
      console.error('git pull 失败：保留备份，中止写入迁移后的配置（可用 skipGit 仅迁移）。');
      if (backupPath) console.error(`备份仍在: ${backupPath}`);
      return 1;
    }
  } else {
    console.log(pullMsg);
  }

  // 4. pnpm install + build
  console.log('执行: pnpm install …');
  const inst = runCmd('pnpm install', root);
  if (!inst.ok) {
    console.error(`pnpm install 失败:\n${inst.output}`);
    if (backupPath) console.error(`备份仍在: ${backupPath}`);
    return 1;
  }
  console.log('执行: pnpm build …');
  const build = runCmd('pnpm build', root);
  if (!build.ok) {
    console.error(`pnpm build 失败:\n${build.output}`);
    if (backupPath) console.error(`备份仍在: ${backupPath}`);
    return 1;
  }
  console.log('install + build: 成功');

  // 5. Read backup (or current), migrate, write
  const sourcePath = backupPath && fs.existsSync(backupPath) ? backupPath : configPath;
  let raw: unknown = {};
  try {
    raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  } catch (e) {
    console.error(`无法读取配置 JSON: ${sourcePath}\n${e instanceof Error ? e.message : e}`);
    if (backupPath) console.error(`备份仍在: ${backupPath}`);
    return 1;
  }
  const migrated = migrateConfig(raw);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(migrated, null, 2)}\n`, 'utf8');

  // 6. Summary
  const summary = summarizeMigration(raw, migrated);
  console.log('');
  console.log('── 升级完成 ──');
  console.log(`备份路径: ${backupPath ?? '(无)'}`);
  console.log(`pull 结果: ${opts?.skipGit ? '跳过' : pullOk ? '成功' : '失败'}`);
  console.log('迁移字段摘要:');
  for (const line of summary) console.log(`  · ${line}`);
  console.log(`配置路径: ${configPath}`);
  console.log('');
  return 0;
}
