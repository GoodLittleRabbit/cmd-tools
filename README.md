# cmd-tools

## 使用步骤

1. 安装并编译

```bash
pnpm install
pnpm build
```

2. 日常启动（用 dist）

```bash
pnpm start
# 等同：node dist/cli.js
# 或全局：pnpm link --global 后直接 cmd-tools
```

开发调试不用 build：`pnpm dev`

3. 初始化配置

```bash
pnpm start -- upload-server --init
# 或：node dist/cli.js upload-server --init
```

生成 `config/upload-server.json`（或 `~/.config/cmd-tools/upload-server.json`），并打印给 AI 填配置的提示词。  
**本机 `config/upload-server.json` 含密码，不进 git。**

4. 填配置

按提示词让 AI 扫描本机项目，只改 JSON：`rootPath`、`servers`、`groups` / `packages`（`name`、`dir`、`build`、`dest`，可选 `after: [{ label, run }]`）。

5. 演练

```bash
pnpm start -- upload-server --dry-run
```

6. 真发

```bash
pnpm start -- upload-server
```

## 键位

- 列表：↑↓ · Enter · ← 返回（首页不能 ←）
- 分组：空格整组 · → 子项 · a 全选 · c 清空 · Enter
- 子项：空格 · Enter 下一步 · ← 回分组
- 发版中不可返回；成功回首页，失败看 `~/.cache/cmd-tools/logs/upload-server-last-fail.log`

## 配置要点

- 查找顺序：`--config` → `./config/upload-server.json` → `~/.config/cmd-tools/upload-server.json` → example
- api 构建若需可执行 Boot jar，命令加 `-Pmicroservice`
- `after` 仅支持：`[{ "label": "中文说明", "run": "shell" }]`
