# upload-server.json 字段说明

配置查找顺序：`--config` → `./config/upload-server.json` → `~/.config/cmd-tools/upload-server.json` → 包内 `upload-server.example.json`（演示）。

首次启动若无用户配置，会自动从 example 复制一份（也可手动 `cmd-tools upload-server --init` 重打 AI 提示词）。

示例模板：同目录 `upload-server.example.json`。

---

## 根级

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `rootPath` | 是 | 本机代码根目录（绝对路径）。`groups[].packages[].dir` 都相对此路径。 |
| `servers` | 是 | 远端主机列表，至少一台。 |
| `groups` | 是 | 组件分组；交互里可整组勾选。 |

---

## `servers[]`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 显示名，也是 `dest` 的 key（必须一致）。 |
| `host` | 是 | 主机名或 IP。 |
| `port` | 否 | SSH 端口，默认 `22`。 |
| `user` | 是 | SSH 用户。 |
| `password` | 否 | SSH 密码；公钥登录可省略。勿提交进 git。 |

---

## `groups[]`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 组件名（一键勾选整组）。 |
| `packages` | 是 | 该组件下的发版单元列表。 |

---

## `groups[].packages[]`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 显示名 / CLI `--packages` 勾选标识。 |
| `dir` | 是 | 相对 `rootPath` 的本地项目目录。 |
| `build` | **是** | 打包命令（在 `rootPath/dir` 下执行）。**不可省略**；例如 `pnpm build`、`mvn -pl … package`。 |
| `dest` | 是 | 对象：`{ "<服务器 name>": "/远端绝对路径" }`。key 必须与某台 `servers[].name` 一致。 |
| `outDir` | 否 | web 产物目录（相对 `dir`）。省略时由工具探测 `dist` / `build/dist` 等。 |
| `jar` | 否 | api jar 相对 `dir` 的路径。省略时由工具在 `target/` 等处探测。 |
| `module` | 否 | Maven `-pl` 模块路径。省略时可按目录结构探测。 |
| `releaseName` | 否 | 远端文件名覆盖（少用）。 |
| `after` | 否 | 上传成功后在**远端**执行的钩子数组，仅支持：`[{ "label": "中文说明", "run": "shell 命令" }, …]`。 |

### 关于探测

- **`build` 始终必填**，工具不会替你猜构建命令。
- `outDir` / `jar` / `module` 可选：留空时工具会根据 `package.json`、`pom.xml`、`target/*.jar`、常见前端产物目录等自动探测。

---

## 给 AI 的扫描指引

填写配置前，请扫描本机/工作区：

1. 含 `upload` / `deploy` / `scp` / `ssh` / `rsync` 的脚本（含 `.vscode`）
2. `package.json`、`pom.xml`、`Makefile` / `justfile`、`scripts/`
3. 产物：`dist`、`target/*.jar`、`Dockerfile`、`start.sh`
4. 文档或注释里的主机、用户、远端目录

把扫描到的主机/路径/构建命令写进 JSON；不要改 cmd-tools 源码；不要把密钥写进 README。

填完后建议：

```bash
pnpm start -- upload-server --dry-run
# 确认无误后再真发
pnpm start -- upload-server
```
