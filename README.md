# cmd-tools

Ink + React + TypeScript 终端工具集。首个能力：`upload-server`（交互发版）。

发版逻辑全部在本仓库内完成（读配置、本地构建/打包、`scp`、`ssh` 远端解压）。**不会**调用 `kfi-cloud-admin/scripts/upload-dist.sh` 或 `kfi-cloud-api/.vscode/upload-jars-to-devtest.sh`；那两个仓库只作为 `CODE_ROOT` 下的产物源目录。

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

## 配置

1. 复制 `config/upload-server.example.conf` → `config/upload-server.conf`
2. 填写真实密码、`CODE_ROOT`、远端路径
3. `upload-server.conf` 已 gitignore，不要提交密钥

密码只从配置文件读取，代码里不会硬编码。SSH 使用 `StrictHostKeyChecking=accept-new`；有密码时优先 `sshpass -e`，否则 `expect`。

## upload-server

交互：选服务器 → **空格多选**服务 → 确认。确认后进入带进度条的发版 UI（构建 → 打包 → 上传 → 远端）。

```bash
cmd-tools upload-server
cmd-tools upload-server --dry-run
cmd-tools upload-server --dry-run -s test-251 -p admin-web
cmd-tools upload-server -s test-251 -p admin-web,gateway
```

同时传入 `-s` 与 `-p` 时跳过选择/确认，直接进入发版进度（适合演练与脚本）。

| 选项 | 说明 |
| --- | --- |
| `--dry-run`, `-n` | 同样走进度 UI，但跳过重构建与真实 scp/ssh |
| `--server`, `-s` | 服务器 id |
| `--services`, `-p` | 服务 id，逗号分隔 |
| `--config`, `-c` | 配置文件路径 |

### Web (`kind=web`)

- 在 `CODE_ROOT/projectRel` 执行 `buildOrShort`（如 `pnpm build-prod`）
- 校验 `artifactDir/index.html`
- `tar.gz` 打包（`COPYFILE_DISABLE=1`，优先 `tar --no-xattrs`）
- `scp` 到 `user@host:remote/dist-prod.tgz`
- `ssh`：备份旧 `dist-prod` 为时间戳目录 → 解压 → 删除 tgz

### API (`kind=api`)

- 短名映射 jar / Maven 模块 / 远端子目录（yudao 布局：`gateway` → `gateway-server`，`system` → `system-server`，以及 `ai` `infra` `llm` `goals` `calendar` `dataease` `product` `mail` `kfifilemanager`）
- 可选：`mvn -pl <module> -am -DskipTests package`
- `scp` jar，以及模块目录下可选的 `Dockerfile` / `start.sh` / `.dockerignore`
