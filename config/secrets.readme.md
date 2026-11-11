# 密钥与证书分类

本地密钥放在 `config/secrets/`，已 gitignore，不要提交。

分类目录：

- `miniprogram/`  微信小程序代码上传密钥（`private.<AppId>.key`）
- `ssh/`          服务器 SSH 私钥
- `tls/`          TLS 证书与私钥
- `api/`          其它接口令牌或密钥文件

微信小程序 CI 密钥命名保持官方文件名：`private.<AppId>.key`。
当前电子名片小程序 AppId：`wx54f88754351d2deb`。
