# 本地验收证据台账

本文件记录可复跑的本地验收，不将单机通过扩大解释为发布或完整端到端验收。
发布门槛仍以 [NEXT_RELEASE_GATES.md](NEXT_RELEASE_GATES.md) 为准。

## 2026-07-31 · Grok Build 最新锁定提交复核

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 上游源码与补丁 | `scripts/verify-grok-kernel-patches.sh vendor/grok-build` | 通过：锁定提交 `5da6962e4adb9c857f3def762542b52b4ec3e522`（Grok Build 0.2.112），0001–0004 均可在干净 worktree 顺序应用 | `vendor/grok-build` 为本地忽略的构建输入；不把上游源码复制进 gorkX 仓库 |
| 最新内核编译 | `cargo check -p xai-grok-shell -p xai-grok-pager-bin`；`cargo build --release -p xai-grok-pager-bin` | 通过：完整补丁组合可编译，release 二进制成功生成；许可证与第三方声明哈希与锁文件一致 | 未替代 macOS 签名、公证和全新机器安装验收 |
| ACP 运行时 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok` | 通过：更新后的包内 `grok 0.2.112 (5da6962)` 完成 ACP initialize | 这是无认证能力门禁；真实登录、额度、模型回复和麦克风听写仍需人工验收 |
| App-only 包 | `cd apps/desktop && npm run build:app`；`scripts/verify-macos-app-bundle.sh …/gorkX.app` | 通过：重新构建的 arm64 App 包含 `grok 0.2.112 (5da6962)`、许可证、NOTICE 与隔离 `GROK_HOME` | 未生成 DMG、未签名/公证，也不替代干净 Mac 安装验收 |
| 原生语音适配 | ACP `_x.ai/voice/start|stop|shutdown` 路由编译并保留，沿用 Grok Build 自带低内存 macOS voice pipeline | 通过：语音适配在最新上游 API 上编译并进入包内资源 | 本次不触发麦克风 TCC、不采集或上传音频；真实转写仍需用户授权后的 macOS 验收 |

## 2026-07-31 · 桌面动作原生 ACP 化复核

| 范围 | 命令或步骤 | 结果 | 边界 |
|---|---|---|---|
| Feedback 桌面入口 | `+` 菜单 → “发送反馈”；`AcpClient.sendFeedback()` → `_x.ai/feedback` | 通过：按钮不再把 `/feedback ...` 当作会话提示发送，改为 Grok Build 原生反馈扩展；提交成功后只在本地会话显示确认，不污染模型对话 | 反馈是否上报到远端由 Grok Build 账户/反馈配置决定；本次未伪造反馈内容或远端统计 |
| Recap 桌面入口 | `+` 菜单 → “总结本次会话”；`AcpClient.requestRecap()` → `_x.ai/recap`；实际包内二进制缺失会话探针 | 通过：参数按 0.2.112 的 `sessionId` 契约发送，路由抵达真实会话守卫；异步 `session_recap` / `session_recap_unavailable` 被桌面解析并显示在当前会话 | 回顾是内核异步模型调用；未认证/无真实会话探针不发送模型请求，真实摘要质量仍属于账号和模型行为 |
| 桌面回归 | `cd apps/desktop && npx tsc --noEmit && npm run test:stages && npm run build`；`cd apps/desktop/src-tauri && cargo test && cargo check`；`scripts/verify-grok-kernel-patches.sh`；无认证 ACP initialize | 通过：前端、80 项 Rust 测试、内核补丁 series、包内 ACP initialize 均通过 | 未生成新 DMG、未打 tag、未发布；仅更新源码与证据台账 |

## 2026-07-26 · 受控内核 0.2.112 与成果中心回归

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 当前受控内核 | `apps/desktop/src-tauri/resources/grok --version` | 通过：当前应用资源为 `grok 0.2.112 (47348d1)` | 版本号不替代登录、实际模型回复或 macOS 安装验收 |
| 正式安装的数据隔离 | `paths::grok_home` 仅在 debug 构建接受 `GROK_HOME` / `GORKX_GROK_HOME` / 系统 CLI home 覆盖；`cargo test && cargo check --release`；`npm run build:app` 后运行 `verify-macos-app-bundle.sh` | 通过：正式构建始终将 Grok 认证、会话与配置置于 `~/Library/Application Support/gorkX/grok-home`，不会继承用户 CLI 的 `~/.grok` 或启动环境指定的外部数据目录；重建 App 的包内内核、许可证和隔离 `GROK_HOME` 也通过，版本 `0.2.112 (47348d1)`。 | 证明发行包的数据归属与包结构，不替代全新 macOS 的网页登录、真实对话和退出重开人工闭环。 |
| 内核 HOME 发现隔离 | 先以仅隔离 `GROK_HOME` 运行包内 `grok inspect --json`，再以一次性 `HOME` + `GROK_HOME` 运行同一命令；`paths::tests::engine_child_uses_only_app_owned_home_locations` | 通过：前者实际发现用户 `~/.agents/skills`，证明仅设置 `GROK_HOME` 不足；后者 `skills` 为空。gorkX 现为每个 Grok Build 子进程设置 App-owned `HOME`，并由第 65 项 Rust 测试锁定该环境。 | 子进程仍可通过受控 PATH 调用系统开发工具；这不是读取用户的 Grok/Agent 配置。 |
| Computer Hub 桌面入口 | 包内 `grok workspace --help`、`start/status/pause --help`；在隔离未登录 HOME 中运行 `workspace status --json`；gorkX 固定命令白名单测试 | 通过：0.2.112 实际提供 workspace start / pause / resume / stop / restart / status，且命令受本地 `GROK_WORKSPACE_COMMAND=1` 与服务端账户开关双重控制。gorkX 仅提供状态读取和当前选中项目的固定动作；开始、恢复、暂停、断开均先要求本地确认。 | 隔离未登录状态返回“无法加载设置”，故本轮不宣称已有可用 Hub 或远端电脑控制；真实账号是否获服务端开启及 Hub 的实际操作仍待人工验收。 |
| 托管配置预览与受控安装 | 包内 `grok setup --help`；`grok_admin` 固定白名单与前端环境面板 | 通过：0.2.112 的 `setup --json` 明确声明只打印获取的配置、不写入内核 home。gorkX 必须先成功预览才启用安装按钮，安装前有第二次本地确认，且后端只接受精确的 `setup` 或 `setup --json`；没有任意参数入口。 | 未使用真实账户发起配置拉取或安装；远端服务的可用性、返回内容和安装后的实际效果仍需要登录后的人工阅读。 |
| GitHub 浏览器授权与连接测试 | 设置 → Git → “连接 GitHub” → GitHub 官方 Device Flow → “验证连接” | 通过：用户在 GitHub 网页确认后，gorkX 自动完成 Device Flow、将授权保存到 macOS Keychain，并以账号 `linkyang01` 成功完成 GitHub API 连接验证。 | 未读取或写入任何仓库；公开仓库的 PR / Checks / 评论读取、远端写入逐次确认、断开和 GitHub 侧撤销仍是独立验收项。 |
| GitHub 当前仓库 PR 只读 | 选择 `/Users/link/projects/gorkX` → Review → 远端 → “读取开放 PR” | 通过：gorkX 从当前 `origin` 解析 GitHub 仓库并实际读取开放 PR，返回“没有开放的 PR”。未发起任何远端写操作。 | 当前仓库没有 PR，故 Checks 与评论详情未被调用；需在有开放 PR 的公开测试仓库继续验证详情读取和逐次确认的写操作。 |
| GitHub 公开 PR 详情只读 | 一次性 Git fixture 的 `origin=https://github.com/microsoft/vscode.git` → Review → 远端 → “读取开放 PR” → 对同一开放 PR 分别点“读取检查”和“读取评论” | 通过：实际读取到开放 PR 列表；Checks 返回具体 CI 状态（含 success、in_progress 与 failure）；评论读取成功并如实显示该 PR“没有返回讨论或审阅评论”。未创建评论、PR 或远端分支。fixture 已删除。 | 证明公开仓库 PR、Checks 与评论详情的按需只读链路；断开本地 Keychain 凭据、GitHub 侧撤销和每次远端写入的确认闭环仍未验收。 |
| 真实 ACP 对话与两步回退 | 在隔离的 App 登录副本和公开 Git 项目副本中运行：`verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --resource --rewind-execute` | 通过：包内 `grok 0.2.112 (47348d1)` 完成 cached-token 认证、session new/load、真实本地资源附件请求、第二轮模型请求；`conversation_only` 的 `force=false` 预览无冲突，随后经显式 `force=true` 成功提交并可重载同一会话；Hooks、Worktree list、子代理 list_running 控制路由也通过 | 仅使用一次性认证副本和临时公开项目；不等同于干净 Mac 安装、真实麦克风听写、真实子代理委派或第三方 Provider 回答。认证副本与项目副本在验收后删除。 |
| 原生会话重命名 | 在一次性 App 登录副本和公开 Git 项目副本中运行：`verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --session-controls` | 通过：包内内核接受 `_x.ai/session/rename`，为一次性 session 写入标题并返回成功；同次验证 durable fork、检查点列表、Hooks、Worktree list、子代理 list_running。桌面侧优先标准路由，只在 `Method not found` 时兼容该运行时路由。 | 临时认证与项目副本均在测试后删除；离线任务的本地标题仍是明确的持久化回退，不把兼容路由扩大为远端协作验收。 |
| 桌面回退确认语义 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle && npm run build:app`；`verify-macos-app-bundle.sh …/gorkX.app` | 通过：桌面端把内核 `force=false` 正确解释为无写入预览；无冲突时由已确认的恢复动作提交 `force=true`，冲突时列出文件并要求第二次勾选确认。前端生产包、App-only bundle 和包内内核/许可证检查均通过 | 本项验证桌面协议调用和打包，不替代真实项目中“外部修改冲突”的人工交互验收。 |
| 无认证 ACP / 安全启动选项 / 原生语音路由 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --voice-controls --client-fs-write --disable-web-search` | 通过：ACP initialize 接受 Full 任务才会声明的客户端受限文件写能力和关闭网页研究标志；`_x.ai/voice/start`、`stop`、`shutdown` 都抵达原生会话守卫 | 使用保证不存在的会话，因此不申请麦克风权限、不采集/上传音频、不发送模型提示词，也不验证真实听写 |
| 认证态会话与扩展控制 | 使用 App 登录副本创建一次性 `GROK_HOME` 与项目：`verify-grok-acp.mjs … --authenticated --session-info --session-controls --runtime-controls --subagent-controls --hooks-controls --voice-controls --client-fs-write --disable-web-search` | 通过：cached-token 认证、session new/load/Plan mode、token-free session info、持久化分叉、检查点读取、会话列表/删除、模型重载、Hooks reload/list、子代理 list/get/cancel，以及原生语音控制路由均通过 | 不发送模型提示词；测试只对缺失子代理和无 Hook fixture 做路由控制验证，不证明实际模型委派、Hook 执行或语音转写 |
| 隔离 Worktree / 自定义模型 | 在一次性单文件 Git fixture 与 App 登录副本中执行：`verify-grok-acp.mjs … --authenticated --custom-model --worktree` | 通过：临时 `[model.*]` 配置被 session/new 公告并经 `session/set_model` 选中；`_x.ai/git/worktree/create` 返回位于临时 home 的实际 Worktree 路径 | 不请求该自定义模型；Worktree 前置条件是有效 Git 仓库与至少一个提交，全部 fixture 和认证副本均在测试后删除 |
| 0.2.112 自定义模型 ACP 复验 | 临时复制 App 登录凭据至一次性目录，并运行：`verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --custom-model` | 通过：`grok 0.2.112 (47348d1)` 在新建 ACP 会话中实际公告临时 `[model.gorkx-acp-custom-smoke]`，随后成功执行 `session/set_model(gorkx-acp-custom-smoke)`，并可重载会话。临时模型端点固定为不可达的 `127.0.0.1:9`，未发送任何推理请求。 | 证明 gorkX 的 App-owned 模型配置会被该内核识别并可切换；不证明用户自己的第三方端点、密钥、余额或生成结果。真实第三方回答仍需在设置中安全配置后单独验收。 |
| 诊断包远端发送门禁 | 包内 `grok trace --help`；`grok_admin` 精确参数白名单和 `+` 菜单确认流 | 通过：0.2.112 支持不带 `--local` 的诊断上传；gorkX 只允许精确 `trace <UUID> --json`，并在实际调用前显示任务诊断可能被发送的明确说明。导出本地包与发送支持端是两个独立动作。 | 未上传任何真实任务诊断；服务端响应、支持链接和具体数据处理以用户确认后的 Grok Build 服务为准。 |
| 本次成果中心 | `cd apps/desktop && ./node_modules/.bin/tsc --noEmit && npm run verify:web-bundle`；`cd src-tauri && cargo check && cargo test` | 通过：任务明确回传且经工作区校验的成果按文档、图片、音视频和其他文件分组为可打开卡片；前端生产包通过，Rust 56 项测试通过 | 不扫描项目推测成果；不证明模型必然回传附件，且不替代实际任务的人工验收 |
| 会话丰富结果展示 | `cd apps/desktop && npx tsc --noEmit && npm run test:stages && npm run build`；`conversationPresentation.test.ts` | 2026-07-29 通过：普通用户回合自动携带非命令式展示偏好；保留原始 Markdown 表格并对小型两列数值比较自动附图；安全的 `chart`、`mermaid` 与 `diff` fenced block 分别进入本地受限 SVG/HTML 渲染；`choices` / `options` block 只在模型明确输出时成为点击后才发送的选择按钮。 | 未发送模型提示词制造样本；渲染不执行 HTML、脚本、远程资源或任意 Mermaid 指令。模型仍决定何时使用表、图或选择，不保证每条回复都可视化。 |
| 账户状态与额度真实窗口 | `cd apps/desktop && npm run build:app`；打开本地 `.app` 并查看账户菜单 | 已纠正：CLI 账单响应中的 `used/monthlyLimit` 是另一类月度/额外额度，不能映射为 SuperGrok 网页的每周限额。gorkX 仅接受 API 明确提供的 `creditUsagePercent` 或 Grok Build 产品百分比；缺失时不保存、换算或显示网页截图值，而是提供一键打开已登录 Grok 官方使用量页的入口 | 官方网页的 SuperGrok 周额度是当前权威来源；当前 CLI/ACP 没有提供该字段。桌面端只有在未来收到对应实时字段时才显示百分比。 |
| 每日 Token 本地记录 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle`；`cd src-tauri && cargo check && cargo test`；本机新构建 App 打开“设置 → 使用情况和计费” | 通过：界面显示“今日本地 Token 用量”，在尚未收到 ACP token 计数时诚实显示为空；0.2.112 的 ACP 协议声明每个 `PromptResponse` 含 `usage.totalTokens/inputTokens/outputTokens/cachedReadTokens/thoughtTokens`。gorkX 仅在该回合完成响应出现时按消息 ID 去重写入本机 SQLite，快照只更新当前上下文显示。前端构建通过，Rust 57 项测试通过 | 未发起模型提示以制造计数；首次真实任务收到 PromptResponse usage 后才会形成今日累计。该数不是订阅额度、账单金额或估算值 |

## 2026-07-23 · 桌面端本地构建与浏览器链路

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| TypeScript / 前端生产包 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle` | 2026-07-23 通过；首屏 JS gzip 91,803 / 512,000 bytes | 不代表运行中的 Grok 真实对话 |
| Rust | `cd apps/desktop/src-tauri && cargo test && cargo check` | 2026-07-23 通过；45 项单元测试与 `cargo check` 均通过 | 不代表 macOS TCC 或用户登录 |
| 浏览器动作 | `node scripts/verify-playwright-mcp.mjs --origin https://example.com` | 通过；隔离 Playwright MCP 发现 24 个工具，并成功 `browser_navigate` 到 `https://example.com` | 不发送模型提示词、不使用用户 Chrome profile；不代表 Grok 模型已在真实任务中调用浏览器 |
| App-only 包 | `cd apps/desktop && npm run build:app` | 2026-07-24 通过；只构建 `.app`，未生成 DMG | 不代表签名、公证或发行 |
| 包内内核 | `scripts/verify-macos-app-bundle.sh apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app` | 2026-07-24 通过；包内 `grok`、许可证与 NOTICE、隔离 `GROK_HOME` 完整，版本为 `grok 0.2.111 (69f0ba8)` | 不是干净 Mac 安装、App 内登录、真实项目首轮与重开续聊的人工闭环 |
| 无认证 ACP | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok` | 2026-07-24 通过 ACP initialize，受控资源内核为 `grok 0.2.111 (69f0ba8) [alpha]` | 认证、会话与扩展需要使用显式临时 home 的独立门禁 |
| 隔离 Worktree / 自定义模型 ACP | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --worktree --custom-model` | 2026-07-23 通过：cached-token 认证、session/new/load、临时自定义模型公告与 `session/set_model`、Plan mode、Worktree list 与 create；实际创建于临时 home 的 worktrees 目录 | 不发送模型提示，也不构成真实 provider 回复验收；Hooks 与子代理控制由后续独立 `_x.ai/*` 门禁覆盖 |
| 会话控制 ACP 探测 | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --session-controls` | 2026-07-23 通过：`_x.ai/session/fork` 创建并加载 durable 子会话、原会话保持可加载；`_x.ai/rewind/points` 返回原生检查点列表。标准 `x.ai/*` 拼写返回 `Method not found`，客户端已改为运行时实际暴露的兼容路由 | 不发送模型提示；完整回退执行需要至少两个已持久化的真实回合，受当前账号余额阻断 |
| 真实回退执行 | 同上追加 `--resource --rewind-execute` | 2026-07-23 未通过：隔离请求收到 Grok Build `402 Payment Required`（余额耗尽）；在此之前已证明路由可达和检查点读取 | 不把该失败写成回退成功；恢复可用余额后，需用隔离两轮会话复跑，验证 `conversation_only`、`force: false` 与 session reload |
| 运行中旁问 `/btw` | `GROK_HOME=<临时认证 home> node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --btw` | 2026-07-29：`initialize`、缓存 OAuth、`session/new`、`session/load` 通过；`x.ai/btw` 与 `_x.ai/btw` 均返回 `Method not found` | 包内 `0.2.112 (47348d1)` stdio 当前没有可用旁问 ACP 接口。桌面端已移除独立旁问入口，运行中补充统一进入本地下一回合队列；不把旧源码线索当作可用功能。 |
| Agent Profile ACP 创建 | 临时复制 App 登录凭据至一次性认证目录，并运行：`GORKX_ACP_TEST_AUTH_DIR=<temp> GORKX_ACP_TEST_PROJECT_DIR=<temp> node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --agent-profile`，以及 `--agent-profile-name explore` | 2026-07-29：包内 `grok 0.2.112 (47348d1)` 完成 cached-token 认证，接受 `session/new` 的 `_meta.agentProfile` 便携定义和内置 `explore` 名称，随后均可正常 `session/load` 与 `session/set_mode(plan)`。桌面端新建规划任务使用前者；“探索项目”使用后者。 | 未发送模型提示词；只证明会话创建契约和桌面接线，不把 Profile 提示词质量或任意自定义 Profile 文件解析宣传为已验收能力。临时认证副本与项目目录已删除。 |
| 子代理控制 ACP 探测 | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --subagent-controls` | 2026-07-23 通过：`_x.ai/subagent/list_running`、`get`、`cancel` 路由均可达；标准 `x.ai/*` 拼写不被当前 stdio 接受，客户端已改为兼容路由 | 探测只使用不存在的子代理 ID，不会启动或取消真实工作；真实委派/取消闭环仍需要有效账户余额验收 |
| Hooks 控制 ACP 探测 | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --hooks-controls` | 2026-07-23 通过：`_x.ai/hooks/list` 返回 Hook 快照，`_x.ai/hooks/action` 的显式 reload 返回 success | 探测项目没有 Hooks；真实 Hook 配置、信任和启停仍需要真实项目验收，但设置页不再以 Soon 伪装可用性 |

## 2026-07-24 · 锁定源码内核可构建性

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 源码与补丁来源 | `scripts/sync-grok-kernel-source.sh && scripts/verify-grok-kernel-source.sh && scripts/verify-grok-kernel-patches.sh` | 2026-07-24 通过：上游 `xai-org/grok-build` 的锁定提交 `69f0ba880aa98f55e3ac1dcc570e2f332f825fe2` 干净；记录的补丁可干净应用 | `vendor/grok-build` 是本地忽略的构建输入，不作为 gorkX 仓库副本发布 |
| 源码构建与 ACP | `scripts/verify-grok-kernel-build.sh` 与 `scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok` | 2026-07-24 通过：干净临时 worktree 的完整构建与资源构建均报告 `grok 0.2.111 (69f0ba8) [alpha]`，并分别通过无认证 ACP initialize；源码生成的 LICENSE 与 THIRD-PARTY-NOTICES 分别和 App 资源一致 | 构建二进制 SHA-256 与旧包内二进制不同，故不声称字节级可复现；此门禁不包含登录、真实模型请求或 macOS 安装验收 |
| 一键复跑入口 | `scripts/verify-grok-kernel-build.sh [output-path]` | 已加入：依次验证锁定源码、补丁、源码构建、版本和无认证 ACP | 首次运行需要 Rust、Cargo、dotslash，且会编译上游内核；不会替换 App 资源或生成发行物 |
| 桌面沙箱配置 | `cd apps/desktop && npx tsc --noEmit && cd src-tauri && cargo test && cargo check` | 2026-07-24 通过：新增 App-owned `[sandbox].profile` 的内置 profile 选择器；Rust 测试确认只替换 sandbox 段并保留模型/子代理配置，且 ACP 启动时会规范化项目 cwd，49 项测试全部通过 | 此编译级证据证明配置与 ACP 启动 cwd 已接线；每个 macOS profile 的实际文件/网络阻断行为仍属于干净 macOS 真实项目验收 |
| Grok Build 诊断与修复 | 设置 → 环境 → 运行诊断；`apps/desktop/src-tauri/resources/grok doctor --json` | 2026-07-24 通过：桌面端合并 app-owned 预检与 0.2.111 内核 JSON findings；自动修复按钮仅接受内核当次广告的 fix ID，后端再次核验；50 项 Rust 测试、前端构建与 app-only bundle 均通过 | 本机本次诊断没有自动修复项，故不执行会修改终端/配置的 `doctor fix`；实际修复需在出现内核广告的项目上由用户明确点击确认 |
| 原生语音 ACP 控制面 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --voice-controls` | 2026-07-24 通过：实际应用资源 `grok 0.2.111 (69f0ba8)` 完成 ACP initialize，并令 `_x.ai/voice/start`、`stop`、`shutdown` 分别抵达新内核的原生语音会话守卫 | 该门禁使用不存在的会话 ID，因此不会触发 macOS 麦克风授权、不会启动采集、不会上传音频或发送模型请求；仍需在有授权的 macOS 上人工验证一次真实转写、草稿写入与用户自行发送 |
| 原生语音 ACP 控制面（锁定内核复核） | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --voice-controls` | 2026-07-29 通过：应用资源 `grok 0.2.112 (47348d1)` 完成 ACP initialize；`_x.ai/voice/start`、`stop`、`shutdown` 均抵达原生会话守卫 | 仍使用保证不存在的会话 ID：不触发 macOS 麦克风授权、不采集或上传音频、不发送模型提示词。真实听写、编辑草稿和用户手动发送仍保留为 macOS 人工验收门槛。 |
| v0.4.3 DMG 安装包 | `npm run tauri build`；只读挂载 DMG 后执行 `verify-macos-app-bundle.sh` 和 `verify-grok-acp.mjs --voice-controls` | 2026-07-24 通过：`gorkX_0.4.3_aarch64.dmg` 可只读挂载，包内 `grok 0.2.111 (69f0ba8)`、LICENSE 与 NOTICE 完整；原生语音 start/stop/shutdown 路由通过。SHA-256：`12ed907987898890659f0de8f22fcbbf0f110bc185ab76d2e16ebb3725593047` | 不替代真实登录、真实语音转写和真实 provider 回复的人工走查 |
| 首页办公工作流 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle` | 2026-07-24 通过：中英文首页的阅读总结、报告、调研、项目计划和开发卡片均将本地化自然语言 brief 填入可编辑输入框；用户可增补材料后显式发送，生产包首屏 JS gzip 97,731 / 512,000 bytes，懒加载边界保持 | 不发送模型提示词；实际内容质量属于用户任务使用时的内核/模型行为 |
| 独立网页资料预览 | `cd apps/desktop && npx tsc --noEmit && npm run build:app`；本机新构建 App 的设置 → 浏览器 → 打开预览 | 2026-07-24 通过：设置页仅接受带 hostname 的 HTTP(S) 链接；补齐 Tauri `core:webview:allow-create-webview-window` ACL 后，`https://example.com` 实际打开独立 `gorkX · Web preview` 原生窗口并加载页面。网页资料与 Agent 的 MCP Chrome profile、gorkX 凭据桥均隔离 | 此门禁不代表网页可被 Agent 读取或控制；Agent 浏览能力仍经 Playwright MCP 与其自身诊断验证 |
| 账户状态桌面引导 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle && npm run build:app`；本机新构建 App 打开账户菜单 | 2026-07-24 通过：账户菜单在额度不可用时显示“请在「设置 → 账户」中登录后查看账户信息。”，未出现 `grok login` 或其它终端命令；未点击登录，也未发送模型请求 | 未覆盖浏览器登录/重新认证本身；该验证只覆盖账户状态的桌面提示与安全导航 |
| ACP 客户端文本写入 | `cd apps/desktop/src-tauri && cargo test && cargo check`；`node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --client-fs-write` | 2026-07-24 通过：52 项 Rust 测试包含项目内原子替换、`..` 越界拒绝与符号链接拒绝；锁定内核在无认证 initialize 中接受 Full 任务才会声明的 `writeTextFile` 能力 | 门禁不创建会话或写项目文件；真实模型回合仍需有额度账号。Default/Auto 任务不宣告客户端写入能力 |
| 本地任务与会话搜索 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle && npm run build:app`；`cd src-tauri && cargo test && cargo check`；本机新构建 App 点击侧栏“搜索全部任务” | 2026-07-25 通过：第 53 项 Rust 测试覆盖标题、中文对话、跨项目和归档任务检索；实际 UI 以“读取”命中任务标题与已保存对话内容，点击后恢复原项目及完整本地快照 | 不扫描项目文件、附件、用户 CLI home，也不发送模型提示词；只检索 gorkX SQLite 中的自有任务与最近快照 |

## 正式版 v1.0.0 证据索引 · 2026-07-31

> 执行方案：[`FORMAL_RELEASE_PLAN.md`](FORMAL_RELEASE_PLAN.md)。  
> 本会话触发语：`按方案做`；随后用户批准「推送远端，打包发布」。  
> **已发布：** tag `v1.0.0` · [Release](https://github.com/linkyang01/gorkX/releases/tag/v1.0.0) ·  
> 资产 `gorkX_1.0.0_aarch64.dmg` · SHA-256 `b24bd3c16a9447a36b17ecb77b5bebc320fec343a2586131a14d9df065f6f88c` · 签名 ad-hoc。

| ID | 结果 | 命令或步骤 | 边界 |
|---|---|---|---|
| R1 | 部分 | 既有包内内核隔离证据 + 本会话 `verify-grok-kernel-*` / ACP initialize | 干净机安装→登录→首任务→重开仍待 **[USER] H1** |
| R2 | 历史通过 | 见上文真实 ACP / Review / 任务链路条目 | 本会话未重复完整人工编码循环 |
| R3 | 历史通过 | fork / rewind 预览与确认条目 | 同上 |
| R4 | 未通过（诚实） | 用户未提供第三方 endpoint | 宣传不得写「多 Provider 已验收」 |
| R5 | 通过 | `cargo test`（含 Keychain/隔离）；`store` schema 仅有 ACP **用量** token 计数，无 API 密钥列；connector audit 脱敏测试 | — |
| R6 | 通过 | `FEATURES.md` / `DESKTOP_CAPABILITY_MAP.md` 写入任务工具 denylist 与 allow/deny；+ 菜单入口为真链路 | Soon 连接器仍不可执行连接 |
| R7 | 通过 | 见下表「本会话门禁」 | — |
| R8 | 通过 | `package.json` / `package-lock` / `Cargo.toml` / `Cargo.lock` gorkx / `tauri.conf.json` / `appMeta.ts` = `1.0.0`；`releaseGates.test.ts` 锁定一致性 | 候选包构建后需再验 bundle 版本字符串 |
| R9 | 通过 | `docs/RELEASE_NOTES_v1.0.0.md`；README 中英下载链与签名边界 | 下载 URL 在 tag 后才真实可点 |
| F1 | 通过 | `kernel/patches/0004-acp-agent-stdio-cli-overrides.patch` 在 series；`verify-grok-kernel-patches.sh` PASS | 资源二进制若需强制刷新：`build-grok-kernel.sh` |
| F2 | 通过 | `taskToolLimits.ts` + UI + SQLite `disallowed_tools` + reconnect 路径 | 单元测试覆盖 sanitize |
| F3 | 通过 | `taskPermissionRules.ts` + UI + SQLite `permission_rules`；拒绝 `*`/`**` 与注入字符 | Rust + TS 测试 |
| F4 | 历史通过 | 过期登录恢复既有修复与证据 | 正式版可再人工点一次 |
| F5 | 通过 | `github_disconnect` 删 Keychain；写确认含目标仓库；scope 展示；审计 connect/disconnect/write | 本会话未持用户 token 做 live 写 |
| F6 | 通过 | FEATURES / README / 发布说明边界一致 | — |
| H1 | 阻塞 | **[USER]** 干净 macOS 或书面接受开发机等价验收 | 未伪造 |
| H2 | 阻塞/放弃可选 | **[USER]** 提供 endpoint 或书面降级 | 默认 R4 未通过 |
| H3 | 阻塞 | **[USER]** 麦克风 TCC 听写 | 未伪造 |
| H4 | 可选 | **[USER]** Developer ID + 公证 | 无则 ad-hoc + README Gatekeeper 说明 |

### 本会话门禁（R7）

| 范围 | 命令 | 结果 |
|---|---|---|
| 内核源码 | `scripts/verify-grok-kernel-source.sh` | PASS · `47348d13…` |
| 补丁 series | `scripts/verify-grok-kernel-patches.sh` | PASS · 含 0001–0004 |
| ACP | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok` | PASS initialize |
| TS | `cd apps/desktop && npx tsc --noEmit` | PASS |
| Stage 测试 | `npm run test:stages` | PASS（含 taskToolLimits / taskPermissionRules / connectors） |
| Web bundle | `npm run verify:web-bundle` | PASS |
| Rust | `cd src-tauri && cargo test && cargo check` | PASS · 80 tests |
| App-only 包 | `cd apps/desktop && npm run build:app` | PASS · `gorkX.app` @ `src-tauri/target/release/bundle/macos/` · 版本 crate `gorkx v1.0.0` |
| Bundle 结构 | `scripts/verify-macos-app-bundle.sh …/gorkX.app` | PASS · arm64 · 包内 `grok 0.2.112 (47348d1)` · 隔离 `GROK_HOME` |
| 发布就绪 | `scripts/verify-release-readiness.sh` | 发版前：`releaseCandidateReady: true`；用户批准后已 ship |
| 公开发版 | `git push` · `git tag v1.0.0` · `gh release create` · DMG | 2026-07-31：main@`8471d83` · [v1.0.0](https://github.com/linkyang01/gorkX/releases/tag/v1.0.0) · DMG 挂载后 `verify-macos-app-bundle.sh` PASS · 内核 `0.2.112 (47348d1)` · **ad-hoc 非公证** |

## 发布后的真实体验验收项

1. 一台没有既有 Grok 数据的 macOS：只安装 gorkX → App 内登录 → 真实项目首轮 → 退出重开恢复。
2. 两条用户授权的真实 Provider：连接测试 → 会话选中 → 真实回复，并保留脱敏记录。
3. 上述真实项目会话中的分叉、三种回退范围、冲突拒绝、计划批准和工具审批人工走查。

以上项目不以构建或路由门禁替代；它们是后续版本体验完善与回归验收的依据。v0.4.3 已发布时，只对本文件列出的构建、包结构和 ACP 路由证据作出声明，不将其扩大为全功能端到端验收。
