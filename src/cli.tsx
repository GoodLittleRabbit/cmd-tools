#!/usr/bin/env node
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';
import {
  ensureUserConfig,
  isEmptyUserConfig,
  runInit,
} from './capabilities/upload-server/init.js';
import { printLastFailLog } from './capabilities/upload-server/deploy/logFile.js';
import { UploadWizard } from './capabilities/upload-server/UploadWizard.js';

const cli = meow(
  `
  用法
    $ cmd-tools
    $ cmd-tools /log
    $ cmd-tools log
    $ cmd-tools upload-server --init
    $ cmd-tools upload-server --dry-run
    $ cmd-tools upload-server [options]

  Options
    --init              生成空配置（配置为空时首页会显示给 AI 的用法）
    --force             与 --init 合用：覆盖已有配置为空骨架
    --dry-run, -n       演练（不上传）
    --server, -s        服务器 name
    --packages, -p      package name，逗号分隔
    --config, -c        配置文件路径

  命令
    /log, log           打印上次发版失败日志（~/.cache/cmd-tools/logs/upload-server-last-fail.log）
`,
  {
    importMeta: import.meta,
    flags: {
      init: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      dryRun: { type: 'boolean', shortFlag: 'n', default: false },
      server: { type: 'string', shortFlag: 's' },
      packages: { type: 'string', shortFlag: 'p' },
      config: { type: 'string', shortFlag: 'c' },
    },
  },
);

/** 缺配置则自动创建空文件；说明文案交给 Ink 首页，避免终端刷屏 */
function autoEnsureConfig(): string {
  const { file, created } = ensureUserConfig({ configPath: cli.flags.config });
  if (created) {
    console.log(`已创建空配置: ${file}`);
  }
  return file;
}

function isLogCommand(cmd: string | undefined): boolean {
  if (!cmd) return false;
  const c = cmd.trim().toLowerCase();
  return c === 'log' || c === '/log';
}

async function main() {
  const cmd = cli.input[0];

  if (isLogCommand(cmd)) {
    process.exit(printLastFailLog());
  }

  if (!cmd) {
    const configPath = autoEnsureConfig();
    render(<App dryRun={cli.flags.dryRun} configPath={configPath} />);
    return;
  }

  if (cmd !== 'upload-server' && cmd !== 'deploy') {
    console.error(`未知命令: ${cmd}（可用: upload-server · /log）`);
    cli.showHelp(1);
    return;
  }

  if (cli.flags.init) {
    process.exit(runInit({ force: cli.flags.force, configPath: cli.flags.config }));
  }

  const configPath = autoEnsureConfig();

  const packageNames = cli.flags.packages
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (isEmptyUserConfig(configPath) && !cli.flags.server && !packageNames?.length) {
    render(<App dryRun={cli.flags.dryRun} configPath={configPath} />);
    return;
  }

  render(
    <UploadWizard
      dryRun={cli.flags.dryRun}
      serverName={cli.flags.server}
      packageNames={packageNames}
      configPath={configPath}
    />,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
