# 本地验收证据台账

本文件记录可复跑的本地验收，不将单机通过扩大解释为发布或完整端到端验收。
发布门槛仍以 [NEXT_RELEASE_GATES.md](NEXT_RELEASE_GATES.md) 为准。

## 2026-07-23 · 桌面端本地构建与浏览器链路

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| TypeScript / 前端生产包 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle` | 2026-07-23 通过；首屏 JS gzip 91,803 / 512,000 bytes | 不代表运行中的 Grok 真实对话 |
| Rust | `cd apps/desktop/src-tauri && cargo test && cargo check` | 2026-07-23 通过；45 项单元测试与 `cargo check` 均通过 | 不代表 macOS TCC 或用户登录 |
| 浏览器动作 | `node scripts/verify-playwright-mcp.mjs --origin https://example.com` | 通过；隔离 Playwright MCP 发现 24 个工具，并成功 `browser_navigate` 到 `https://example.com` | 不发送模型提示词、不使用用户 Chrome profile；不代表 Grok 模型已在真实任务中调用浏览器 |
| App-only 包 | `cd apps/desktop && npm run build:app` | 2026-07-23 通过；只构建 `.app`，未生成 DMG | 不代表签名、公证或发行 |
| 包内内核 | `scripts/verify-macos-app-bundle.sh apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app` | 2026-07-23 通过；发现包内 `grok`、许可证与 NOTICE、隔离 `GROK_HOME`，版本为 `grok 0.2.110 (a5727c5)` | 不是干净 Mac 安装、App 内登录、真实项目首轮与重开续聊的人工闭环 |
| 无认证 ACP | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok` | 2026-07-23 通过 ACP initialize，受控内核为 `grok 0.2.110 (a5727c5)` | 认证、会话与扩展需要使用显式临时 home 的独立门禁 |
| 隔离 Worktree / 自定义模型 ACP | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --worktree --custom-model` | 2026-07-23 通过：cached-token 认证、session/new/load、临时自定义模型公告与 `session/set_model`、Plan mode、Worktree list 与 create；实际创建于临时 home 的 worktrees 目录 | 不发送模型提示，也不构成真实 provider 回复验收；Hooks 与子代理控制由后续独立 `_x.ai/*` 门禁覆盖 |
| 会话控制 ACP 探测 | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --session-controls` | 2026-07-23 通过：`_x.ai/session/fork` 创建并加载 durable 子会话、原会话保持可加载；`_x.ai/rewind/points` 返回原生检查点列表。标准 `x.ai/*` 拼写返回 `Method not found`，客户端已改为运行时实际暴露的兼容路由 | 不发送模型提示；完整回退执行需要至少两个已持久化的真实回合，受当前账号余额阻断 |
| 真实回退执行 | 同上追加 `--resource --rewind-execute` | 2026-07-23 未通过：隔离请求收到 Grok Build `402 Payment Required`（余额耗尽）；在此之前已证明路由可达和检查点读取 | 不把该失败写成回退成功；恢复可用余额后，需用隔离两轮会话复跑，验证 `conversation_only`、`force: false` 与 session reload |
| 旁路提问 `/btw` | 同上追加 `--btw` | 已提供独立 acceptance gate：它要求 `x.ai/btw` 返回精确的 `answer` 字段，而非普通 prompt 确认；本轮未执行，以免在已知余额耗尽时重复发起计费请求 | 内核 0.2.110 源码与客户端均使用 `x.ai/btw`；余额恢复后需在隔离会话运行该门禁，验证回答不进入主会话记录 |
| 子代理控制 ACP 探测 | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --subagent-controls` | 2026-07-23 通过：`_x.ai/subagent/list_running`、`get`、`cancel` 路由均可达；标准 `x.ai/*` 拼写不被当前 stdio 接受，客户端已改为兼容路由 | 探测只使用不存在的子代理 ID，不会启动或取消真实工作；真实委派/取消闭环仍需要有效账户余额验收 |
| Hooks 控制 ACP 探测 | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --hooks-controls` | 2026-07-23 通过：`_x.ai/hooks/list` 返回 Hook 快照，`_x.ai/hooks/action` 的显式 reload 返回 success | 探测项目没有 Hooks；真实 Hook 配置、信任和启停仍需要真实项目验收，但设置页不再以 Soon 伪装可用性 |

## 2026-07-24 · 锁定源码内核可构建性

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 源码与补丁来源 | `scripts/sync-grok-kernel-source.sh && scripts/verify-grok-kernel-source.sh && scripts/verify-grok-kernel-patches.sh` | 2026-07-24 通过：上游 `xai-org/grok-build` 的锁定提交 `a5727c5960452e7527a154b25cb5bf00cda0545e` 干净；记录的补丁可干净应用 | `vendor/grok-build` 是本地忽略的构建输入，不作为 gorkX 仓库副本发布 |
| 源码构建与 ACP | `CARGO_TARGET_DIR=/private/tmp/gorkx-kernel-source-target scripts/build-grok-kernel.sh /private/tmp/gorkx-kernel-source-build/grok && node scripts/verify-grok-acp.mjs /private/tmp/gorkx-kernel-source-build/grok` | 2026-07-24 通过：源码构建产物报告 `grok 0.2.110 (a5727c5)`，并通过无认证 ACP initialize；源码生成的 LICENSE 与 THIRD-PARTY-NOTICES 分别和 App 资源逐字节一致 | 构建二进制 SHA-256 与当前包内二进制不同，故不声称字节级可复现；此门禁不包含登录、真实模型请求或 macOS 安装验收 |
| 一键复跑入口 | `scripts/verify-grok-kernel-build.sh [output-path]` | 已加入：依次验证锁定源码、补丁、源码构建、版本和无认证 ACP | 首次运行需要 Rust、Cargo、dotslash，且会编译上游内核；不会替换 App 资源或生成发行物 |
| 桌面沙箱配置 | `cd apps/desktop && npx tsc --noEmit && cd src-tauri && cargo test && cargo check` | 2026-07-24 通过：新增 App-owned `[sandbox].profile` 的内置 profile 选择器；Rust 测试确认只替换 sandbox 段并保留模型/子代理配置，且 ACP 启动时会规范化项目 cwd，49 项测试全部通过 | 此编译级证据证明配置与 ACP 启动 cwd 已接线；每个 macOS profile 的实际文件/网络阻断行为仍属于干净 macOS 真实项目验收 |

## 仍未通过的发布阻断项

1. 一台没有既有 Grok 数据的 macOS：只安装 gorkX → App 内登录 → 真实项目首轮 → 退出重开恢复。
2. 两条用户授权的真实 Provider：连接测试 → 会话选中 → 真实回复，并保留脱敏记录。
3. 上述真实项目会话中的分叉、三种回退范围、冲突拒绝、计划批准和工具审批人工走查。

因此，当前证据只支持继续开发和本地验证；**不支持创建 tag、GitHub Release 或 DMG 发行。**
