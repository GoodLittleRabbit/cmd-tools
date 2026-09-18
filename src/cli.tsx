#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';
import { UploadServerApp } from './capabilities/upload-server/index.js';

const cli = meow(
  `
  用法
    $ cmd-tools
    $ cmd-tools deploy [options]
    $ cmd-tools upload-server [options]

  通用发版工具：按你的配置构建、打包并把 web/api 产物上传到服务器。
  upload-server 与 deploy 等价。

  配置查找顺序
    1. --config / -c
    2. ./config/upload-server.conf          （当前工作目录）
    3. ~/.config/cmd-tools/upload-server.conf
    4. 包内 config/upload-server.example.conf（只读演示）

  Options
    --dry-run, -n       演练：同样进度 UI，跳过重构建 / scp / ssh
    --server, -s        服务器 id
    --services, -p      服务 id，逗号分隔
    --config, -c        配置文件路径
    --help              帮助
`,
  {
    importMeta: import.meta,
    flags: {
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
} else if (cmd === 'deploy' || cmd === 'upload-server') {
  render(
    <UploadServerApp
      dryRun={cli.flags.dryRun}
      serverId={cli.flags.server}
      serviceIds={cli.flags.services?.split(',').map((s) => s.trim()).filter(Boolean)}
      configPath={cli.flags.config}
    />,
  );
} else {
  console.error(`未知命令: ${cmd}（可用: deploy, upload-server）`);
  cli.showHelp(1);
}
