import fs from 'node:fs';
import path from 'node:path';
import type { Package } from './config.js';

export type DetectedBuild = {
  mode: 'web' | 'api';
  build: string;
  /** web */
  outDir?: string;
  /** api */
  jar?: string;
  module?: string;
  reason: string;
};

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}


function stringMap(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function exists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function detectWeb(projectDir: string): DetectedBuild | undefined {
  const pkgFile = path.join(projectDir, 'package.json');
  if (!exists(pkgFile)) return undefined;
  const pkg = readJson(pkgFile) ?? {};
  const deps = { ...stringMap(pkg.dependencies), ...stringMap(pkg.devDependencies) };
  const scripts = stringMap(pkg.scripts);

  const isVue = Boolean(deps.vue || deps['vue-router'] || deps.vite);
  const isReact = Boolean(deps.react || deps['react-dom']);
  const isNext = Boolean(deps.next);
  const isVite = Boolean(deps.vite) || exists(path.join(projectDir, 'vite.config.ts')) || exists(path.join(projectDir, 'vite.config.js'));
  const isCra = Boolean(deps['react-scripts']);

  let build = '';
  if (typeof scripts['build-prod'] === 'string') build = 'pnpm build-prod';
  else if (typeof scripts['build:prod'] === 'string') build = 'pnpm build:prod';
  else if (typeof scripts.build === 'string') {
    build = exists(path.join(projectDir, 'pnpm-lock.yaml'))
      ? 'pnpm build'
      : exists(path.join(projectDir, 'yarn.lock'))
        ? 'yarn build'
        : exists(path.join(projectDir, 'bun.lockb'))
          ? 'bun run build'
          : 'npm run build';
  } else {
    return undefined;
  }

  // outDir candidates
  const candidates = [
    'dist',
    'build/dist-prod',
    'build/dist',
    'build',
    '.output/public',
    'out',
  ];
  // framework hints
  if (isNext) candidates.unshift('.next'); // not ideal for static export; still prefer out/dist if export
  if (isVite || isVue) candidates.unshift('dist');
  if (isCra || (isReact && !isVite)) candidates.unshift('build');

  // prefer existing dir after previous builds; else first framework default
  let outDir = candidates.find((c) => exists(path.join(projectDir, c)));
  if (!outDir) {
    if (isVite || isVue) outDir = 'dist';
    else if (isCra) outDir = 'build';
    else if (isReact) outDir = 'build';
    else outDir = 'dist';
  }

  const stack = [
    isNext && 'next',
    isVue && 'vue',
    isReact && 'react',
    isVite && 'vite',
    isCra && 'cra',
  ].filter(Boolean).join('+') || 'node';

  return {
    mode: 'web',
    build,
    outDir,
    reason: `探测到前端项目（${stack}），build=${build}，outDir=${outDir}`,
  };
}

function listMavenModules(projectDir: string): string[] {
  const modules: string[] = [];
  const walk = (dir: string, rel = '') => {
    const pom = path.join(dir, 'pom.xml');
    if (!exists(pom)) return;
    if (rel) modules.push(rel.replace(/\\/g, '/'));
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === 'target' || name === 'node_modules' || name.startsWith('.')) continue;
      const child = path.join(dir, name);
      try {
        if (fs.statSync(child).isDirectory()) walk(child, rel ? `${rel}/${name}` : name);
      } catch {
        /* ignore */
      }
    }
  };
  walk(projectDir);
  return modules;
}

function detectJarInModule(projectDir: string, moduleRel: string): string | undefined {
  const target = path.join(projectDir, moduleRel, 'target');
  if (!exists(target)) {
    // conventional path even before build
    const base = path.basename(moduleRel);
    return path.join(moduleRel, 'target', `${base}.jar`).replace(/\\/g, '/');
  }
  const jars = fs
    .readdirSync(target)
    .filter(
      (f) =>
        f.endsWith('.jar') &&
        !f.endsWith('-sources.jar') &&
        !f.endsWith('-javadoc.jar') &&
        !f.includes('-original'),
    );
  if (jars.length === 1) return path.join(moduleRel, 'target', jars[0]!).replace(/\\/g, '/');
  // prefer non-executable naming match module basename
  const base = path.basename(moduleRel);
  const hit = jars.find((j) => j.startsWith(base));
  if (hit) return path.join(moduleRel, 'target', hit).replace(/\\/g, '/');
  if (jars[0]) return path.join(moduleRel, 'target', jars[0]).replace(/\\/g, '/');
  return path.join(moduleRel, 'target', `${base}.jar`).replace(/\\/g, '/');
}

