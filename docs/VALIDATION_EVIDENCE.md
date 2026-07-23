# 本地验收证据台账

本文件记录可复跑的本地验收，不将单机通过扩大解释为发布或完整端到端验收。
发布门槛仍以 [NEXT_RELEASE_GATES.md](NEXT_RELEASE_GATES.md) 为准。

## 2026-07-23 · 桌面端本地构建与浏览器链路

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| TypeScript / 前端生产包 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle` | 通过；首屏 JS gzip 90,897 / 512,000 bytes | 不代表运行中的 Grok 真实对话 |
| Rust | `cd apps/desktop/src-tauri && cargo test && cargo check` | 36 项单元测试全部通过，`cargo check` 通过 | 不代表 macOS TCC 或用户登录 |
| 浏览器动作 | `node scripts/verify-playwright-mcp.mjs --origin https://example.com` | 通过；隔离 Playwright MCP 发现 24 个工具，并成功 `browser_navigate` 到 `https://example.com` | 不发送模型提示词、不使用用户 Chrome profile；不代表 Grok 模型已在真实任务中调用浏览器 |
| App-only 包 | `cd apps/desktop && npm run build:app` | 通过；只构建 `.app`，未生成 DMG | 不代表签名、公证或发行 |
| 包内内核 | `scripts/verify-macos-app-bundle.sh apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app` | 通过；发现包内 `grok`、许可证与 NOTICE、隔离 `GROK_HOME`，版本为 `grok 0.2.105 (7cfcb20)` | 不是干净 Mac 安装、App 内登录、真实项目首轮与重开续聊的人工闭环 |

## 仍未通过的发布阻断项

1. 一台没有既有 Grok 数据的 macOS：只安装 gorkX → App 内登录 → 真实项目首轮 → 退出重开恢复。
2. 两条用户授权的真实 Provider：连接测试 → 会话选中 → 真实回复，并保留脱敏记录。
3. 上述真实项目会话中的分叉、三种回退范围、冲突拒绝、计划批准和工具审批人工走查。

因此，当前证据只支持继续开发和本地验证；**不支持创建 tag、GitHub Release 或 DMG 发行。**
