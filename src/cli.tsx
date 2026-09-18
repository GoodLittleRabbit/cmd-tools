#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';
import { findUserConfig } from './capabilities/upload-server/config.js';
import { UploadServerApp } from './capabilities/upload-server/index.js';
import { missingUserConfigMessage, runInit } from './capabilities/upload-server/init.js';

const cli = meow(
  `
  用法
    $ cmd-tools
    $ cmd-tools upload-server --init
    $ cmd-tools upload-server --dry-run
    $ cmd-tools upload-server [options]

  通用发版工具：按你的配置构建、打包并把 web/api 产物上传到服务器。

  配置查找顺序
    1. --config / -c
    2. ./config/upload-server.conf          （当前工作目录）
    3. ~/.config/cmd-tools/upload-server.conf
    4. 包内 config/upload-server.example.conf（只读演示，仅 dry-run）

  Options
    --init              复制 example 到本机 conf，打印给 AI 的提示词后退出
    --force             与 --init 合用：覆盖已有 conf
    --dry-run, -n       演练：同样进度 UI，跳过重构建 / scp / ssh
    --server, -s        服务器 id
    --services, -p      服务 id，逗号分隔
    --config, -c        配置文件路径
    --help              帮助
`,
  {
    importMeta: import.meta,
    flags: {
      init: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      dryRun: { type: 'boolean', shortFlag: 'n', default: false },
      server: { type: 'string', shortFlag: 's' },
      services: { type: 'string', shortFlag: 'p' },
      config: { type: 'string', shortFlag: 'c' },
    },
  },
);

const cmd = cli.input[0];

if (!cmd) {
  render(<App />);
} else if (cmd === 'upload-server' || cmd === 'deploy') {
  // `deploy` is an undocumented compatibility alias
  if (cli.flags.init) {
    process.exit(runInit({ force: cli.flags.force, configPath: cli.flags.config }));
  }
  if (!cli.flags.dryRun && !findUserConfig(cli.flags.config)) {
    console.error(missingUserConfigMessage());
    process.exit(1);
  }
  render(
    <UploadServerApp
      dryRun={cli.flags.dryRun}
      serverId={cli.flags.server}
      serviceIds={cli.flags.services?.split(',').map((s) => s.trim()).filter(Boolean)}
      configPath={cli.flags.config}
    />,
  );
} else {
  console.error(`未知命令: ${cmd}（可用: upload-server）`);
  cli.showHelp(1);
}
