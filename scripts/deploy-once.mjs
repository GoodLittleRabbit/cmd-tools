import { loadConfig, resolveDest } from '../dist/capabilities/upload-server/config.js';
import { runDeploy } from '../dist/capabilities/upload-server/deploy/run.js';
import { openDeployLogFile } from '../dist/capabilities/upload-server/deploy/logFile.js';

const serverName = process.argv[2] || '测试 251';
const packageNames = (process.argv[3] || 'admin').split(',').map((s) => s.trim()).filter(Boolean);
const config = loadConfig();
const server = config.servers.find((s) => s.name === serverName);
if (!server) {
  console.error('server not found', serverName);
  process.exit(1);
}
const packages = config.packages.filter(
  (p) => packageNames.includes(p.name) && Boolean(resolveDest(p, server.name)),
);
if (!packages.length) {
  console.error('no packages matched', packageNames);
  process.exit(1);
}
const logFile = openDeployLogFile('upload-server');
logFile.append(`server ${server.name} · ${server.user}@${server.host}`);
logFile.append(`packages ${packages.map((x) => x.name).join(', ')}`);
logFile.append('mode=real');
console.log(`deploying ${packages.map((p) => p.name).join(',')} → ${server.name}`);
const ok = await runDeploy({
  rootPath: config.rootPath,
  server,
  packages,
  dryRun: false,
  emit: (ev) => {
    if (ev.type === 'log') {
      console.log(ev.line);
      logFile.append(ev.line);
    } else if (ev.type === 'step') {
      const line = `  ${ev.packageId} · ${ev.step} · ${ev.status}`;
      console.log(line);
      logFile.append(line);
    } else if (ev.type === 'progress') {
      console.log(`  [${ev.packageId}] ${ev.message}`);
    } else if (ev.type === 'pkg-start') {
      console.log(`start ${ev.label || ev.packageId}`);
      logFile.append(`start ${ev.label || ev.packageId}`);
    } else if (ev.type === 'pkg-done') {
      const line = ev.ok ? `  ✓ ${ev.packageId}` : `  ✗ ${ev.packageId} — ${ev.error || 'fail'}`;
      console.log(line);
      logFile.append(line);
    }
  },
});
console.log(ok ? 'DONE' : 'FAIL');
logFile.append(ok ? 'DONE' : 'FAIL');
process.exit(ok ? 0 : 1);
