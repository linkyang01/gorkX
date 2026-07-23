# 本地验收证据台账

本文件记录可复跑的本地验收，不将单机通过扩大解释为发布或完整端到端验收。
发布门槛仍以 [NEXT_RELEASE_GATES.md](NEXT_RELEASE_GATES.md) 为准。

## 2026-07-23 · 桌面端本地构建与浏览器链路

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| TypeScript / 前端生产包 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle` | 2026-07-23 通过；首屏 JS gzip 91,775 / 512,000 bytes | 不代表运行中的 Grok 真实对话 |
| Rust | `cd apps/desktop/src-tauri && cargo test && cargo check` | 2026-07-23 通过；45 项单元测试与 `cargo check` 均通过 | 不代表 macOS TCC 或用户登录 |
| 浏览器动作 | `node scripts/verify-playwright-mcp.mjs --origin https://example.com` | 通过；隔离 Playwright MCP 发现 24 个工具，并成功 `browser_navigate` 到 `https://example.com` | 不发送模型提示词、不使用用户 Chrome profile；不代表 Grok 模型已在真实任务中调用浏览器 |
| App-only 包 | `cd apps/desktop && npm run build:app` | 2026-07-23 通过；只构建 `.app`，未生成 DMG | 不代表签名、公证或发行 |
| 包内内核 | `scripts/verify-macos-app-bundle.sh apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app` | 2026-07-23 通过；发现包内 `grok`、许可证与 NOTICE、隔离 `GROK_HOME`，版本为 `grok 0.2.110 (a5727c5)` | 不是干净 Mac 安装、App 内登录、真实项目首轮与重开续聊的人工闭环 |
| 无认证 ACP | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok` | 2026-07-23 通过 ACP initialize，受控内核为 `grok 0.2.110 (a5727c5)` | 认证、会话与扩展需要使用显式临时 home 的独立门禁 |
| 隔离 Worktree / 自定义模型 ACP | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --worktree --custom-model` | 2026-07-23 通过：cached-token 认证、session/new/load、临时自定义模型公告与 `session/set_model`、Plan mode、Worktree list 与 create；实际创建于临时 home 的 worktrees 目录 | 不发送模型提示；Hooks 与运行中子代理恢复接口仍由该内核报告为未开放；也不构成真实 provider 回复验收 |
| 会话控制 ACP 探测 | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --session-controls` | 2026-07-23 通过：`_x.ai/session/fork` 创建并加载 durable 子会话、原会话保持可加载；`_x.ai/rewind/points` 返回原生检查点列表。标准 `x.ai/*` 拼写返回 `Method not found`，客户端已改为运行时实际暴露的兼容路由 | 不发送模型提示；完整回退执行需要至少两个已持久化的真实回合，受当前账号余额阻断 |
| 真实回退执行 | 同上追加 `--resource --rewind-execute` | 2026-07-23 未通过：隔离请求收到 Grok Build `402 Payment Required`（余额耗尽）；在此之前已证明路由可达和检查点读取 | 不把该失败写成回退成功；恢复可用余额后，需用隔离两轮会话复跑，验证 `conversation_only`、`force: false` 与 session reload |

## 仍未通过的发布阻断项

1. 一台没有既有 Grok 数据的 macOS：只安装 gorkX → App 内登录 → 真实项目首轮 → 退出重开恢复。
2. 两条用户授权的真实 Provider：连接测试 → 会话选中 → 真实回复，并保留脱敏记录。
3. 上述真实项目会话中的分叉、三种回退范围、冲突拒绝、计划批准和工具审批人工走查。

因此，当前证据只支持继续开发和本地验证；**不支持创建 tag、GitHub Release 或 DMG 发行。**
