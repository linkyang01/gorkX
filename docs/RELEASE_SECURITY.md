# 发布安全门禁

发布流水线仍由发布所有者显式触发；本仓库不在质量 workflow 中打 tag、生成 DMG、上传 Release 或写入私钥。

## App 签名

`scripts/verify-release-signing.sh /absolute/path/gorkX.app` 只在 macOS 上运行，并要求：

1. `codesign --verify --deep --strict` 通过；
2. 具备 `Developer ID Application` authority 和 TeamIdentifier；
3. 不是 ad-hoc 签名；
4. `spctl --assess --type execute` 通过。

当前 `tauri.conf.json` 仍使用 `signingIdentity: "-"`，因此现有 arm64 候选只能归为 ad-hoc；严格发布门禁应保持 BLOCKED，不能用候选包冒充公证发布。

## Updater

`scripts/verify-updater-manifest.mjs` 在启用 Tauri 官方 updater 前校验 manifest 的 semver、平台条目、HTTPS 下载地址、非空签名和可选 SHA-256。它不自行实现密码学验证，最终签名验证必须由 Tauri updater 和对应公钥完成。

只有在 Developer ID/notarization、Tauri updater 公钥、离线保管的私钥、签名产物和回滚流程都就绪后，才接入 `tauri-plugin-updater`。没有这些材料时不创建伪造的 `latest.json`、公钥或签名字段。

## 相关真实门槛

签名成功也不能替代干净 Mac 安装/登录/重开、真实 Grok Build prompt、第三方模型、麦克风权限和跨架构验证；这些仍在 [`QUALITY_PLAN_TO_8.md`](QUALITY_PLAN_TO_8.md) 的 Q-REAL 和平台矩阵中单独记录。
