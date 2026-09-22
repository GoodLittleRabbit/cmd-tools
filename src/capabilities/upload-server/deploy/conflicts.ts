import { describeDest, resolveDest, type Package } from '../config.js';

export type DeployConflict = {
  /** 短标签，如「远端路径重复」 */
  kind: string;
  /** 给人看的完整说明 */
  message: string;
};

function normalizeRemotePath(p: string): string {
  return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

/** a 是否等于 b，或互为父子目录（并行发版会互相覆盖/删目录） */
function pathsOverlap(a: string, b: string): boolean {
  const x = normalizeRemotePath(a);
  const y = normalizeRemotePath(b);
  if (x === y) return true;
  return x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

/**
 * 扫描本次勾选的 packages 在目标服务器上的并行安全边界。
 * 命中则应在确认页警告，由使用者明确确认后再发。
 */
export function findDeployConflicts(packages: Package[], serverName: string): DeployConflict[] {
  const conflicts: DeployConflict[] = [];
  if (packages.length < 2) return conflicts;

  // —— 远端最终路径重叠（web 含 release 子目录；api 为 dest 本身）——
  const destEntries: Array<{ name: string; dest: string }> = [];
  for (const pkg of packages) {
    const raw = resolveDest(pkg, serverName)?.trim();
    if (!raw) {
      conflicts.push({
        kind: '缺少 dest',
        message: `「${pkg.name}」未配置服务器「${serverName}」的 dest`,
      });
      continue;
    }
    const finalPath = describeDest(pkg, serverName);
    if (finalPath.startsWith('(')) continue;
    destEntries.push({ name: pkg.name, dest: normalizeRemotePath(finalPath) });
  }
  for (let i = 0; i < destEntries.length; i++) {
    for (let j = i + 1; j < destEntries.length; j++) {
      const a = destEntries[i]!;
      const b = destEntries[j]!;
      if (!pathsOverlap(a.dest, b.dest)) continue;
      const same = normalizeRemotePath(a.dest) === normalizeRemotePath(b.dest);
      conflicts.push({
        kind: same ? '远端路径重复' : '远端路径嵌套',
        message: same
          ? `「${a.name}」与「${b.name}」写到同一目录 ${a.dest}（并行会互相覆盖）`
          : `「${a.name}」(${a.dest}) 与「${b.name}」(${b.dest}) 存在包含关系（并行可能互相踩目录）`,
      });
    }
  }

  // —— 本地 dir 重复 ——
  const byDir = new Map<string, string[]>();
  for (const pkg of packages) {
    const key = pkg.dir.replace(/\/+$/, '') || '.';
    const list = byDir.get(key) ?? [];
    list.push(pkg.name);
    byDir.set(key, list);
  }
  for (const [dir, names] of byDir) {
    if (names.length < 2) continue;
    conflicts.push({
      kind: '本地目录重复',
      message: `${names.map((n) => `「${n}」`).join('、')} 共用本地 dir「${dir}」（并行构建会抢同一工作区）`,
    });
  }

  // —— 同名 package（配置异常）——
  const byName = new Map<string, number>();
  for (const pkg of packages) {
    byName.set(pkg.name, (byName.get(pkg.name) ?? 0) + 1);
  }
  for (const [name, count] of byName) {
    if (count < 2) continue;
    conflicts.push({
      kind: '名称重复',
      message: `勾选列表里出现 ${count} 个同名「${name}」`,
    });
  }

  // —— 相同 after 命令（多半是复制粘贴到了多个包）——
  type AfterHit = { pkg: string; label: string };
  const byRun = new Map<string, AfterHit[]>();
  for (const pkg of packages) {
    for (const step of pkg.after ?? []) {
      const run = step.run.trim();
      if (!run) continue;
      const list = byRun.get(run) ?? [];
      list.push({ pkg: pkg.name, label: step.label });
      byRun.set(run, list);
    }
  }
  for (const [run, hits] of byRun) {
    const pkgs = [...new Set(hits.map((h) => h.pkg))];
    if (pkgs.length < 2) continue;
    const labels = [...new Set(hits.map((h) => h.label))].join(' / ');
    const preview = run.length > 72 ? `${run.slice(0, 72)}…` : run;
    conflicts.push({
      kind: 'after 命令相同',
      message: `${pkgs.map((n) => `「${n}」`).join('、')} 的钩子「${labels}」执行同一条命令（并行可能重复操作同一容器）：${preview}`,
    });
  }

  return conflicts;
}