function detectApi(projectDir: string, packageName: string): DetectedBuild | undefined {
  const pom = path.join(projectDir, 'pom.xml');
  if (!exists(pom)) return undefined;

  const modules = listMavenModules(projectDir);
  const name = packageName.trim().toLowerCase();

  // match module by name heuristics
  const lower = (m: string) => m.toLowerCase();
  let module =
    modules.find((m) => lower(m).endsWith(`/${name}-server`)) ||
    modules.find((m) => lower(m).endsWith(`yudao-module-${name}-server`)) ||
    modules.find((m) => path.basename(m).toLowerCase() === `${name}-server`) ||
    modules.find((m) => path.basename(m).toLowerCase() === `yudao-module-${name}-server`) ||
    modules.find((m) => lower(m) === name) ||
    modules.find((m) => lower(m).endsWith(`/${name}`)) ||
    modules.find((m) => lower(m).includes(`module-${name}/`) && lower(m).endsWith('-server')) ||
    modules.find((m) => path.basename(m).toLowerCase() === `yudao-${name}`) ||
    modules.find((m) => path.basename(m).toLowerCase().includes(name) && lower(m).endsWith('-server')) ||
    modules.find((m) => path.basename(m).toLowerCase().includes(name));

  if (!module && name === 'gateway') {
    module =
      modules.find((m) => m.toLowerCase().includes('gateway')) ||
      modules.find((m) => path.basename(m).toLowerCase() === 'yudao-gateway');
  }

  if (!module) {
    // single-module project
    if (modules.length <= 1) {
      module = '';
    } else {
      return undefined;
    }
  }

  const jar = module
    ? detectJarInModule(projectDir, module)
    : detectJarInModule(projectDir, '.');
  if (!jar) return undefined;

  const pl = module || '.';
  // 芋道等项目默认 spring.boot.repackage.skip=true，需 -Pmicroservice 才打可执行 Boot jar
  const needsBootProfile = exists(path.join(projectDir, 'pom.xml'))
    && /<id>microservice<\/id>/.test(fs.readFileSync(path.join(projectDir, 'pom.xml'), 'utf8'));
  const bootFlag = needsBootProfile ? ' -Pmicroservice' : '';
  const build =
    pl === '.'
      ? `mvn -DskipTests${bootFlag} package`
      : `mvn -pl ${pl} -am -DskipTests${bootFlag} package`;

  return {
    mode: 'api',
    build,
    jar,
    module: pl === '.' ? '.' : pl,
    reason: `探测到 Maven 项目，module=${pl}，jar=${jar}`,
  };
}

/**
 * 根据本地目录自动补齐 build / outDir 或 jar+module。
 * 配置里已写的字段优先，不覆盖。
 */
export function resolvePackageBuild(rootPath: string, pkg: Package): Package & { detectReason?: string } {
  const projectDir = path.join(rootPath, pkg.dir);
  if (!exists(projectDir)) {
    throw new Error(`本地目录不存在: ${projectDir}`);
  }
  const build = pkg.build?.trim();
  if (!build) {
    throw new Error(`package "${pkg.name}" 缺少 build（请在配置里写该项目的打包命令）`);
  }

  const hasWeb = Boolean(pkg.outDir?.trim());
  const hasApi = Boolean(pkg.jar?.trim() && pkg.module?.trim());
  if (hasWeb || hasApi) {
    return { ...pkg, build, detectReason: '使用配置中的产物字段' };
  }

  const web = detectWeb(projectDir);
  const api = detectApi(projectDir, pkg.name);

  let picked: DetectedBuild | undefined;
  if (web && api) {
    const strongApi =
      api.module &&
      (api.module.toLowerCase().includes(pkg.name.toLowerCase()) ||
        path.basename(api.module).toLowerCase().includes(pkg.name.toLowerCase()));
    picked = strongApi ? api : web;
  } else {
    picked = web || api;
  }

  if (!picked) {
    throw new Error(
      `无法识别 ${pkg.dir} 的产物路径。请在配置中写明 outDir（前端）或 jar+module（Java）。build 已使用配置: ${build}`,
    );
  }

  return {
    ...pkg,
    build, // 始终用配置，不覆盖
    outDir: pkg.outDir ?? picked.outDir,
    jar: pkg.jar ?? picked.jar,
    module: pkg.module ?? picked.module,
    detectReason: `${picked.reason}；build 来自配置`,
  };
}

