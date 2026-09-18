#!/usr/bin/env node
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';
import { isEmptyConfigFile } from './capabilities/upload-server/config.js';
import {
  emptyConfigHint,
  ensureUserConfig,
  nextStepHint,
  runInit,
} from './capabilities/upload-server/init.js';
import { UploadWizard } from './capabilities/upload-server/UploadWizard.js';

const cli = meow(
  `
  用法
    $ cmd-tools
    $ cmd-tools upload-server --init
    $ cmd-tools upload-server --dry-run
    $ cmd-tools upload-server [options]

  Options
    --init              生成空的 upload-server.json（不复制 example）
    --force             与 --init 合用：覆盖已有配置为空骨架
    --dry-run, -n       演练（不上传）
    --server, -s        服务器 name
    --packages, -p      package name，逗号分隔
    --config, -c        配置文件路径
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

function autoEnsureConfig(): void {
  const { file, created } = ensureUserConfig({ configPath: cli.flags.config });
  if (created) {
    console.log(`已创建空配置: ${file}`);
    console.log(nextStepHint(file));
    console.log('');
    return;
  }
  if (isEmptyConfigFile(file)) {
    console.log(emptyConfigHint(file));
  }
}

async function main() {
  const cmd = cli.input[0];

  if (!cmd) {
    autoEnsureConfig();
    render(<App dryRun={cli.flags.dryRun} />);
    return;
  }

  if (cmd !== 'upload-server' && cmd !== 'deploy') {
    console.error(`未知命令: ${cmd}（可用: upload-server）`);
    cli.showHelp(1);
    return;
  }

  if (cli.flags.init) {
    process.exit(runInit({ force: cli.flags.force, configPath: cli.flags.config }));
  }

  autoEnsureConfig();

  const packageNames = cli.flags.packages
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  render(
    <UploadWizard
      dryRun={cli.flags.dryRun}
      serverName={cli.flags.server}
      packageNames={packageNames}
      configPath={cli.flags.config}
    />,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
