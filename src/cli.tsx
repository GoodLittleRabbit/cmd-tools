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
    $ cmd-tools upload-server [options]

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
} else if (cmd === 'upload-server') {
  render(
    <UploadServerApp
      dryRun={cli.flags.dryRun}
      serverId={cli.flags.server}
      serviceIds={cli.flags.services?.split(',').map((s) => s.trim()).filter(Boolean)}
      configPath={cli.flags.config}
    />,
  );
} else {
  console.error(`未知命令: ${cmd}`);
  cli.showHelp(1);
}
