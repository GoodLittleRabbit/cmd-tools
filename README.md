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

3. 缺配置时自动创建**空配置**

首次 `pnpm start` / `pnpm start -- upload-server`（含 `--dry-run`）若本机还没有 `upload-server.json`，会在 **`./config/upload-server.json`** 写入空骨架（不是复制带假项目的 example）：

```json
{
  "rootPath": "",
  "servers": [],
  "groups": []
}
```

若配置仍为空，**首页会显示给 AI 的用法**（先读 README → 问项目名 → 只扫这些项目 → 填 JSON）。填好后选「已填好配置，继续」。

也可手动：

```bash
pnpm start -- upload-server --init
```

**本机配置含密码，不进 git**（`config/upload-server.json` 已 gitignore）。

4. 填 JSON

先报项目名 → 再只扫描这些项目并填写。字段说明见 [`config/upload-server.fields.md`](config/upload-server.fields.md)，示例见 `config/upload-server.example.json`。

要点：`rootPath`、`servers`、`groups` / `packages`（`name`、`dir`、**`build` 必填**、`dest`；可选 `outDir` / `jar` / `module` / `releaseName` / `after`）。

5. 演练

```bash
pnpm start -- upload-server --dry-run
```

6. 真发

```bash
pnpm start -- upload-server
```

## 升级（别人更新代码）

本地 `config/upload-server.json` **不进 git**，正常 `git pull` 一般不会覆盖/冲突。  
字段结构若有变更，建议走升级控制中心：

```bash
pnpm start -- /upgrade
# 或：pnpm start -- upgrade
```

流程：先备份配置到 `~/.cache/cmd-tools/backup/` → `git pull` → `pnpm install` / `build` → 把旧字段迁回新结构写回配置。首页也可选「升级」。

## 查看失败日志

```bash
pnpm start -- /log
# 或：pnpm start -- log
```

首页也可选 `/log`。成功不写日志；失败覆盖写入 `~/.cache/cmd-tools/logs/upload-server-last-fail.log`。

## 键位

- 列表：↑↓ · Enter · ← 返回（首页不能 ←）
- 分组：空格整组 · → 子项 · a 全选 · c 清空 · Enter
- 子项：空格 · Enter 下一步 · ← 回分组
- 发版中不可返回；成功可选「继续发版」（回首页重选）或「退出」；失败看 `~/.cache/cmd-tools/logs/upload-server-last-fail.log`

## 配置要点

- 查找顺序：`--config` → `./config/upload-server.json` → `~/.config/cmd-tools/upload-server.json` → example
- 在 cmd-tools 包内开发时，只要 `./config` 可写，仍优先写 `./config/upload-server.json`（gitignore）
- api 构建若需可执行 Boot jar，命令加 `-Pmicroservice`
- `after` 仅支持：`[{ "label": "中文说明", "run": "shell" }]`
