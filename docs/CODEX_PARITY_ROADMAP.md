# gorkX Codex 对齐路线图（Grok Build 内核）

> 状态：执行主路线。独立运行时规范仍以 `INDEPENDENT_APP_PLAN.md` 为准。
>
> 北极星：gorkX 是可安装、可维护、以 **Grok Build fork** 为内核的桌面编码 Agent；对齐 Codex 的编码工作流，不伪装成 ChatGPT 全产品。

## 1. 产品边界

### 必须做到

- 用户只安装 gorkX；默认运行包内或 App runtime 中的 Grok Build。
- 本地项目、任务、终端、审阅、权限、记忆、工作树、扩展均可实际操作。
- Agent 推理、工具调用、Plan、Hooks、MCP 由 Grok Build 执行；桌面端不重写第二套 agent loop。
- 每项 UI 都有真实内核/本地/服务端链路；没有链路则明确说明限制。
- **第三方连接器以易用性为先**：普通用户主路径必须是“点击连接 → 官方网页/系统授权 → 回到 gorkX”，并在授权前说明数据范围与最小权限；手动 Token、URL、命令行或配置文件只能作为高级兼容入口，不能伪装成默认接入体验。

### 不把它当作 v1 承诺

- 直接复用 ChatGPT Plus/Claude Pro 网页订阅。
- 复制 OpenAI 托管云、模型、私有连接器或图像/语音产品。
- 未获用户授权的后台屏幕采集、鼠标键盘操控或仓库写入。

## 2. 当前基线（2026-07）

| 域 | 当前 | 到 Codex 工作流的缺口 |
|---|---|---|
| 独立内核 | 包内引擎、App `GROK_HOME`、Doctor、包验收；上游 commit 锁定、来源校验与源码 ACP 初始化已具备 | 缺受控 fork/mirror、补丁应用流程与完整业务 ACP 回归 |
| 日常编码 | 任务、流式 ACP、权限、终端、Review、工作树、记忆可用 | Plan/Review 的成熟度仍受内核质量影响 |
| 多模型 | API/兼容网关、Keychain、分组、连接测试及任务/会话切换可用；包内引擎已隔离验证自定义 `[model.*]` 经 ACP `session/set_model` 接受 | 缺订阅 OAuth、账号用量聚合；ChatGPT/Claude 网页订阅不冒充 API 登录 |
| Hooks/MCP | MCP/插件入口与 Playwright MCP 配置、诊断可用；**Hooks 未开放**（锁定内核 ACP 返回 `Method not found`） | 等内核提供真实 Hook 生命周期后再做列表、信任、启停与创作体验；连接器仍待产品化 |
| Browser/Computer | Playwright MCP 已在 App `GROK_HOME` 实测启动、握手并发现工具；用户可主动截图附到消息 | 浏览器任务内的目标页/动作日志/域名许可、浏览器截图流与受控桌面自动化；需有效 Grok 登录才可验证 Agent 实际调用 |
| 自动化/协作 | App 打开时的本地计划任务（App SQLite 持久化、重开补跑）；子 Agent 生命周期事件持久为父/子任务树，并有取消/快照 UI | 当前锁定内核不暴露 `x.ai/subagent/list_running`，因此**不宣称重连恢复运行中子任务**；仍缺用户可控委派契约、显式 resume、隔离策略与退出后 worker |
| 远程工程协作 | 本地 Git Review | 缺 GitHub PR、CI、评论线程与授权连接器 |

## 3. 目标架构

```text
Desktop shell (Tauri + React)
  ├─ 项目/任务/Review/Terminal/Memory/Settings
  ├─ 多 Agent 编排、任务队列、审批与审计 UI
  ├─ GitHub/Browser/Computer/Connector adapters
  └─ App SQLite + Keychain + Application Support/gorkX
                    │ ACP stdio
Grok Build fork (pinned revision + patches)
  ├─ 推理、工具调用、Plan、MCP、Hooks、worktree、sessions
  └─ app-owned GROK_HOME / env-key custom models
                    │ optional
Local worker or hosted worker
  └─ 长任务、唤醒、持续监控、远程连接器回调
```

## 4. 阶段与出口

### P0 — 内核治理与能力基线（2 周）

**工作**：建立受控的 `grok-build` fork/mirror（在其建立前明确使用 xAI 上游）、锁定 commit、补丁目录、LICENSE/NOTICE、上游同步脚本；为 ACP 初始化、会话、模型、Plan、Hooks、worktree、资源附件建立可重复 smoke suite。

**出口**：每个 gorkX 版本都可回答“内核来自哪个 commit、有哪些补丁、升级是否通过回归”；包内二进制在隔离 `GROK_HOME` 通过 ACP 对话测试。

