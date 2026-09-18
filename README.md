# cmd-tools

Ink + React + TypeScript 终端工具集。首个能力：`upload-server`（交互发版）。

## 快速开始

```bash
cd cmd-tools
pnpm install
pnpm build
pnpm link --global   # 可选
cmd-tools --help
cmd-tools upload-server --dry-run
```

开发：

```bash
pnpm dev -- upload-server --dry-run
```

## upload-server

1. 复制 `config/upload-server.example.conf` → `config/upload-server.conf` 并改密码/路径  
2. 运行 `cmd-tools upload-server`  
3. ↑↓ 移动，**空格勾选**服务，回车确认  
4. `--dry-run` 只打印计划不上传  

```bash
cmd-tools upload-server --server test-251 --services admin-web,gateway --dry-run
```

## 说明

本仓库为私有 GitHub 仓。真传 scp/ssh 逻辑可在后续迭代补全；当前 MVP 以交互选择 + dry-run 计划为主。
