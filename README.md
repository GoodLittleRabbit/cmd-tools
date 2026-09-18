# cmd-tools

## 使用步骤

1. 安装

```bash
pnpm install
```

2. 开发/日常启动（自动 build 再 start；缺 `dist/cli.js` 时 `start` 也会先编译）

```bash
pnpm dev
# 等同：pnpm build && pnpm start
# 已编译过可只：pnpm start
```

3. 缺配置时自动初始化

首次 `pnpm start` / `pnpm start -- upload-server`（含 `--dry-run`）若本机还没有 `upload-server.json`，会自动从 example 复制一份，并打印可粘贴给 AI 的提示词：

```
已自动初始化配置: <path>
```

也可手动重打提示词：

```bash
pnpm start -- upload-server --init
```

**本机配置含密码，不进 git**（`config/upload-server.json` 已 gitignore）。

4. 填 JSON

按提示词让 AI 扫描本机项目，只改配置文件。字段说明见 [`config/upload-server.fields.md`](config/upload-server.fields.md)，示例见 `config/upload-server.example.json`。

要点：`rootPath`、`servers`、`groups` / `packages`（`name`、`dir`、**`build` 必填**、`dest`；可选 `outDir` / `jar` / `module` / `after`）。

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