**当前门禁命令**：`scripts/sync-grok-kernel-source.sh`、`scripts/verify-grok-kernel-source.sh`、`scripts/verify-grok-kernel-patches.sh`、`scripts/build-grok-kernel.sh <output>`、`node scripts/verify-grok-acp.mjs <output>`、`scripts/verify-macos-app-bundle.sh <app>`。锁定提交 `7cfcb20…` 已完成源码构建、隔离 ACP `initialize`，以及使用独立认证副本的认证/会话新建与恢复/Plan/worktree-list 回归；`--custom-model` 额外写入一次性 `[model.*]` 并验证 ACP 公告和 `session/set_model`，不发送模型提示词。当前受控队列包含 `0001-web-search-explicit-f32-literals.patch`：它仅消除四条 upstream future-incompatible `f32` 推断警告，完整重建未再出现该警告。构建脚本支持 `CARGO_TARGET_DIR`，可将 CI/验证产物隔离在临时目录。已使用该锁定引擎构建本地 app-only bundle；其 `Contents/Resources/grok` 为 `0.2.105 (7cfcb20)`，并通过 bundle 与 ACP 初始化门禁。此验证不等同于发布 GitHub Release。补丁队列由 `kernel/patches/series` 明确排序；构建只在临时 Git worktree 应用已验证补丁，绝不接受锁定源检出的未记录修改。认证回归加 `--worktree` 时会只在显式的临时 Git CWD 创建隔离 Worktree，并轮询内核列表确认路径真实出现；加 `--resource` 时会发送一条最小模型请求，用临时文本文件验证标准 `resource_link`，因此默认不执行且只允许在显式的可丢弃 CWD 中运行。每次受控内核构建都会同时生成上游 `LICENSE` 与完整 `THIRD-PARTY-NOTICES`，macOS bundle 验收会拒绝缺少它们的包。认证回归要求显式、独立的 `GORKX_ACP_TEST_HOME`、`GORKX_ACP_TEST_CWD` 和 `--authenticated`，脚本会拒绝标准用户 `GROK_HOME`。该内核当前不暴露 ACP Hooks API，门禁会清楚记录为 `SKIP`，不会把它计入 Hooks 能力通过。Hooks 改写仍需受控测试仓库中的人工真链路验收。

运行时不执行 `grok update`：它不能更新本仓库的 source lock，也会绕过构建与 ACP 回归门禁。设置页只报告包内内核版本；升级必须走上面的源码同步、构建和验证流程。

### P1 — 多 Agent 与任务编排（3–4 周）

**工作**：任务树、委派契约、最多 N 个并行子 Agent、取消/重试/汇总、每个子 Agent 独立 worktree/权限/日志；父任务只聚合结果。

**出口**：一个真实仓库可并行完成“探索、实现、测试、Review”，每个子任务可查看、停止、恢复；冲突写入默认不并行。

### P2 — 可恢复后台任务（3 周）

**工作**：SQLite 持久任务队列、状态机、失败退避、App 重开恢复；本地 launchd worker。当前已完成计划任务的 SQLite 迁移、重开补跑和持久化指数退避（5 分钟起、上限 6 小时），并提供用户显式开启的 macOS launchd worker。worker 每 5 分钟读取同一队列、在 Grok `plan` 权限下执行并保留本机输出；领取、租约恢复和完成写回均使用 SQLite `IMMEDIATE` 事务，因此并发 worker 会观察到已持久化租约；已认领但在 30 分钟租约内没有回报的任务会记录失败并按退避重试。它不创建交互任务，也不允许静默仓库写入。云 worker 是独立部署项，不和桌面端混淆。

**出口**：任务在 App 重启后可恢复；计划任务不再依赖窗口常驻。云模式仅在部署并授权后显示。

### P3 — GitHub 与工程协作（3–4 周）

**工作**：GitHub OAuth/App 授权、仓库/PR/Checks/评论线程读取，创建分支与 PR 前的明确确认；把本地 Review 与远端 PR 关联。当前已提供用户手动输入、先验证再存入 macOS Keychain 的细粒度 Token 入口，可读取当前 `origin` 的开放 PR、其 head commit 的 check-runs，以及讨论/逐行审阅评论；不读取 `gh` 凭据，不做远端写操作。

**P3.1 — 一键网页授权（已排期）**：把 Token 输入降为“高级/兼容方式”，主路径改为“连接 GitHub”→ 系统浏览器授权 → 回到 gorkX 完成连接。目标采用 **GitHub App 的最小只读权限**（Metadata、Pull requests、Checks、Issues）和仓库选择，而不是把用户的 PAT 交给 Agent。实现前置条件与安全边界：

