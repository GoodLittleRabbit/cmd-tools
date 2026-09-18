#!/usr/bin/env node
/**
 * Non-interactive deploy entry for the Ratatui UI.
 * Usage:
 *   tsx src/capabilities/upload-server/engine.ts \
 *     --config path --server name --packages a,b [--dry-run]
 */
import { loadConfig, findUserConfig } from './config.js';
import { runDeploy } from './deploy/run.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('-')) {
    return process.argv[i + 1];
  }
  const pref = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const dryRun = has('--dry-run') || has('-n');
  const configPath = arg('--config') || arg('-c');
  const serverId = arg('--server') || arg('-s');
  const packagesArg = arg('--packages') || arg('-p');
  const groupsArg = arg('--groups') || arg('-g');

  if (!serverId || !packagesArg) {
    console.error('usage: engine --server <id> --packages <name,name> [--config path] [--dry-run]');
    process.exit(2);
  }

  if (!dryRun && !findUserConfig(configPath)) {
    console.error('missing user config; run with --dry-run or create config/upload-server.json');
    process.exit(1);
  }

  const config = loadConfig(configPath);
  const server = config.servers.find((s) => s.name === serverId);
  if (!server) {
    console.error(`unknown server name: ${serverId}`);
    process.exit(1);
  }
  let packages = config.packages;
  if (groupsArg) {
    const gnames = groupsArg.split(',').map((s) => s.trim()).filter(Boolean);
    packages = config.groups.filter((g) => gnames.includes(g.name)).flatMap((g) => g.packages);
    if (!packages.length) {
      console.error(`no groups matched: ${groupsArg}`);
      process.exit(1);
    }
  } else if (packagesArg) {
    const ids = packagesArg.split(',').map((s) => s.trim()).filter(Boolean);
    packages = config.packages.filter((s) => ids.includes(s.name));
    if (!packages.length) {
      console.error(`no packages matched: ${packagesArg}`);
      process.exit(1);
    }
  }

  const ok = await runDeploy({
    rootPath: config.rootPath,
    server,
    packages,
    dryRun,
    emit: (ev) => {
      if (ev.type === 'log') console.log(ev.line);
      else if (ev.type === 'pkg-start') {
        console.log(`[${ev.index + 1}/${ev.total}] ${ev.label || ev.packageId}`);
      } else if (ev.type === 'step') {
        console.log(`  ${ev.packageId} · ${ev.step} · ${ev.status}`);
      } else if (ev.type === 'pkg-done') {
        console.log(ev.ok ? `  ✓ ${ev.packageId}` : `  ✗ ${ev.packageId}${ev.error ? ' — ' + ev.error : ''}`);
      } else if (ev.type === 'done') {
        console.log(ev.ok ? 'DONE' : 'FAIL');
      }
    },
  });
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
