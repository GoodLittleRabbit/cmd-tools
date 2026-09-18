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

首次 `pnpm start` / `pnpm start -- upload-server`（含 `--dry-run`）若还没有用户配置，会在可写的 **`./config/upload-server.json`** 写入**空骨架**（不是 example 的副本，也没有假项目；仅当当前目录写不进 `./config` 时才退到 `~/.config/cmd-tools`）：

```json
{
  "rootPath": "",
  "servers": [],
  "groups": []
}
```

**下一步：先告诉我要发版的项目名字**（可多个）。确认名字之前不要全盘扫描。
你说出名字后，再只扫描这些项目并填写该 JSON（`rootPath` / `servers` / `groups` / `packages`；`build` 必填；字段见 `config/upload-server.fields.md`；示例见 `upload-server.example.json`）。
填完后：`pnpm start -- upload-server --dry-run`，再真发。

也可手动生成空配置：

```bash
pnpm start -- upload-server --init
```

**本机配置含密码，不进 git**（`config/upload-server.json` 已 gitignore）。`config/upload-server.example.json` 仅作参考模板。

4. 填 JSON

先给出项目名字，再只改配置文件。字段说明见 [`config/upload-server.fields.md`](config/upload-server.fields.md)，示例见 `config/upload-server.example.json`。

要点：`rootPath`、`servers`、`groups` / `packages`（`name`、`dir`、**`build` 必填**、`dest`；可选 `outDir` / `jar` / `module` / `releaseName` / `after`）。`after` 仅支持 `[{ "label", "run" }]`。

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
- 开发本仓库时优先写 gitignore 的 `./config/upload-server.json`，不要默认落到 `~/.config`
- api 构建若需可执行 Boot jar，命令加 `-Pmicroservice`
- `after` 仅支持：`[{ "label": "中文说明", "run": "shell" }]`
