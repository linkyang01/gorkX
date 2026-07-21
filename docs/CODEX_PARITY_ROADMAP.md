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
| 自动化/协作 | App 打开时的本地计划任务（App SQLite 持久化、重开补跑）；子 Agent 事件/取消/快照已有 UI 适配 | 当前锁定内核不暴露 `x.ai/subagent/list_running`，因此**不宣称重连恢复运行中子任务**；仍缺用户可控委派契约、显式 resume、隔离策略与退出后 worker |
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

**当前门禁命令**：`scripts/sync-grok-kernel-source.sh`、`scripts/verify-grok-kernel-source.sh`、`scripts/verify-grok-kernel-patches.sh`、`scripts/build-grok-kernel.sh <output>`、`node scripts/verify-grok-acp.mjs <output>`、`scripts/verify-macos-app-bundle.sh <app>`。锁定提交 `7cfcb20…` 已完成源码构建、隔离 ACP `initialize`，以及使用独立认证副本的认证/会话新建与恢复/Plan/worktree-list 回归；`--custom-model` 额外写入一次性 `[model.*]` 并验证 ACP 公告和 `session/set_model`，不发送模型提示词。它尚未替换当前包内 `0.2.103` 引擎。补丁队列由 `kernel/patches/series` 明确排序；构建只在临时 Git worktree 应用已验证补丁，绝不接受锁定源检出的未记录修改。认证回归加 `--worktree` 时会只在显式的临时 Git CWD 创建隔离 Worktree，并轮询内核列表确认路径真实出现；加 `--resource` 时会发送一条最小模型请求，用临时文本文件验证标准 `resource_link`，因此默认不执行且只允许在显式的可丢弃 CWD 中运行。每次受控内核构建都会同时生成上游 `LICENSE` 与完整 `THIRD-PARTY-NOTICES`，macOS bundle 验收会拒绝缺少它们的包。认证回归要求显式、独立的 `GORKX_ACP_TEST_HOME`、`GORKX_ACP_TEST_CWD` 和 `--authenticated`，脚本会拒绝标准用户 `GROK_HOME`。该内核当前不暴露 ACP Hooks API，门禁会清楚记录为 `SKIP`，不会把它计入 Hooks 能力通过。Hooks 改写仍需受控测试仓库中的人工真链路验收。

运行时不执行 `grok update`：它不能更新本仓库的 source lock，也会绕过构建与 ACP 回归门禁。设置页只报告包内内核版本；升级必须走上面的源码同步、构建和验证流程。

### P1 — 多 Agent 与任务编排（3–4 周）

**工作**：任务树、委派契约、最多 N 个并行子 Agent、取消/重试/汇总、每个子 Agent 独立 worktree/权限/日志；父任务只聚合结果。

**出口**：一个真实仓库可并行完成“探索、实现、测试、Review”，每个子任务可查看、停止、恢复；冲突写入默认不并行。

### P2 — 可恢复后台任务（3 周）

**工作**：SQLite 持久任务队列、状态机、失败退避、App 重开恢复；本地 launchd worker。当前已完成计划任务的 SQLite 迁移、重开补跑和持久化指数退避（5 分钟起、上限 6 小时），并提供用户显式开启的 macOS launchd worker。worker 每 5 分钟读取同一队列、在 Grok `plan` 权限下执行并保留本机输出；领取、租约恢复和完成写回均使用 SQLite `IMMEDIATE` 事务，因此并发 worker 会观察到已持久化租约；已认领但在 30 分钟租约内没有回报的任务会记录失败并按退避重试。它不创建交互任务，也不允许静默仓库写入。云 worker 是独立部署项，不和桌面端混淆。

**出口**：任务在 App 重启后可恢复；计划任务不再依赖窗口常驻。云模式仅在部署并授权后显示。

### P3 — GitHub 与工程协作（3–4 周）

**工作**：GitHub OAuth/App 授权、仓库/PR/Checks/评论线程读取，创建分支与 PR 前的明确确认；把本地 Review 与远端 PR 关联。当前已提供用户手动输入、先验证再存入 macOS Keychain 的细粒度 Token 入口，可读取当前 `origin` 的开放 PR、其 head commit 的 check-runs，以及讨论/逐行审阅评论；不读取 `gh` 凭据，不做远端写操作。OAuth/App 和远端写入仍未实现。

**出口**：在测试仓库中可读取 PR、定位失败 CI、生成建议并由用户确认后提交评论/PR；所有远端写操作有审计记录。

### P4 — Browser 与 Computer（4 周）

**工作**：Browser first：基于 Playwright MCP 的目标页、截图、动作日志与域名许可；Computer second：macOS Accessibility/TCC 权限、可见动作、紧急停止、敏感界面遮罩。

**出口**：浏览器任务的每一步可见、可中断、可复盘；Computer 只在用户显式授权且前台可见时执行，绝不后台采集。

### P5 — 连接器与多 Provider（持续）

**工作**：优先 GitHub、Slack/Notion/Drive 等用户授权连接器；多 Provider 账号标签、API Key/企业网关、会话级路由、可得额度展示。

**出口**：每个连接器有授权、最小权限、断开、状态和真实读写证据；没有官方 OAuth 的订阅明确只支持 API/网关路径。

### P6 — 稳定性、发布与 1.0（4 周）

**工作**：签名/公证、更新通道、崩溃报告选择加入、迁移/回滚、性能预算、隐私文档、长时 soak test。

**出口**：干净 Mac 安装、登录、真实项目、任务恢复、更新回滚均通过；连续两周日常使用无 P0/P1 数据损失。

## 5. 验收矩阵

| 能力 | 自动化证据 | 人工端到端证据 |
|---|---|---|
| 内核 | ACP smoke、包内版本、隔离 home | 无系统 grok 的干净机对话与重开 |
| 多 Agent | 任务状态机/取消/汇总测试 | 真实 repo 并行探索+实现+测试 |
| 后台任务 | 重启恢复、退避、幂等测试 | App 退出后按承诺继续/恢复 |
| GitHub | mock + 测试仓库 API | PR/CI/评论真实授权流程 |
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
