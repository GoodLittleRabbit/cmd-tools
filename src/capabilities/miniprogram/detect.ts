import fs from 'node:fs';
import path from 'node:path';
import type { MiniProgramAction } from './config.js';

/** 生产构建目录（upload 优先） */
export const PROD_PROJECT_RELS = ['dist/build/mp-weixin', 'unpackage/dist/build/mp-weixin'] as const;
/** 开发构建目录（preview 可用） */
export const DEV_PROJECT_RELS = ['dist/dev/mp-weixin', 'unpackage/dist/dev/mp-weixin'] as const;

export type DetectedPath = {
  abs: string;
  rel: string;
  kind: 'prod' | 'dev' | 'root' | 'configured';
};

function isFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function hasProjectConfig(dir: string): boolean {
  return isFile(path.join(dir, 'project.config.json'));
}

function kindOf(rel: string): 'prod' | 'dev' | 'root' {
  if ((PROD_PROJECT_RELS as readonly string[]).includes(rel)) return 'prod';
  if ((DEV_PROJECT_RELS as readonly string[]).includes(rel)) return 'dev';
  return 'root';
}

function probe(appDir: string, rel: string): DetectedPath | undefined {
  const abs = rel === '.' ? appDir : path.join(appDir, rel);
  if (!hasProjectConfig(abs)) return undefined;
  return { abs, rel, kind: kindOf(rel) };
}

/**
 * 在 dir 下找含 project.config.json 的微信工程目录。
 * upload 先看生产构建目录，preview 先看 dev，再回退到另一侧，最后才是 dir 本身。
 */
export function detectProjectPath(appDir: string, action: MiniProgramAction): DetectedPath | undefined {
  const order =
    action === 'upload'
      ? [...PROD_PROJECT_RELS, ...DEV_PROJECT_RELS]
      : [...DEV_PROJECT_RELS, ...PROD_PROJECT_RELS];
  for (const rel of order) {
    const hit = probe(appDir, rel);
    if (hit) return hit;
  }
  return probe(appDir, '.');
}

/** 构建后按 uni-app / 常见打包约定期望出现的目录 */
export function expectedProjectRel(action: MiniProgramAction): string {
  return action === 'upload' ? PROD_PROJECT_RELS[0] : DEV_PROJECT_RELS[0];
}

export function resolveConfiguredProjectPath(appDir: string, configured: string): DetectedPath {
  const abs = path.isAbsolute(configured) ? configured : path.resolve(appDir, configured);
  const rel = path.relative(appDir, abs) || '.';
  return { abs, rel, kind: 'configured' };
}

export function detectBuildCommand(appDir: string): string | undefined {
  const pkgFile = path.join(appDir, 'package.json');
  if (!isFile(pkgFile)) return undefined;
  let scripts: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, unknown> };
    scripts = raw.scripts ?? {};
  } catch {
    return undefined;
  }
  const name = typeof scripts['build:mp-weixin'] === 'string'
    ? 'build:mp-weixin'
    : typeof scripts.build === 'string'
      ? 'build'
      : undefined;
  if (!name) return undefined;
  const runner = isFile(path.join(appDir, 'pnpm-lock.yaml')) || isFile(path.join(appDir, 'pnpm-workspace.yaml'))
    ? 'pnpm'
    : isFile(path.join(appDir, 'yarn.lock'))
      ? 'yarn'
      : 'npm run';
  return runner === 'npm run' ? `npm run ${name}` : `${runner} ${name}`;
}

export function readPackageVersion(appDir: string): string | undefined {
  const pkgFile = path.join(appDir, 'package.json');
  if (!isFile(pkgFile)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { version?: unknown };
    const v = typeof raw.version === 'string' ? raw.version.trim() : '';
    return v || undefined;
  } catch {
    return undefined;
  }
}

/** 从 src/manifest.json（或 manifest.json）读 versionName，忽略注释 */
export function readManifestVersion(appDir: string): string | undefined {
  for (const rel of ['src/manifest.json', 'manifest.json']) {
    const file = path.join(appDir, rel);
    if (!isFile(file)) continue;
    try {
      const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const raw = JSON.parse(text) as { versionName?: unknown };
      const v = typeof raw.versionName === 'string' ? raw.versionName.trim() : '';
      if (v) return v;
    } catch {
      /* 下一处 */
    }
  }
  return undefined;
}

export function isLikelyAppDir(appDir: string): boolean {
  return isDir(appDir);
}
