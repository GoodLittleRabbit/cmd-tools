# cmd-tools

通用终端发版工具（Ink + React + TypeScript）。主命令：`cmd-tools upload-server`。

按**你自己的配置**构建、打包 web/api 产物，再 `scp` / `ssh` 传到服务器。不绑定某个业务仓库；别人只改 conf、不用改源码。

发版逻辑全部在本仓库内完成，**不会**去调用业务项目里的上传脚本。`CODE_ROOT` 下的目录只当产物源。

## 安装

本地（从源码）：

```bash
git clone <this-repo> cmd-tools
cd cmd-tools
pnpm install
pnpm build
node dist/cli.js --help
```

全局命令：

```bash
pnpm link --global
cmd-tools upload-server --help
```

npx（发布到 npm 之后，或指向 Git 仓库）：

```bash
npx cmd-tools upload-server --dry-run
# 或尚未发布时：
npx github:<owner>/cmd-tools upload-server --dry-run
```

开发：

```bash
pnpm dev -- upload-server --dry-run
```

## 写自己的配置

包内 `config/upload-server.example.conf` 是**只读演示**（占位符，不是真实环境）。复制后填写路径、主机、密码：

```bash
# 方案 A：当前工作目录（适合每个产品仓一份配置）
mkdir -p config
cp /path/to/cmd-tools/config/upload-server.example.conf config/upload-server.conf

# 方案 B：用户目录（适合本机多项目共用）
mkdir -p ~/.config/cmd-tools
cp /path/to/cmd-tools/config/upload-server.example.conf ~/.config/cmd-tools/upload-server.conf
```

查找顺序：

1. `--config` / `-c`
2. `./config/upload-server.conf`（cwd）
3. `~/.config/cmd-tools/upload-server.conf`
4. 包内 example（只读演示）

`config/upload-server.conf` 已 gitignore。密码只从配置读取，不要写进源码或提交到 git。

SSH：`StrictHostKeyChecking=accept-new`；有密码时优先 `sshpass -e`，否则 `expect`。空密码或 `CHANGE_ME` 则尝试密钥登录。

### 字段说明

Web 行：

```
id|label|web|projectRel|buildCommand|artifactDir|remoteMap
```

- 在 `CODE_ROOT/projectRel` 执行 `buildCommand`
- 校验 `artifactDir/index.html`
- 打成 `{artifactDir 目录名}.tgz` 上传，远端备份同名目录后解压

API 行（推荐写全，任意项目结构）：

```
id|label|api|projectRel|buildCommand|jarRel|moduleRel|remoteSubdir|remoteMap
```

可选 `API_PRESET="yudao"`：才允许把 API 写成短名（`gateway` / `system` / …），并由预设补全 jar/module/subdir。**预设默认关闭**；写全的字段始终覆盖预设。

`remoteMap`：`serverId:/remote/path`，多服务器用 `;;` 分隔。

## 使用

交互：选服务器 → **空格多选**服务 → 确认。之后是进度条 UI（构建 → 打包 → 上传 → 远端）。

```bash
cmd-tools upload-server
cmd-tools upload-server --dry-run
cmd-tools upload-server --dry-run -s dev -p web-app
cmd-tools upload-server -s dev -p web-app,api-app
cmd-tools upload-server --config ~/my.conf --dry-run
```

同时传入 `-s` 与 `-p` 时跳过选择/确认，直接进入发版进度。

| 选项 | 说明 |
| --- | --- |
| `--dry-run`, `-n` | 同样走进度 UI，但跳过重构建与真实 scp/ssh |
| `--server`, `-s` | 服务器 id |
| `--services`, `-p` | 服务 id，逗号分隔 |
| `--config`, `-c` | 配置文件路径 |
