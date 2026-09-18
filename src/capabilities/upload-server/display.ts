import type { Package } from './config.js';

/** 列表主标题：本地目录名 dir */
export function packageTitle(pkg: Package): string {
  return pkg.dir?.trim() || pkg.name || '';
}

export function packageOptionLabel(pkg: Package): string {
  const title = packageTitle(pkg);
  const extras: string[] = [];
  if (pkg.name && pkg.name !== title) extras.push(pkg.name);
  return extras.length ? `${title}  ·  ${extras.join(' · ')}` : title;
}