1. 开发方注册公开的 GitHub App，明确仅申请只读权限；用户在 GitHub 中自行选择安装账号/组织和仓库。
2. 纯桌面包不得包含 GitHub App private key、OAuth client secret 或长期服务凭据。无服务端时只提供 GitHub 官方 Device Flow 作为兼容回退；它会打开 GitHub 网页并显示一次性验证码。
3. 完整“点击即浏览器授权、自动回到 App”的体验需要受控的授权回调/令牌交换服务；该服务只保存 App 凭据，不保存用户项目内容，并以短期/可刷新的用户令牌工作。桌面端只把用户令牌存入 macOS Keychain。
4. UI 在授权前展示开发方、仓库范围和只读权限；连接后展示 GitHub 身份、授权仓库范围、最后验证时间，并支持从 gorkX 删除本地凭据与跳转 GitHub 撤销授权。
5. 在 GitHub App 注册、隐私说明、回调服务和真实测试组织准备好之前，不能把“OAuth 连接”显示成可用，也不能把 Client ID/Secret 用占位值写入发行包。

**出口**：在测试仓库中，用户可通过浏览器授权并仅选择一个仓库；gorkX 可读取 PR、定位失败 CI 和评论；断开会清除 Keychain 本地令牌。授权后仍无远端写入。后续创建评论/PR 必须单独获得用户逐次确认并留下审计记录。

### P4 — Browser 与 Computer（4 周）

**工作**：Browser first：基于 Playwright MCP 的目标页、截图、动作日志与域名许可；Computer second：macOS Accessibility/TCC 权限、可见动作、紧急停止、敏感界面遮罩。

**出口**：浏览器任务的每一步可见、可中断、可复盘；Computer 只在用户显式授权且前台可见时执行，绝不后台采集。

### P5 — 连接器与多 Provider（持续）

**工作**：优先 GitHub、Slack/Notion/Drive 等用户授权连接器；默认以官方 OAuth / App / Device Flow 引导完成浏览器授权，回到 gorkX 后显示连接状态、最小权限、可访问范围、断开入口和最后验证时间。手动 API Key、PAT、企业网关 URL 保留为高级兼容路径，并明确说明它们不会自动从浏览器订阅或其它 CLI 凭据导入；多 Provider 账号标签、会话级路由、可得额度展示。

**出口**：每个连接器有一键授权、最小权限、断开、状态和真实读写证据；没有官方 OAuth 的平台明确只支持 API/网关路径，并提供用户可理解的高级配置引导，而不是要求用户猜测 Token 或命令行参数。

### P6 — 稳定性、发布与 1.0（4 周）

**工作**：签名/公证、更新通道、崩溃报告选择加入、迁移/回滚、性能预算、隐私文档、长时 soak test。

**出口**：干净 Mac 安装、登录、真实项目、任务恢复、更新回滚均通过；连续两周日常使用无 P0/P1 数据损失。

## 5. 验收矩阵

| 能力 | 自动化证据 | 人工端到端证据 |
|---|---|---|
| 内核 | ACP smoke、包内版本、隔离 home | 无系统 grok 的干净机对话与重开 |
| 多 Agent | 任务状态机/取消/汇总测试 | 真实 repo 并行探索+实现+测试 |
| 后台任务 | 重启恢复、退避、幂等测试 | App 退出后按承诺继续/恢复 |
| GitHub | Device Flow / 回调状态与 Keychain 存取测试、mock + 测试仓库 API | 用户网页授权、单仓库只读 PR/CI/评论、断开与 GitHub 撤销授权流程 |
| Browser/Computer | 动作许可与日志测试 | 可见操作、停止、TCC 拒绝场景 |
| Provider | 本地 mock 三协议回归 | 用户提供的实际 endpoint 成功推理 |

## 6. 非功能门槛

- 默认最小权限；网络、外部写入、Computer 均逐次或规则化审批。
- API Key 只进入 Keychain/环境，不进入聊天、日志、SQLite 或 config 明文。
- 主线程首屏 JS 保持小于 500 KB gzip 前单 chunk；大面板按需加载。构建后用 `scripts/verify-desktop-web-build.sh` 门禁验证。
- 任意升级先在隔离临时 home 和公开测试仓库验证。
- 每个“真实”声明必须有命令、测试或可见操作证据。

## 7. 开工顺序

1. P0 fork 与 ACP 回归基线。
2. P1 多 Agent（先读/测并行，再写入隔离）。
3. P2 本地可恢复队列。
4. P3 GitHub PR/CI。
5. P4 Browser，再 Computer。
6. P5 连接器与 Provider。
7. P6 发行质量。

每一阶段只在前一阶段出口通过后进入；不以“界面已经有入口”代替验收。
