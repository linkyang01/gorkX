# 本地验收证据台账

本文件记录可复跑的本地验收，不将单机通过扩大解释为发布或完整端到端验收。
发布门槛仍以 [NEXT_RELEASE_GATES.md](NEXT_RELEASE_GATES.md) 为准。

## 2026-07-26 · 受控内核 0.2.112 与成果中心回归

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 当前受控内核 | `apps/desktop/src-tauri/resources/grok --version` | 通过：当前应用资源为 `grok 0.2.112 (47348d1)` | 版本号不替代登录、实际模型回复或 macOS 安装验收 |
| GitHub 浏览器授权与连接测试 | 设置 → Git → “连接 GitHub” → GitHub 官方 Device Flow → “验证连接” | 通过：用户在 GitHub 网页确认后，gorkX 自动完成 Device Flow、将授权保存到 macOS Keychain，并以账号 `linkyang01` 成功完成 GitHub API 连接验证。 | 未读取或写入任何仓库；公开仓库的 PR / Checks / 评论读取、远端写入逐次确认、断开和 GitHub 侧撤销仍是独立验收项。 |
| 真实 ACP 对话与两步回退 | 在隔离的 App 登录副本和公开 Git 项目副本中运行：`verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --resource --rewind-execute` | 通过：包内 `grok 0.2.112 (47348d1)` 完成 cached-token 认证、session new/load、真实本地资源附件请求、第二轮模型请求；`conversation_only` 的 `force=false` 预览无冲突，随后经显式 `force=true` 成功提交并可重载同一会话；Hooks、Worktree list、子代理 list_running 控制路由也通过 | 仅使用一次性认证副本和临时公开项目；不等同于干净 Mac 安装、真实麦克风听写、真实子代理委派或第三方 Provider 回答。认证副本与项目副本在验收后删除。 |
| 原生会话重命名 | 在一次性 App 登录副本和公开 Git 项目副本中运行：`verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --session-controls` | 通过：包内内核接受 `_x.ai/session/rename`，为一次性 session 写入标题并返回成功；同次验证 durable fork、检查点列表、Hooks、Worktree list、子代理 list_running。桌面侧优先标准路由，只在 `Method not found` 时兼容该运行时路由。 | 临时认证与项目副本均在测试后删除；离线任务的本地标题仍是明确的持久化回退，不把兼容路由扩大为远端协作验收。 |
| 桌面回退确认语义 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle && npm run build:app`；`verify-macos-app-bundle.sh …/gorkX.app` | 通过：桌面端把内核 `force=false` 正确解释为无写入预览；无冲突时由已确认的恢复动作提交 `force=true`，冲突时列出文件并要求第二次勾选确认。前端生产包、App-only bundle 和包内内核/许可证检查均通过 | 本项验证桌面协议调用和打包，不替代真实项目中“外部修改冲突”的人工交互验收。 |
| 无认证 ACP / 安全启动选项 / 原生语音路由 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --voice-controls --client-fs-write --disable-web-search` | 通过：ACP initialize 接受 Full 任务才会声明的客户端受限文件写能力和关闭网页研究标志；`_x.ai/voice/start`、`stop`、`shutdown` 都抵达原生会话守卫 | 使用保证不存在的会话，因此不申请麦克风权限、不采集/上传音频、不发送模型提示词，也不验证真实听写 |
| 认证态会话与扩展控制 | 使用 App 登录副本创建一次性 `GROK_HOME` 与项目：`verify-grok-acp.mjs … --authenticated --session-info --session-controls --runtime-controls --subagent-controls --hooks-controls --voice-controls --client-fs-write --disable-web-search` | 通过：cached-token 认证、session new/load/Plan mode、token-free session info、持久化分叉、检查点读取、会话列表/删除、模型重载、Hooks reload/list、子代理 list/get/cancel，以及原生语音控制路由均通过 | 不发送模型提示词；测试只对缺失子代理和无 Hook fixture 做路由控制验证，不证明实际模型委派、Hook 执行或语音转写 |
| 隔离 Worktree / 自定义模型 | 在一次性单文件 Git fixture 与 App 登录副本中执行：`verify-grok-acp.mjs … --authenticated --custom-model --worktree` | 通过：临时 `[model.*]` 配置被 session/new 公告并经 `session/set_model` 选中；`_x.ai/git/worktree/create` 返回位于临时 home 的实际 Worktree 路径 | 不请求该自定义模型；Worktree 前置条件是有效 Git 仓库与至少一个提交，全部 fixture 和认证副本均在测试后删除 |
| 本次成果中心 | `cd apps/desktop && ./node_modules/.bin/tsc --noEmit && npm run verify:web-bundle`；`cd src-tauri && cargo check && cargo test` | 通过：任务明确回传且经工作区校验的成果按文档、图片、音视频和其他文件分组为可打开卡片；前端生产包通过，Rust 56 项测试通过 | 不扫描项目推测成果；不证明模型必然回传附件，且不替代实际任务的人工验收 |
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
| 旁路提问 `/btw` | 同上追加 `--btw` | 已提供独立 acceptance gate：它要求 `x.ai/btw` 返回精确的 `answer` 字段，而非普通 prompt 确认；本轮未执行，以免在已知余额耗尽时重复发起计费请求 | 内核 0.2.110 源码与客户端均使用 `x.ai/btw`；余额恢复后需在隔离会话运行该门禁，验证回答不进入主会话记录 |
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
| 会话认证来源 ACP 探测 | `GORKX_ACP_TEST_HOME=… GORKX_ACP_TEST_CWD=… node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --session-info` | 待本次受控内核重建后复跑：应在隔离认证会话返回 OAuth/API Key/外部/未登录之一与 `account`/`models`，并拒绝任何令牌内容 | 已登录 OAuth/API Key 的人工观察仍是发布验收项；桌面只显示类别并跳转到本地账户或模型设置 |
| 原生语音 ACP 控制面 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --voice-controls` | 2026-07-24 通过：实际应用资源 `grok 0.2.111 (69f0ba8)` 完成 ACP initialize，并令 `_x.ai/voice/start`、`stop`、`shutdown` 分别抵达新内核的原生语音会话守卫 | 该门禁使用不存在的会话 ID，因此不会触发 macOS 麦克风授权、不会启动采集、不会上传音频或发送模型请求；仍需在有授权的 macOS 上人工验证一次真实转写、草稿写入与用户自行发送 |
| v0.4.3 DMG 安装包 | `npm run tauri build`；只读挂载 DMG 后执行 `verify-macos-app-bundle.sh` 和 `verify-grok-acp.mjs --voice-controls` | 2026-07-24 通过：`gorkX_0.4.3_aarch64.dmg` 可只读挂载，包内 `grok 0.2.111 (69f0ba8)`、LICENSE 与 NOTICE 完整；原生语音 start/stop/shutdown 路由通过。SHA-256：`12ed907987898890659f0de8f22fcbbf0f110bc185ab76d2e16ebb3725593047` | 不替代真实登录、真实语音转写和真实 provider 回复的人工走查 |
| 首页办公工作流 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle` | 2026-07-24 通过：中英文首页的阅读总结、报告、调研、项目计划和开发卡片均将本地化自然语言 brief 填入可编辑输入框；用户可增补材料后显式发送，生产包首屏 JS gzip 97,731 / 512,000 bytes，懒加载边界保持 | 不发送模型提示词；实际内容质量属于用户任务使用时的内核/模型行为 |
| 独立网页资料预览 | `cd apps/desktop && npx tsc --noEmit && npm run build:app`；本机新构建 App 的设置 → 浏览器 → 打开预览 | 2026-07-24 通过：设置页仅接受带 hostname 的 HTTP(S) 链接；补齐 Tauri `core:webview:allow-create-webview-window` ACL 后，`https://example.com` 实际打开独立 `gorkX · Web preview` 原生窗口并加载页面。网页资料与 Agent 的 MCP Chrome profile、gorkX 凭据桥均隔离 | 此门禁不代表网页可被 Agent 读取或控制；Agent 浏览能力仍经 Playwright MCP 与其自身诊断验证 |
| 账户状态桌面引导 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle && npm run build:app`；本机新构建 App 打开账户菜单 | 2026-07-24 通过：账户菜单在额度不可用时显示“请在「设置 → 账户」中登录后查看账户信息。”，未出现 `grok login` 或其它终端命令；未点击登录，也未发送模型请求 | 未覆盖浏览器登录/重新认证本身；该验证只覆盖账户状态的桌面提示与安全导航 |
| ACP 客户端文本写入 | `cd apps/desktop/src-tauri && cargo test && cargo check`；`node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --client-fs-write` | 2026-07-24 通过：52 项 Rust 测试包含项目内原子替换、`..` 越界拒绝与符号链接拒绝；锁定内核在无认证 initialize 中接受 Full 任务才会声明的 `writeTextFile` 能力 | 门禁不创建会话或写项目文件；真实模型回合仍需有额度账号。Default/Auto 任务不宣告客户端写入能力 |
| 本地任务与会话搜索 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle && npm run build:app`；`cd src-tauri && cargo test && cargo check`；本机新构建 App 点击侧栏“搜索全部任务” | 2026-07-25 通过：第 53 项 Rust 测试覆盖标题、中文对话、跨项目和归档任务检索；实际 UI 以“读取”命中任务标题与已保存对话内容，点击后恢复原项目及完整本地快照 | 不扫描项目文件、附件、用户 CLI home，也不发送模型提示词；只检索 gorkX SQLite 中的自有任务与最近快照 |

## 发布后的真实体验验收项

1. 一台没有既有 Grok 数据的 macOS：只安装 gorkX → App 内登录 → 真实项目首轮 → 退出重开恢复。
2. 两条用户授权的真实 Provider：连接测试 → 会话选中 → 真实回复，并保留脱敏记录。
3. 上述真实项目会话中的分叉、三种回退范围、冲突拒绝、计划批准和工具审批人工走查。

以上项目不以构建或路由门禁替代；它们是后续版本体验完善与回归验收的依据。v0.4.3 已发布时，只对本文件列出的构建、包结构和 ACP 路由证据作出声明，不将其扩大为全功能端到端验收。
