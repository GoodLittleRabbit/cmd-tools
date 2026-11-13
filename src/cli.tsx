#!/usr/bin/env node
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';
import {
  ensureUserConfig,
  isEmptyUserConfig,
  runInit,
} from './capabilities/upload-server/init.js';
import { printDeployLog } from './capabilities/upload-server/deploy/logFile.js';
import { autoUpgradeOnStart, runUpgrade } from './capabilities/upload-server/upgrade.js';
import { UploadWizard } from './capabilities/upload-server/UploadWizard.js';
import { MiniprogramWizard } from './capabilities/miniprogram/MiniprogramWizard.js';
import { parseAction, parseAppSelectors, parseEnv } from './capabilities/miniprogram/config.js';
import { runMiniprogramCli } from './capabilities/miniprogram/run.js';

const cli = meow(
  `
  用法
    $ cmd-tools
    $ cmd-tools /log
    $ cmd-tools /log 1
    $ cmd-tools /log fail
    $ cmd-tools upload-server --init
    $ cmd-tools upload-server --dry-run
    $ cmd-tools upload-server [options]
    $ cmd-tools miniprogram --dry-run --app 电子名片 --action preview --env test
    $ cmd-tools mp --app <name|appid> --action preview|upload --env test|prod
    $ cmd-tools /upgrade

  Options
    --init              生成空配置（配置为空时首页会显示给 AI 的用法）
    --force             与 --init 合用：覆盖已有配置为空骨架
    --dry-run, -n       演练（不上传 / 不调用微信）
    --server, -s        服务器 name（upload-server）
    --packages, -p      package name，逗号分隔（upload-server）
    --app               小程序 name 或 appid，逗号可多选（miniprogram）
    --action            preview 或 upload（miniprogram）
    --version           小程序版本号（miniprogram；未传则从 0.0.1 起）
    --desc              版本备注（miniprogram；upload 必填）
    --env               test 或 prod（miniprogram；test 用 .env.development，prod 用 .env.production）
    --config, -c        配置文件路径

  斜杠命令（给 AI / 终端，不在首页菜单）
    /log                列出发版日志历史
    /log <n|fail|latest|ok>  查看一条（1=最新；fail=上次失败）
    /upgrade            完整升级：备份 → git pull → install/build → 字段迁回
                        （平时启动已自动 migrate，一般不用点）
`,
  {
    importMeta: import.meta,
    flags: {
      init: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      dryRun: { type: 'boolean', shortFlag: 'n', default: false },
      server: { type: 'string', shortFlag: 's' },
      packages: { type: 'string', shortFlag: 'p' },
      app: { type: 'string' },
      action: { type: 'string' },
      version: { type: 'string' },
      desc: { type: 'string' },
      env: { type: 'string' },
      config: { type: 'string', shortFlag: 'c' },
    },
    autoVersion: false,
  },
);

/** 缺配置则自动创建；启动时静默自动升级配置字段 */
function autoEnsureConfig(): string {
  const { file, created } = ensureUserConfig({ configPath: cli.flags.config });
  if (created) {
    console.log(`已创建空配置: ${file}`);
  } else {
    autoUpgradeOnStart(file);
  }
  return file;
}

function isSlashCommand(cmd: string | undefined, names: string[]): boolean {
  if (!cmd) return false;
  const c = cmd.trim().toLowerCase();
  return names.some((n) => c === n || c === `/${n}`);
}

function wantsCliVersion(argv: string[]): boolean {
  return argv.includes('--version') || argv.includes('-V');
}

async function main() {
  const cmd = cli.input[0];

  // Claude 风格斜杠命令：不进首页菜单
  if (isSlashCommand(cmd, ['log'])) {
    process.exit(printDeployLog(cli.input[1]));
  }
  if (isSlashCommand(cmd, ['upgrade'])) {
    process.exit(runUpgrade({ configPath: cli.flags.config }));
  }

  if (!cmd) {
    if (wantsCliVersion(process.argv.slice(2))) {
      console.log(cli.pkg.version ?? '0.0.0');
      return;
    }
    const configPath = autoEnsureConfig();
    render(<App dryRun={cli.flags.dryRun} configPath={configPath} />);
    return;
  }

  if (cmd === 'miniprogram' || cmd === 'mp') {
    const selectors = parseAppSelectors(cli.flags.app);
    const action = parseAction(cli.flags.action);
    const env = parseEnv(cli.flags.env);
    if (selectors?.length && action && env) {
      process.exit(
        await runMiniprogramCli({
          configPath: cli.flags.config,
          app: cli.flags.app,
          action: cli.flags.action,
          env: cli.flags.env,
          version: cli.flags.version,
          desc: cli.flags.desc,
          dryRun: cli.flags.dryRun,
        }),
      );
    }
    render(
      <MiniprogramWizard
        dryRun={cli.flags.dryRun}
        configPath={cli.flags.config}
        appNames={selectors}
        action={action}
        env={env}
        version={cli.flags.version}
        desc={cli.flags.desc}
      />,
    );
    return;
  }

  if (cmd !== 'upload-server' && cmd !== 'deploy') {
    console.error(`未知命令: ${cmd}（可用: upload-server · miniprogram / mp · /log · /upgrade）`);
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
