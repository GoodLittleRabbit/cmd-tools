# cmd-tools

通用发版 CLI。主命令只有：

```bash
cmd-tools upload-server
```

按**你自己的 conf** 构建、打包 web/api 产物，再 `scp` / `ssh` 上传。不绑定某个业务仓库，**不会**调用业务项目里的上传脚本。别人只用改 conf，不用改 cmd-tools 源码。

---

## 给人（使用步骤）

1. **安装**

   ```bash
   git clone <this-repo> cmd-tools
   cd cmd-tools
   pnpm install && pnpm build
   pnpm link --global   # 可选，之后可直接打 cmd-tools
   ```

2. **初始化本机配置**（在你的业务项目目录下执行更合适）

   ```bash
   cmd-tools upload-server --init
   ```

   会把通用 example 复制到：
   - 优先 `./config/upload-server.conf`
   - 若当前目录是 cmd-tools 自身或不便写入，则 `~/.config/cmd-tools/upload-server.conf`
   - 已存在则不覆盖（需要覆盖时加 `--force`）

   终端会打印一段**可复制的「给使用者 AI 的提示词」**和**字段对应表**，然后退出（不进入发版界面）。

3. **把终端里的提示词交给你自己的 AI**  
   让它扫描你本机的发版脚本 / `package.json` / scp 配置，**只填 conf**，不要改 cmd-tools 源码。

4. **演练**

   ```bash
   cmd-tools upload-server --dry-run
   ```

5. **真发**

   ```bash
   cmd-tools upload-server
   ```

没有本机 conf 时直接真发，会提示先 `--init`。

配置查找顺序：`--config` → `./config/upload-server.conf` → `~/.config/cmd-tools/upload-server.conf` → 包内 example（只读演示，主要用于 dry-run）。

SSH：`StrictHostKeyChecking=accept-new`；有密码时优先 `sshpass -e`，否则 `expect`。`CHANGE_ME` / 空密码则尝试密钥。不要把密钥提交进 git。

其它常用参数：

| 选项 | 说明 |
| --- | --- |
| `--init` | 复制 example、打印给 AI 的提示词后退出 |
| `--force` | 与 `--init` 合用，覆盖已有 conf |
| `--dry-run`, `-n` | 同样走进度 UI，跳过重构建与真实 scp/ssh |
| `--server`, `-s` | 服务器 id |
| `--services`, `-p` | 服务 id，逗号分隔 |
| `--config`, `-c` | 指定 conf 路径 |

交互：选服务器 → 空格多选服务 → 确认 → 进度条（构建 → 打包 → 上传 → 远端）。同时传 `-s` 和 `-p` 则跳过选择直接发版。

---

## 给 AI（帮使用者填 conf）

你的任务是**只填写/修改 upload-server 的 conf**，不要改 cmd-tools 的 TypeScript 或其它源码。

典型路径（`--init` 结束时终端会给出实际路径）：

- `./config/upload-server.conf`
- 或 `~/.config/cmd-tools/upload-server.conf`

填完后让使用者执行：`cmd-tools upload-server --dry-run`。通过后再：`cmd-tools upload-server`。

### 扫描范围（当前工作区 / 业务仓库）

把这些当**信息来源**（推断主机、路径、构建命令），不要去 exec 它们：

- 文件名或内容含 `upload` / `deploy` / `scp` / `ssh` / `rsync` 的脚本
- `package.json` 的 `scripts`（`build`、`build-prod`、`build:prod` 等）
- Makefile、justfile、`scripts/` 目录
- `.vscode` 下的上传脚本或 tasks
- 已有 `dist`、`target/*.jar`、`Dockerfile`、`start.sh`
- 文档/注释里的主机、用户、远端目录

### 字段对应表

| 配置项 | 含义 |
| --- | --- |
| `CODE_ROOT` | 本机代码根目录；服务的 `projectRel` 相对它 |
| `SERVERS` | 可发版的机器列表 |
| `SERVICES` | 要构建/上传的 web 或 api |

**SERVERS 一行**（`|` 分隔）：

```
id | label | host | user | password | roles
```

| 字段 | 含义 |
| --- | --- |
| id | 短名，给 `-s` 和 `remoteMap` 左侧用 |
| label | 显示名 |
| host | SSH 主机 |
| user | SSH 用户 |
| password | SSH 密码；`CHANGE_ME` 或空则尝试密钥 |
| roles | `web` 和/或 `api`，逗号分隔 |

**SERVICES · Web 一行：**

```
id | label | web | projectRel | buildCommand | artifactDir | remoteMap [| remoteDirName]
```

| 字段 | 含义 |
| --- | --- |
| projectRel | 相对 `CODE_ROOT` 的前端目录 |
| buildCommand | 如 `pnpm build`；空则跳过构建 |
| artifactDir | 产物目录（须有 `index.html`） |
| remoteMap | `serverId:/远端绝对路径`，多机用 `;;` |
| remoteDirName | 可选；默认用 `artifactDir` 的目录名 |

**SERVICES · API 一行（推荐写全）：**

```
id | label | api | projectRel | buildCommand | jarRel | moduleRel | remoteSubdir | remoteMap
```

| 字段 | 含义 |
| --- | --- |
| projectRel | 相对 `CODE_ROOT` 的后端目录 |
| buildCommand | 如 `mvn -pl server -am -DskipTests package`；空则跳过 |
| jarRel | 相对项目的 jar |
| moduleRel | 相对项目的模块目录（用于找 Dockerfile/start.sh） |
| remoteSubdir | 远端子目录 |
| remoteMap | 同上 |

可选 `API_PRESET="yudao"` 后，API 才允许写成短名：`id|label|api|projectRel|shortName|remoteMap`。写全的字段始终覆盖预设。

占位符 `YOUR_CODE_ROOT`、`your-web-app`、`127.0.0.1`、`CHANGE_ME` 必须换成真实值。`remoteMap` 的 serverId 必须与 `SERVERS` 的 id 一致。

---

## 开发自测（cmd-tools 仓库维护者，不是使用者步骤）

```bash
pnpm install && pnpm build
pnpm dev -- upload-server --dry-run
```

在本仓库内执行 `--init` 时，conf 会写到 `~/.config/cmd-tools/`（避免把使用者配置写进工具仓）。
