import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('dist/cli.js')) {
  const r = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], {
    stdio: 'inherit',
    shell: true,
  });
  if (r.status) process.exit(r.status ?? 1);
}

const args = process.argv.slice(2);
const r = spawnSync(process.execPath, ['dist/cli.js', ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);
