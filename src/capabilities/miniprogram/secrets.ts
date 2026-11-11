import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandPath, packageRoot } from './config.js';

export function secretFileName(appid: string): string {
  return `private.${appid}.key`;
}

/** 包内约定路径：config/secrets/miniprogram/private.<appid>.key */
export function packageSecretPath(appid: string): string {
  return path.join(packageRoot(), 'config', 'secrets', 'miniprogram', secretFileName(appid));
}

/** 用户配置目录回退：~/.config/cmd-tools/secrets/miniprogram/private.<appid>.key */
export function xdgSecretPath(appid: string): string {
  const base = process.env.XDG_CONFIG_HOME?.trim()
    ? expandPath(process.env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), '.config');
  return path.join(base, 'cmd-tools', 'secrets', 'miniprogram', secretFileName(appid));
}

function isFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 只检查文件是否存在，不读取内容。找到后权限保持 600。 */
export function findPrivateKeyPath(appid: string): string | undefined {
  for (const p of [packageSecretPath(appid), xdgSecretPath(appid)]) {
    if (!isFile(p)) continue;
    try {
      const mode = fs.statSync(p).mode & 0o777;
      if (mode !== 0o600) fs.chmodSync(p, 0o600);
    } catch {
      /* 权限调整失败不阻止使用已有密钥 */
    }
    return p;
  }
  return undefined;
}

export function missingKeyMessage(appid: string): string {
  return [
    `未找到小程序 ${appid} 的上传密钥。`,
    `请将微信公众平台下载的私钥放到:`,
    `  ${packageSecretPath(appid)}`,
    `或回退位置:`,
    `  ${xdgSecretPath(appid)}`,
    '文件名须为 private.<appid>.key；不要把密钥内容写入配置或提交 git。',
  ].join('\n');
}
