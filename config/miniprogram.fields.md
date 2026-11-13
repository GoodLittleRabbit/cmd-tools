# miniprogram.json 字段说明

配置查找顺序：`--config` → `./config/miniprogram.json` → `~/.config/cmd-tools/miniprogram.json`。

在 cmd-tools 包内开发时，只要 `./config` 可写，本机配置写在 **`./config/miniprogram.json`**（已 gitignore）。示例见同目录 `miniprogram.example.json`。

配置里不要写密钥，也不要写私钥内容。

---

## 根级

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `rootPath` | 是 | 本机代码根目录（绝对路径）。`apps[].dir` 相对此路径。 |
| `apps` | 是 | 要预览 / 上传的小程序列表。 |

---

## `apps[]`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 显示名 / CLI `--app` 标识。 |
| `appid` | 是 | 微信 AppId。 |
| `dir` | 是 | 相对 `rootPath` 的本地项目目录。 |
| `build` | 否 | 在 `dir` 下执行的构建命令。省略时若 `package.json` 有 `build:mp-weixin`（或 `build`）会自动探测。 |
| `projectPath` | 否 | 相对 `dir` 的微信工程目录（含 `project.config.json`）。省略时运行时探测。 |
| `type` | 否 | 默认 `miniProgram`。可选：`miniProgram` / `miniGame` / `miniProgramPlugin` / `miniGamePlugin`。 |

### 关于探测

- **projectPath**：在 `dir` 下找含 `project.config.json` 的目录。`upload` 优先 `dist/build/mp-weixin`、`unpackage/dist/build/mp-weixin`；`preview` 优先 `dist/dev/mp-weixin`、`unpackage/dist/dev/mp-weixin`，再回退到另一侧，最后才是 `dir` 本身。
- **build**：未填写时，按 lockfile 探测 `pnpm` / `yarn` / `npm run` + `build:mp-weixin`（或 `build`）。

---

## 密钥

私钥一律放在（相对 cmd-tools 包根）：

```
config/secrets/miniprogram/private.<appid>.key
```

也可回退到 `~/.config/cmd-tools/secrets/miniprogram/private.<appid>.key`。权限保持 `600`。已 gitignore，不要提交。


## 接口环境

预览 / 上传时必须选择 `test` 或 `prod`，用于构建时的 Vite `--mode`：

- **test**：`--mode development`，读取项目里的 `.env.development`（测试接口地址）。
- **prod**：`--mode production`，读取 `.env.production`（正式接口地址）。

向导里会单独问一步「环境」。命令行必须带 `--env test` 或 `--env prod`，不再默认走正式地址。
