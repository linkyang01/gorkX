# 本地验收证据台账

本文件记录可复跑的本地验收，不将单机通过扩大解释为发布或完整端到端验收。
发布门槛仍以 [NEXT_RELEASE_GATES.md](NEXT_RELEASE_GATES.md) 为准。

## 2026-08-08 · gorkX 1.2.0 / Grok Build 1.0.0 内核升级候选

| 项 | 结果 |
|---|---|
| 上游锁定 | `xai-org/grok-build` `afbc0fb710320c7add294c2106d447ecc3e3af2e`，版本 `grok 1.0.0`；官方更新说明见 [Grok Build Changelog](https://x.ai/build/changelog) |
| 补丁队列 | `scripts/verify-grok-kernel-patches.sh vendor/grok-build`：0001–0007 **PASS**，均可在干净 worktree 直接应用 |
| 内核构建 | `scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok`：**PASS**；资源版本 `grok 1.0.0 (afbc0fb)`，SHA-256 `a90ec8caeeaa1019e6ea83ce88621578a74f7f476f7d9b86431a07e91b84de7d` |
| ACP 无认证探针 | `verify-grok-acp.mjs`：initialize、原生 voice start/stop/shutdown、desktop actions、billing/auto-topup guards、session search、prompt history/suggestion、session bundle、client fs capability、disable web search、model catalog reload **PASS** |
| 前端门禁 | `npx tsc --noEmit`、`npm run test:stages`、`npm run build` **PASS**；Vite 仅保留既有大 chunk warning |
| Rust 门禁 | `cargo test` **88 passed**；`cargo check` **PASS** |
| App 包 | `npm run build:app` + `verify-macos-app-bundle.sh` **PASS**；arm64 `.app`（CFBundle `1.2.0`）包含 `grok 1.0.0 (afbc0fb)`、许可证和第三方声明；未生成 DMG、未打 tag、未发 GitHub Release |
| 发布就绪脚本 | `scripts/verify-release-readiness.sh`：候选包 **READY**；公共发布仍被明确用户批准、签名/公证与跨平台警告拦截 |
| 桌面 1.0 适配 | 会话列表消费 `lastTurnSummary`；权限卡保留完整脚本并支持展开/复制；扩展 Skills/Plugins 按名称排序并折叠展示全部项目；计划审批弹窗可在执行前切换内核返回的模型 |

### ACP 逐项兼容性结论

| 路由类别 | 1.0.0 结论 | gorkX 处理 |
|---|---|---|
| 基线 `initialize` / `session/new` / `session/load` / `session/prompt` | 保持 ACP 基线；返回模型目录与会话状态 | 继续使用标准 ACP 生命周期；版本信息改为 1.2.0 |
| 原生语音 `x.ai/voice/*` | 路由仍由内核提供；无认证缺失会话守卫可达 | 继续调用上游 CoreAudio/STT，不另做浏览器语音 |
| 规划与审批 `x.ai/ask_user_question` / `x.ai/exit_plan_mode` | 响应形状兼容；计划审阅可保留完整 Markdown | 桌面弹窗展示原生内容、复制，并提供执行前模型切换 |
| 桌面动作 `x.ai/desktop/*` | 0005 补丁在 1.0.0 新架构重放成功 | 继续复用 Workflow/Goal/command 原生控制面，不重写 Agent 循环 |
| 会话/账单/搜索/任务包/模型目录刷新 | native route + auth/missing-session guards 均通过；`_x.ai/internal/reload_models` 以 1.0.0 实际探针确认 | UI 只显示服务器返回值；配置保存后对运行中的内核发起受控目录刷新；缺字段不估算 |
| 0001–0007 扩展路由 | 全部在干净 worktree apply-check 通过并进入包内二进制 | 对标准/`_x.ai` 兼容拼写按探针结果路由；不把 Method not found 写成成功 |

### 当前仍需真人验收

- 真实 OAuth 会话下的首轮对话、额度/账单字段、三方模型真实请求仍需用户账户验收；本轮没有用测试请求伪造额度。
- macOS 麦克风授权后真实语音转写仍是 H3；ACP 路由本身已通过无采集探针。
- H1 干净机安装、H2 三方 endpoint、GitHub OAuth revoke round-trip 仍未完成。


## 2026-08-01 · 发布 gorkX 1.1.0

| 项 | 结果 |
|---|---|
| 版本 | `1.1.0`（相对 1.0.0：外观 Codex 化 + 设置页深化 + 暗色白底修复） |
| 代码 | `main` @ `f54ae56` + tag **`v1.1.0`** |
| 门禁 | tsc / test:stages / cargo / bundle verify **PASS** |
| 包 | `gorkX.app` + `gorkX_1.1.0_aarch64.dmg` |
| 内核 | `grok 0.2.116 (dd04f39)` |
| 签名 | **adhoc**（未公证；Gatekeeper 可能需「仍要打开」） |
| DMG SHA-256 | `c93f996018f3c8293727af025c2ed9cae3854908f7b7aa50ce72e8b8c0e22734` |
| GitHub Release | https://github.com/linkyang01/gorkX/releases/tag/v1.1.0 |
| 说明 | `docs/RELEASE_NOTES_v1.1.0.md` |

用户明确要求「git 上去，可以发布就发一版」后执行。

---

## 2026-08-01 · ONE_SHOT COMPLETE（全的做 · 一次验证）

> 用户：「全的做，一次性完成，完成的验证」。  
> 摘要：`docs/evidence/one-shot-complete-20260801/SUMMARY.md`。

### 本轮代码

| 项 | 说明 |
|---|---|
| 暗色白底 | 建议卡/子菜单/附件 chip/权限块/表单/hover 等改主题 token |
| 主题守卫 | `findLightSurfaceHardcodes` + `designTokens.test` 禁止组件层浅灰 `background` |
| 主路径矩阵 | `desktopPrimaryEntries` **25** 路径 |
| live subagent 脚本 | 绝对路径解析，避免相对路径 ENOENT |

### 自动门禁

| 门禁 | 结果 |
|---|---|
| tsc / test:stages | PASS（含 25 主路径 + 白底守卫） |
| cargo test | **88** passed |
| patches 0001–0007 | PASS @ dd04f39 |
| ACP desktop+voice（无登录） | PASS |
| ACP 登录副本：session/info、fork、hooks、bundle 守卫、subagent 路由、billing… | PASS |
| **Live 子任务** spawn→poll→**completed** `smoke` | PASS |
| **主 `session/prompt`** 短答 `end_turn` · `grok-4.5` | **PASS**（本账号副本不再 403） |
| build:app + verify-macos-app-bundle | PASS · `gorkX.app` · 内核 0.2.116 |

### 仍阻塞（诚实）

| 项 | 状态 |
|---|---|
| App 内委派 GUI 录像 | 未做 |
| H1 干净机 / H2 endpoint / H3 麦克风 | 未做 |
| tag / 公证 DMG / Release | **未批准** |

**结论：** 定义 A **加强达成**（含 ACP 级 B1 真 prompt + 主题收口）；定义 B 仍待人工与发版批准。

---

## 2026-08-01 · ONE_SHOT「跑完所有」再执行

> 用户再次要求一次性跑完所有。机器可完成部分已连续执行；外部阻塞如实列出。

| 项 | 结果 |
|---|---|
| α | 全绿（tsc/stages/cargo88/patches/ACP/desktop） |
| β | 子任务 **completed**；主 prompt **403** |
| γ | App 进程 gorkx 已拉起；结构 A/B PASS |
| δ | **DMG 已生成** `gorkX_1.0.0_aarch64.dmg` + app bundle 校验 PASS |
| tag/gh release/公证 | **未上传** — 无新版本号与公证材料；本地 DMG 已在 target/release/bundle/dmg/ |

证据目录：`docs/evidence/one-shot-full-20260801-195145/FINAL_EXIT.md`

---

## 2026-08-01 · ONE_SHOT 一条龙（α–δ）

> 触发：用户「一条龙完成，全做了」。计划：`docs/ONE_SHOT_COMPLETION_PLAN.md`。  
> 摘要：`docs/evidence/one-shot-20260801/SUMMARY.md`。

| 批次 | 结果 |
|---|---|
| α 门禁 | tsc / stages / cargo 88 / patches / ACP desktop+voice / build:app / bundle **全绿** |
| β 实机 | 子任务 explore **completed**；主 `session/prompt` **403** |
| γ 清单 | A/B 结构项 PASS；GUI 录像 / H1–H3 **未过** |
| δ 发版 | 候选 `gorkX.app` 有；**无** tag/Release/DMG（无版本句+公证） |

**出口：** 定义 A **达成**；定义 B **未达成**（服务端 Build 主会话 403 + 人工闸门 + 未批 tag）。

---

## 2026-08-01 · 正式完备条（Formal completeness bar）

> 目标：桌面优先映射 + 编码核心可证 + ACP 可达 + 门禁绿 + 诚实 H1/H2/H3 阻塞记录。  
> 差距表：`docs/FORMAL_PARITY_GAP_TABLE.md`。  
> 自动门禁日志（本机 scratch，会话内）：`gates-tsc-stages-cargo-acp-bundle.log`、`acp-desktop.log`、`acp-auth-subagent.log`、`stage-ab.log`、`cargo-test.log`、`live-loop.txt`。

| 门禁 | 结果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run test:stages` | PASS（含 stage-b `desktopPrimaryEntries` 20 路径） |
| `cargo test` | **88 passed** |
| `cargo check` | PASS |
| `verify-grok-kernel-patches` | PASS 0001–0007 @ `dd04f39` |
| ACP `--desktop-controls --voice-controls` | PASS（无模型请求） |
| ACP auth：session/info + subagent list/get/cancel/spawn(缺父拒) + hooks list/reload + worktree list | PASS（App GROK_HOME 副本，临时目录已删） |
| `npm run build:app` + `verify-macos-app-bundle` | PASS · `gorkX.app` 1.0.0 · 包内 `grok 0.2.116 (dd04f39)` · 隔离 GROK_HOME |
| 直播码 B1 / 真对话 | **未验收（服务端 403）** — 2026-08-01 用 App `GROK_HOME` 副本：`authenticate`+`session/new|load` PASS；`--resource` 触发 `session/prompt` 得 **403** `Grok Build is coming soon. You don't have access now.`（见 scratch `live-resource-prompt.log`）。**不得伪造流式**；UI humanize 路径已测 |
| H1 干净安装 | **未验收（阻塞）** — 需无既有 Grok 数据的 macOS 机上：安装 → 登录 → 首任务 → 退出重开 |
| H2 第三方模型真回复 | **未验收（阻塞）** — 用户未提供可授权 endpoint/密钥 |
| H3 语音听写 | **未验收（阻塞）** — 需麦克风 TCC + 真人朗读；ACP 路由已绿 |
| 子任务 GUI 点按 | **未验收** — App 委派按钮→树→停止/Inspect **无录像** |
| 子任务 ACP 真跑（父会话存在） | **通过（2026-08-01）** — App GROK_HOME 副本 + 可丢弃 git 项目：`_x.ai/subagent/spawn` explore/read-only → `status=started` → poll `get` → **`status=completed`**、`output=hello-gorkx`、`toolCalls=1`（scratch `live-spawn-get-poll.log`）。**非** App UI 点按 |
| tag / Release / 公证 DMG | **未做** — 需用户明确批准；当前为 release **候选** 包 |

### 映射抽检（≥15）

见 `FORMAL_PARITY_GAP_TABLE.md` 行 1–22；`desktopPrimaryEntries.test.ts` 锁定 20 个桌面主路径符号。Calendar 等为 Soon，非可点已连接。

### 正式条结论（诚实）

- **达到**本目标定义的正式完备条：桌面优先、编码主路径有 Real/Kernel-wired 接线与自动门禁、缺口与 H1–H3 **书面阻塞**、无 403 绕过、无假连接器。  
- **未达到**「无人工阻塞的全量 Codex P1–P6 / 全 Build 真对话验收」；有 Build 额度与干净机后可升 Real 条目。  
- 不打 tag、不发 Release、不做公证 DMG，除非用户另批。

---

## 2026-08-01 · 错误体验与设置/GitHub/Computer 深化（无模型额度）

> 目标：账号缺 Grok Build 或未做真人点按时，桌面仍诚实、可读、不假重连。  
> 提交线索：`5b46579` … `8970e6c` 及本轮扩展/审阅面板 humanize。

| 范围 | 变更 | 证据类型 | 边界 |
|---|---|---|---|
| Build 403 | stderr 尽早 `markTaskFailed`；不自动重连；运行中心失败行短标题 | 源码 + `chatFormat.test` | **不能绕过服务端 403**；真对话仍需 Build 权限 |
| 进程退出 | 稳定 token `Agent process exited`；UI i18n；过程面板 system 行友好化 | 源码 + 单测 | 旧会话英文 token 仍可识别 |
| Hooks / Computer | 设置成功/失败短文案；急停始终可点 + danger；状态 detail 本地化 | 源码 + `settingsFeedback.test` | 急停/点击真人验收仍待 |
| GitHub 验证连接 | `githubFeedback`：成功 login+最后验证；401/403 撤销提示；审计 test/fail | 源码 + `githubFeedback.test` / stage-d | 需用户 token 才能 live 绿 |
| 设置全局 | catch → `showErr`；成功 `setMsg` 清 err 样式；网络/钥匙串/MCP/模型映射 | 源码 + stage-a | 不伪造连接成功 |
| 扩展 / Review / Inspect | 原始 dump → `settingsErrorMessage` / `githubActionError` | 源码 | 未做 GUI 录像 |
| 其它面板 | Worktree / TaskInfo / Subagent / HookBuilder / Terminal / Kernel / Attachment / Memory / Scheduled 同样 humanize | 源码 | 不伪造成功 |
| 门禁 | `npx tsc --noEmit`；`npm run test:stages`（a–g 全绿） | 本会话通过 | — |
| Rust | `cd apps/desktop/src-tauri && cargo test` | **88 passed**（本会话） | 未 cargo check 之外的签名 |
| ACP 桌面控制 | `node scripts/verify-grok-acp.mjs …/resources/grok --desktop-controls` | 全绿：interject/btw/memory/repair/goal/command/workflow/hunk/code/git 原生守卫 | 无模型请求；`--authenticated` 另跑 |
| 主界面错误 | 账户刷新/登录、提示历史、建议下一步 catch → `settingsErrorMessage` | 源码 | 任务 `error` 仍存原始 token 供 403 识别 |
| 子任务 P0 加固 | `subagentStatus` 归一化；运行中可 Inspect；轮询计时器清理；停止/Inspect humanize（`73ce3aa`） | 源码 + `subagentStatus.test` / stage-b | **非** App UI 真 spawn 录像；仍 Kernel-wired |
| 子任务标签 i18n | 行标题 `Subtask`/`子任务` 随语言；生命周期与 spawn 种子同一格式 | 源码 + 单测 | 旧会话中文前缀仍可 strip |
| 主界面 alert | 用户可见 `alert` 失败走 `settingsErrorMessage` | 源码 | 非替代 toast 体系 |
| 旁问/队列/计划/修复 | follow-up、队列、plan 警告、session repair 系统行 humanize | 源码 | 任务连接失败 error 仍可为原始 token |
| 前端生产构建 | `cd apps/desktop && npm run build` | 通过（本会话） | 非 App bundle / 非 DMG |
| App-only 包 | `cd apps/desktop && npm run build:app` | 通过：`…/bundle/macos/gorkX.app` · CFBundle `1.0.0` | 未签名公证；未 DMG；未 tag |
| Bundle 结构 | `scripts/verify-macos-app-bundle.sh …/gorkX.app` | PASS：arm64 主程序 + 包内 `grok 0.2.116 (dd04f39)` + 隔离 `GROK_HOME` + 许可证 | 不构成干净机 H1 |
| 快捷键目录 | `desktopShortcuts.ts`：App matcher 与 ShortcutsHelp 同源；`desktopShortcuts.test` 锁定 A2 的 ⇧⌘A/B/M/S/P/I | stage-b 通过 | 非 GUI 录像；⌥⌘ 任务切换仍在 App 内联 |
| ⇧⌘B 无会话 | 始终打开委派面板；空状态显示 `subagentSpawnNoTask`（不再静默吞键） | 源码 | 父任务 busy 时仍不打开 |
| 任务信息重连 CTA | 有 sessionId 无 client 时显示重连；`test:stages` + `build:app` 绿（含 spawn/voice 空状态） | 源码 + bundle | — |
| 会话离线条 | 恢复会话无 client 且无 error 时聊天区横幅 + 重连；Fork 禁用时 title 说明需重连 | 源码 | — |
| 任务信息空状态 | 顶栏/⇧⌘I 无会话也打开面板；空卡片说明 + 账户入口；`build:app` 再绿 | 源码 + bundle | 非真 session/info 点按 |
| 执行方案文档 | `NEXT_EXECUTION_PLAN.md` 基线刷新为 2026-08-01 真实进度 | 文档 | 阶段 1 仍未达成 |

### 诚实结论

- P1 代码侧：**Hooks 失败提示、Computer 急停可用性、GitHub 验证往返文案**已落地。  
- P0 子任务：**桌面树/轮询/Inspect 代码闭环加固**；真 spawn 仍需 Build 权限 + 人工点按。  
- **不得**写成 H1–H3 或 B1 真对话已通过；不 tag / 不 Release / 不 DMG。  
- 真人：设置 → Computer 急停一次；设置 → Git → 验证连接（有 token 时）；App 内 A1–A5 与委派子任务点按。

## 2026-08-01 · 桌面委派子任务（`x.ai/subagent/spawn`）阶段 0 收口

| 范围 | 命令或步骤 | 结果 | 边界 |
|---|---|---|---|
| 内核补丁 | `scripts/verify-grok-kernel-patches.sh vendor/grok-build` | 通过：锁定提交 `dd04f397b1d02f2272b092555669dfba1f01bc85`，0001–0007 均可在干净 worktree 顺序应用；`vendor/grok-build` 工作树无已跟踪脏改动 | 未记录的 nested untracked `vendor/grok-build/vendor/` 不参与补丁 apply；构建仍在临时 worktree 中进行 |
| 内核重建 | `scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok`；`resources/grok --version` | 通过：包内资源为 `grok 0.2.116 (dd04f39)`，含 `0007-acp-desktop-subagent-spawn.patch` | 版本号不变；不构成 GitHub Release 或 DMG 发布 |
| ACP spawn 路由（无认证隔离 HOME） | 隔离 `HOME`/`GROK_HOME` 下对包内内核发送 `initialize`，再调用 `x.ai/subagent/spawn` 与 `_x.ai/subagent/spawn`，父会话 ID 故意不存在 | 通过：标准拼写 `x.ai/subagent/spawn` 为 method not found；运行时兼容拼写 `_x.ai/subagent/spawn` 返回 `Invalid params` / `data: "parent session not found"`，未返回 `subagentId`，未排队真实子任务 | 桌面客户端调用 `_x.ai/subagent/spawn`。本探针不创建真实父会话、不发起模型请求；**真实只读/可写子任务执行、审批、完成与 App 重开恢复仍缺认证账号 + 可丢弃项目人工证据** |
| 脚本门禁 | `scripts/verify-grok-acp.mjs … --authenticated --subagent-controls` | 部分：`--subagent-controls` 仍要求 `--authenticated` 与可丢弃目录；空临时认证目录下 `authenticate(cached_token)` 可能超时 | 不得把“路由可达”写成“子任务已跑完”；完整 `--subagent-controls` 绿跑需带有效隔离认证目录 |
| 桌面门禁 | `cd apps/desktop && npx tsc --noEmit && npm run test:stages && npm run build && npm run build:app`；`cd src-tauri && cargo test && cargo check`；`scripts/verify-macos-app-bundle.sh …/gorkX.app` | 通过：TypeScript 无报错；stage 测试全绿；前端生产构建成功；Rust **87** 项单元测试通过；`cargo check` 通过；arm64 App-only bundle 含 `grok 0.2.116 (dd04f39)`、许可证与隔离 `GROK_HOME` | 未签名/公证；未生成 DMG；未打 tag；未发 Release |
| UI / 文档诚实边界 | `+ → Delegate a subtask` / `+ → 委派子任务`；`FEATURES.md` 标为 **Kernel-wired** | 默认只读；共享工作区写/执行需 `window.confirm`；生命周期仍由内核协调器拥有 | 不得宣称 Real 端到端；阶段 2 才做真实闭环 |

### 阶段 0 结论

- 已收口：源码、0007 补丁、内核重建、无认证 spawn 拒绝探针、前端/Rust/App bundle 门禁。
- **未完成（不得写成已验收）**：登录态下真实子任务启动、角色/权限/worktree 实跑、取消与完成恢复。
- 发布动作：本阶段明确不做 tag / Release / DMG。

## 2026-08-01 · 阶段 1 阻断项与阶段 2.1 子任务部分证据

### 阶段 1（H1 / H2 / H3）状态

| 项 | 状态 | 本机证据 | 仍缺 |
|---|---|---|---|
| **H1** 干净 macOS 独立安装 | **未验收（干净机）**；开发机有部分旁证 | App `GROK_HOME` = `~/Library/Application Support/gorkX/grok-home`，与用户 CLI `~/.grok` 路径可区分；App home 含 `auth.json`（mode 600）；正式包 `verify-macos-app-bundle.sh` 确认隔离 `GROK_HOME`；包内内核 `0.2.116 (dd04f39)` | 在无既有 Grok CLI 数据的环境：安装 App → 登录 → 真实项目首任务 → 退出 → 重开恢复同一任务的步骤记录 |
| **H2** 第三方 API / 兼容模型 | **未验收** | 无用户提供的可授权 endpoint/密钥；不得把 `session/set_model` 接受写成真实推理 | 用户明确提供 endpoint + key 后：连接测试 → 模型目录/ID → Keychain 保存 → 任务选中 → 真实回复 → 切回 Grok |
| **H3** macOS 语音 | **未验收（听写）**；路由门禁通过 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --voice-controls`：`_x.ai/voice/start|stop|shutdown` 抵达原生会话守卫，无采集 | 用户允许麦克风后：按钮 → TCC → 流式转写 → 可编辑草稿 → **手动**发送；停止/关窗/拒绝权限 |

**阶段 1 出口：未达成。** 不可形成 Beta 发布候选；不打 tag / 不发 Release / 不做 DMG。

### 认证态 spawn 路由（App 登录副本，非 CLI home）

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 认证 + 子代理控制 | 复制 App `GROK_HOME` 到一次性目录（不使用 `~/.grok`），可丢弃 Git 项目；`GORKX_ACP_TEST_AUTH_DIR` + `GORKX_ACP_TEST_PROJECT_DIR` + `verify-grok-acp.mjs … --authenticated --subagent-controls --session-info` | 通过：`authenticate(cached_token)`、`session/new|load`、`_x.ai/session/info`、`list_running` / `get` / `cancel`、**`_x.ai/subagent/spawn` 对缺失父会话按预期拒绝** | 临时认证副本与项目已删除；不读取 CLI home；不发送主会话模型提示词 |

### 阶段 2.1 部分：真实只读子任务 start / list / cancel

| 范围 | 步骤 | 结果 | 边界 |
|---|---|---|---|
| 真实 spawn | 同上一次性 App 登录副本 + 可丢弃项目；`session/new` 后调用 `_x.ai/subagent/spawn`：`explore` + `capabilityMode=read-only` + `isolation=none`，prompt 仅要求阅读 `README.md` | **通过启动**：返回 `subagentId=019fbb7c-4e5f-7300-b361-d8f932af425e`，`status=started`，`capabilityMode=read-only`，`isolation=none` | 这是内核 ACP 层证据，**不是**桌面 `+ → 委派子任务` UI 点按验收 |
| 运行中可见 | `_x.ai/subagent/list_running` 轮询 | **通过**：约 1s 内观察到 1 个运行中子任务（含上述 id） | 未验证 worktree 隔离路径、未验证写权限确认框 |
| 快照 / 取消 | `_x.ai/subagent/get`（block=false）；`_x.ai/subagent/cancel` | get 返回含 `snapshot`；cancel 返回 `cancelled=true`，`outcome.kind=cancelled` | **未等待模型完成结果**；未做 App 重开恢复；未验证父子任务树 UI；临时目录已删除 |

**诚实结论：** 原生子任务协调器可从桌面 ACP 路由真实启动只读子任务并取消；FEATURES 仍保持 **Kernel-wired**，不得升为 Real，直到 App UI、完成结果、审批与重开恢复有完整证据。

## 2026-08-01 · 阶段 2 深化：worktree 子任务 + Hooks 控制与执行

### 2.1 worktree 隔离子任务（可丢弃项目，App 登录副本）

| 步骤 | 结果 | 边界 |
|---|---|---|
| `_x.ai/subagent/spawn`：`explore` + `read-only` + `isolation=worktree` | 返回 `subagentId=019fbb88-0e7b-7bb1-904b-61b97679b501`，`isolation=worktree` | 非 App UI 点按 |
| `list_running` | 约 1s 内看到子任务；含 `parentSessionId` / `childSessionId` / `subagentType` / 用量字段 | 列表项本身未直接暴露 cwd 字段 |
| `worktree/list` | 出现真实路径：`…/gorkx-p2-auth…/worktrees/…/subagent-019fbb88-…`（位于 App 登录副本 home 下，不在用户项目根） | 证明协调器创建了隔离 worktree |
| `subagent/get` | `status=running` | 未等模型完成 |
| `subagent/cancel` | `cancelled=true` | 临时目录已删 |

### 2.2 Hooks 配置、信任、执行与启停

| 步骤 | 结果 | 边界 |
|---|---|---|
| 项目写入最小 `SessionStart` command Hook（`.grok/hooks/*.json`） | 内核 `hooks/list` 发现：`handlerType=command`，`projectTrusted` 可变为 true | App 只写定义，不执行 |
| `hooks/action` reload / trust | success | — |
| **真实执行** | SessionStart 在会话内写出 marker：`hook-ran-<epoch>` 文件存在 | 证明 **Grok Build 执行** Hook，不是桌面假跑 |
| `hooks/action` remove by path | success | — |
| enable / disable | 内核要求字段 **`hook_name`（snake_case）**；`hookName` camelCase 被拒绝（`missing field hook_name`） | 桌面曾错误发送 camelCase |

**修复：** `AcpClient.manageHooks` 对 enable/disable 编码为 `{ type, hook_name }`，TypeScript API 仍用 `hookName`。复验：disable → `disabled=true`，enable → `disabled=false`，`status=success`。

| 仍缺（不得写成完整闭环） |
|---|
| App 设置页点按信任/启停的人工走查 |
| 失败 Hook 的错误提示 UX |
| 子任务模型完成结果、审批流、App 重开后的父子树恢复 |
| 阶段 1 H1/H2/H3 |

## 2026-08-01 · 阶段 2.3 GitHub 安全收口 + 2.4 Computer 边界

### 2.3 GitHub

| 项 | 证据 | 边界 |
|---|---|---|
| 凭据只在 Keychain | `com.gorkx.github` / `read-token`；不读 `gh` CLI | 本机 Keychain 中存在条目（不打印 secret） |
| 身份实时验证 | `GET /user` 使用 Keychain token → HTTP 200，`login=linkyang01` | 不代表干净机安装 |
| 写前确认 | Settings / Review：`window.confirm` + `githubWriteConfirmSummary` 后才 `create_pull_request` / `create_pr_comment` | 未在本轮创建真实 PR/评论 |
| 断开清理 | `github_disconnect` → `token_delete` + 清除 `github-connector.json` 元数据 | 本轮未故意断开用户现有连接 |
| **新增：权限范围与最后验证时间** | `GithubStatus.scopes` + `lastVerifiedAt`；OAuth 为 `read:user` / `public_repo`；PAT 为 fine-grained 说明；成功 whoami 写入 App Support 元数据；401/403 清除 lastVerified 并提示可能已撤销 | 设置页展示 scopes 与 last verified；**未**做用户在 GitHub 网页主动撤销后的完整人工往返 |
| 单元测试 | `cargo test github`：**7** 通过（含 OAuth scope 列表） | — |

### 2.4 Browser / Computer

| 项 | 证据 | 边界 |
|---|---|---|
| Computer 工具白名单 | MCP 仅：`status` / `screenshot` / `click` / `key` / `type` / `stop`；无 shell/script | `cargo test computer`：**4** 通过 |
| 固定键位 / 坐标 / 文本边界 | unit tests：key map 固定；坐标有界；文本有界并转义 | 本机未授予 Accessibility 时不宣称真实点击结果 |
| 急停租约 | 设计：桌面 emergency stop 取消 lease，MCP 子进程拒绝后续动作 | 需已启用控制时的人工急停验收 |
| 非原生 ACP | FEATURES 诚实：App-owned MCP 桥 ≠ Grok Build 原生 Computer ACP | 0.2.116 无原生 Computer ACP |
| Playwright Browser | 包版本钉死 `@playwright/mcp@0.0.78`；允许源 origin 校验 unit 测试 | 未做完整浏览器任务内动作日志/截图流人工验收 |

**阶段 2 仍缺：** GitHub 网页撤销完整往返；Computer 授权下真实点击/截图；Browser 任务内可复盘日志。阶段 1 出口仍未达成。

## 2026-08-01 · 子任务完成闭环 + 任务树 Inspect 修复 + Computer 权限旁证

### 只读 worktree 子任务跑到 completed

| 步骤 | 结果 | 边界 |
|---|---|---|
| App 登录副本 + 可丢弃 Git 项目 | `authenticate` / `session/new` 成功 | 非干净机 H1 |
| spawn explore + read-only + worktree | `subagentId=019fbb9f-d509-7fd3-a482-512680d7b54a` | ACP 层，非 App UI 点按 |
| 轮询 `subagent/get` | 先 `status=running`（turnCount=1, tokensUsed≈883），约数秒后 **`status=completed`** | 真实模型回合，消耗额度 |
| 完成快照字段 | 含 `output`（string，长度 72）、`toolCalls`、`turns`、**`worktreePath`**、`parentSessionId`/`childSessionId` | 未在证据中粘贴完整模型输出正文 |
| `list_running` | 完成后 **不再**包含该 id | — |
| 通知 | 过程中有 `session/update`、`_x.ai/session_notification` | 未把通知解析写成 UI 验收 |

### 任务树 UI bugfix

内核状态为 **`completed` / `cancelled` / `failed`**（带 -ed）时，旧正则 `^(complete\|…)\b` 把 Inspect 按钮判为不可用。

- 修复：`SubagentTree` 使用 stem 匹配 `complet|cancel|fail|…`，`completed`/`cancelled`/`failed` 可 Inspect；`running` 仍可 Stop。
- 验证：本地布尔表对上述状态组合通过；未做 App 内人工点按。

### Computer Accessibility 旁证（本机）

| 探测 | 结果 | 边界 |
|---|---|---|
| `System Events` → `UI elements enabled` | **true** | 与 gorkX `check_accessibility()` 同源 osascript；**不等于**已启用 Computer 租约或完成真实点击 |
| 控制租约 | 未在本轮写入 lease / 未调用 click/type | 急停与真实截图仍待人工 |

**阶段 1 出口仍未达成。** 不打 tag / 不发 Release / 不做 DMG。

## 2026-08-01 · 验收清单 A+B 执行（按建议）

| 范围 | 结果 | 边界 |
|---|---|---|
| A1–A5 入口 | **源码接线 19/19 检查通过**；`tsc` + `test:stages` 通过 | 未启动 GUI 真人点按 |
| 语音路由 | `--voice-controls`：start/stop/shutdown 守卫通过 | 无麦克风采集 |
| 桌面 ACP | `--desktop-controls` 全绿 | 无模型请求 |
| B 认证 | App 登录副本：`authenticate`、`session/info`（无 token 字段）、subagent list/get/cancel/spawn（缺父拒） | 副本已删 |
| B1 真对话 | **未做** | 需 App 人工 |
| B2–B3 App UI | **未做点按**；ACP 与源码支持已有 | 见 `DESKTOP_ACCEPTANCE_CHECKLIST.md` 记录 |
| 发布 | 不构成 H1–H3 通过；不 tag/Release/DMG | — |

详见 `docs/DESKTOP_ACCEPTANCE_CHECKLIST.md` 文末「2026-08-01 执行记录」。

## 2026-08-01 · 进程/记忆/Worktree 空状态可操作

| 面板 | 变更 | 边界 |
|---|---|---|
| Process 空 | 说明 + **委派子任务**按钮（会话可用时） | 需活动会话 |
| Memory 空 | **保存本地笔记** / 可选 Flush | — |
| Worktree 空 | **创建永久 worktree** + 刷新 | 需项目路径 |
| tsc | 通过 | — |

## 2026-08-01 · 快捷键同步桌面入口

| 区域 | 变更 | 边界 |
|---|---|---|
| 全局快捷键 | ⇧⌘M 记忆、⇧⌘A 待处理、⇧⌘S 计划、⇧⌘B 委派、**⇧⌘P 进程**、**⇧⌘I 任务信息** | 与顶栏/Composer 按钮同一入口 |
| ShortcutsHelp | 中英文说明；标明 slash 非主路径 | `⌘/` 打开 |
| 人工清单 | `docs/DESKTOP_ACCEPTANCE_CHECKLIST.md` | 须真人点按后写 VALIDATION 结果 |
| tsc | 通过 | 未做人工快捷键录像 |

## 2026-08-01 · 待处理决策顶栏 + 计划任务空状态

| 区域 | 变更 | 边界 |
|---|---|---|
| 顶栏 | **待处理**（!）按钮常驻；有队列时 badge + attention 样式 | 真实 ACP 队列，不造假 |
| 跨任务 | 非当前任务的审批入队时自动打开收件箱 | 当前任务仍可用内联决策卡 |
| 顶栏 | **计划任务**图标 | 与侧栏同源 |
| 计划任务空状态 | 新建 + 使用第一条建议按钮 | — |
| 收件箱空状态 | 说明「按钮处理，不用命令」 | — |
| tsc | 通过 | 未做人工点按录像 |

## 2026-08-01 · 顶栏扩展/记忆 + Composer 委派快捷钮

| 区域 | 变更 | 边界 |
|---|---|---|
| 顶栏 | 扩展、记忆图标按钮（侧栏折叠时仍可进） | 与侧栏同一打开逻辑 |
| 侧栏 | 「插件」文案改为「扩展」；tooltip 说明全是按钮 | — |
| Composer（活动会话） | **委派子任务** 快捷钮 → 打开引导面板 | 需已连接任务且非 busy |
| tsc | 通过 | 未做人工点按录像 |

## 2026-08-01 · 扩展空状态与任务信息一键入口

| 区域 | 变更 | 边界 |
|---|---|---|
| Skills 空状态 | 引导打开 Skills 目录 + 刷新；文案改为 App GROK_HOME，不提 CLI `~/.grok` | 不扫描用户 CLI home |
| Skills 列表 | 标题用技能名，不主推 `/name`；**运行**按钮为主 | slash 仍专家兼容 |
| MCP 空状态 | 一键连接 Chrome MCP + 刷新 | 需 Chrome/运行时 |
| Plugins 空状态 | 跳转市场页签 | — |
| 市场空状态 | 添加来源提示 | — |
| Chrome 栏 | 活动会话可点 **任务信息** 按钮 | 无会话时禁用 |
| tsc | 通过 | 未做人工点按录像 |

## 2026-08-01 · 语音 / Hooks / Computer 操作引导

| 区域 | 变更 | 边界 |
|---|---|---|
| 语音 | 错误映射为短文案（拒绝/无麦/无会话/不支持）；无任务时提示；按钮 title 说明「只写草稿不自动发送」 | **H3 听写仍待麦克风人工验收** |
| Hooks | 信任/重载/启停/增删成功短提示；loadErrors 全文展示；接线错误友好说明 | 非替代真实 Hook 执行验收 |
| Computer | 进入设置节自动检查权限；四步按钮清单（权限→启用→动作→急停） | **未在本轮做真实点击** |
| tsc | 通过 | — |

## 2026-08-01 · 委派子任务桌面闭环增强

| 变更 | 结果 | 边界 |
|---|---|---|
| 启动后 Process 树 | `onStarted` 立即 `appendOrMerge` 为 `toolKind=subagent` / `running`，并打开进程面板 | 不依赖 lifecycle 事件才显示 Stop |
| 进度 | 有界轮询 `getSubagent`（2.5s × 最多 120 次）更新 completed/cancelled/failed | 非第二套 Agent 循环；内核仍拥有执行 |
| Inspect | 打开进程面板；展示 status、output、worktreePath；同步树状态 | 需活动会话 |
| Stop | cancel 成功后立即标 `cancelled` | 真取消仍由内核执行 |
| tsc | 通过 | 未做本机 App 人工点按录像 |

## 2026-08-01 · Slash 选择全面路由到桌面控件

| 变更 | 结果 | 边界 |
|---|---|---|
| `applySlashPick` | 已知 Grok 能力（compact、review、memory、goal、loop、imagine、fork/rewind、task info、worktree、模型设置、任务搜索等）**打开对应面板/表单/动作**，清空输入框 | 不把 `/command` 留在 composer 当主路径 |
| 广告中的未知引擎命令 | 走 `openEngineAction` 引导表单 + `_x.ai/desktop/command` | 仍非专用 UI，但是按键表单而非手写 slash |
| 完全未知 token | 才 `insertSlash` 专家兼容 | 不宣称这些是产品主路径 |
| 文档 | 新增 `docs/DESKTOP_ALIGNMENT_PLAN.md` 对齐清单 | 阶段 1 H1/H2/H3 仍未验收 |

`npx tsc --noEmit` 通过。未做全量 UI 人工点按。

## 2026-08-01 · 子任务重连恢复加固 + H1 包隔离复验 + 阶段 3 边界

### 重连恢复（代码）

`reconcileRunningSubagents` 在 `list_running` 之外，对本地仍显示 `running` 但引擎列表已不存在的子任务，额外调用 `getSubagent`：

| 引擎快照 | 桌面结果 |
|---|---|
| `completed` / done / success | 行状态 → `completed`（可 Inspect） |
| cancel* | → `cancelled` |
| fail / error | → `failed` |
| 仍 running / get 失败 | → `unverified after reconnect` |
| 列表中仍有 | 保持 live `running · …` 并补行 |

TypeScript / stage 测试通过。**未**做真实「App 退出 → 子任务跑完 → 重开」人工往返（需登录 UI）。

### H1 旁证（非干净机）

`scripts/verify-macos-app-bundle.sh …/gorkX.app` 复验通过：arm64、包内 `grok 0.2.116 (dd04f39)`、隔离 `GROK_HOME`、许可证。  
**不等于**干净 Mac 安装→登录→首任务→退出重开。

### 阶段 3 连接器边界（审计，不扩假能力）

| 连接器 | 目录状态 | 本轮 |
|---|---|---|
| GitHub | `real`：OAuth Device Flow、Keychain、scopes/lastVerified、写前 confirm | 已有证据；网页撤销往返仍缺 |
| Calendar / Slack / 飞书 / Notion / Drive | `soon`：目录声明 scopes，**无**官方授权闭环 | 保持 Soon，不伪装已连接 |
| 第三方 API 模型 | 设置可配；真推理需用户 endpoint | **H2 未验收** |

原则：无官方授权链的服务不得显示已连接；API Key/PAT 仅高级入口。

## 2026-07-31 · Grok Build v0.2.116 最新锁定提交复核

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 上游源码与补丁 | `scripts/verify-grok-kernel-source.sh vendor/grok-build`；`scripts/verify-grok-kernel-patches.sh vendor/grok-build` | 通过：锁定提交 `dd04f397b1d02f2272b092555669dfba1f01bc85`（Grok Build 0.2.116），0001–0006 均可在干净 worktree 顺序应用 | `vendor/grok-build` 为本地忽略的构建输入；不把上游源码复制进 gorkX 仓库 |
| 最新内核编译 | `scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok` | 通过：完整补丁组合可编译，包内资源为 `grok 0.2.116 (dd04f39)`；许可证与第三方声明哈希与锁文件一致 | 未替代 macOS 签名、公证和全新机器安装验收 |
| ACP 运行时 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --desktop-controls --billing-controls --session-search --prompt-history --prompt-suggestion --session-bundle` | 通过：包内 `grok 0.2.116 (dd04f39)` 完成 ACP initialize、桌面动作、账单、会话搜索、提示历史、建议和任务包守卫探针 | 这是无认证能力门禁；真实登录、额度、模型回复和麦克风听写仍需人工验收 |
| 账单周期字段 | Rust `store` 账单解析测试；前端 `billing.test.ts` | 通过：保留服务端 `currentPeriod.type`（周/月）及 `start/end`；百分比 `0` 仍按真实 `0%` 展示，缺失字段不做本地估算 | 当前账户若未返回 `creditUsagePercent`，仍需打开官方已登录使用量页查看订阅额度 |
| 三方模型连接 UX | `Settings → Models & providers → Verify and add`；`npx tsc --noEmit`；`npm run test:stages`；`npm run build` | 通过代码与前端门禁：先发送一次真实协议响应，只有成功才写入 App 引擎配置；失败只保留非秘密验证记录，不保存为已连接 | 本机当前没有第三方凭据或 Ollama，真实 provider 回复仍是发布阻断门槛，不能用 UI 测试替代 |
| 计划审批桌面化 | `Plan approval → Copy plan`；`npx tsc --noEmit`；`npm run test:stages`；`npm run build` | 通过：计划审批卡复制完整引擎 Markdown 到本地剪贴板，不改变批准/修改/退出状态，也不发送模型请求 | 真实计划审批仍需登录任务触发；本门禁只验证前端编译和无副作用代码路径 |
| App-only 包 | `cd apps/desktop && npm run build:app`；`scripts/verify-macos-app-bundle.sh …/gorkX.app` | 通过：arm64 App-only 包已包含 `grok 0.2.116 (dd04f39)`、许可证、NOTICE 与隔离 `GROK_HOME` | 未生成 DMG、未签名/公证，也不替代干净 Mac 安装验收 |
| 内核更新检查 | Settings → Updates → Check for updates；后端固定白名单 `grok update --check --json` | 通过源码审阅与 Rust 白名单测试：桌面现在读取 Grok Build 原生 JSON 的当前/最新版本、频道和更新状态，能够区分网络失败；仅报告，不允许运行时替换 App 自带的源码锁定内核 | 当前网络/账户能否取得上游频道结果由 Grok Build 更新服务决定；在服务返回新版本时仍需开发者重新锁源、补丁、构建和 ACP 回归后更新 gorkX |
| 原生语音适配 | ACP `_x.ai/voice/start|stop|shutdown` 路由编译并保留，沿用 Grok Build 自带低内存 macOS voice pipeline | 通过：语音适配在 0.2.116 上编译并进入包内资源；桌面快捷键设置继续控制 gorkX 窗口内的原生语音入口 | 本次不触发麦克风 TCC、不采集或上传音频；真实转写仍需用户授权后的 macOS 验收 |

| 会话时间线 | `+ → 会话时间线`；`npx tsc --noEmit`；`npm run test:stages`；`npm run build` | 通过：面板索引当前已挂载的用户消息、Grok 回复、计划、工作流和计划任务；点击后只滚动到对应本地 DOM 位置，不发送模型请求、不改写会话 | 只导航当前已加载的会话；跨任务搜索仍使用任务搜索面板，内核历史不会被伪装成本地时间线 |

### v0.2.116 桌面化审计

官方 changelog 的 `/undo` 是 `/rewind` 的内核别名，gorkX 已将它加入 `+` 菜单和会话 slash 选择；两条路径都进入同一套“选择检查点 → 非写入预览 → 冲突时二次确认 → 提交”的安全流程。串流 JSON 输出和最小/全屏 slash 隐藏属于 Grok Build CLI/TUI 行为；gorkX 的 ACP 会话已经持续接收结构化工具、状态和用量更新，因此不重复做终端专属开关。

## 2026-07-31 · 原生提示历史与下一步建议复核

| 范围 | 路由/步骤 | 结果 | 边界 |
|---|---|---|---|
| 持久提示历史 | `+ → 最近提问`；`_x.ai/prompt_history { cwd }` | 通过：桌面合并当前任务与当前项目的 Grok Build 历史，边界化、去重后只回填输入框；隔离 ACP 返回合法空列表 | 不导入原始 transcript，也不把历史当作额度 |
| 下一步建议 | Composer → `建议下一步`；`_x.ai/suggestPrompt { sessionId, generation }` | 通过：按钮仅在用户点击时调用；隔离 ACP 的缺失会话守卫返回 `suggestion: null`，纯解析测试通过 | 真实建议是模型调用，可能消耗额度；建议永不自动发送，需用户插入/编辑/发送 |

## 2026-07-31 · 原生可恢复任务包复核

| 范围 | 路由/步骤 | 结果 | 边界 |
|---|---|---|---|
| 任务包格式 | `sessionBundle.test.ts`；`createSessionBundle` / `parseSessionBundleText` / `serializeSessionBundle` | 通过：版本、会话 ID、项目路径、summary 列、更新数量、单条更新大小和总文件大小均有边界；序列化往返、版本错误和超大更新均有纯测试 | 本地文件仍可能包含完整任务内容，导出和导入均必须经过隐私提示与用户选择 |
| 原生会话读取 | `_x.ai/session/state`、`_x.ai/session/updates { offset, limit }`；`verify-grok-acp.mjs --session-bundle` | 通过：锁定 Grok Build 0.2.112 对缺失会话返回合法 state 守卫，updates 返回分页空结果；桌面分页最多 100,000 条更新 | 未用用户主目录读取真实任务；真实已认证导出需人工确认内容边界 |
| 原生会话恢复 | `_x.ai/session/import`；`verify-grok-acp.mjs --session-bundle` | 通过：缺少 summary 的无效包在内核原生校验处被拒绝；桌面导入要求 JSON 文件、目标项目和二次确认，成功后用正常 `session/load` 重连 | 探针不写入会话；跨设备真实导出→导入仍需用户登录后手动验收，不把路由守卫写成完整恢复成功 |

## 2026-07-31 · 原生提示队列复核

| 范围 | 命令或证据 | 结果 | 边界 |
|---|---|---|---|
| 队列状态解析 | `cd apps/desktop && npm run test:stage-a`；`promptQueue.test.ts` | 通过：`x.ai/queue/changed` 的多项条目、位置排序、版本、运行中提示和组合文本均做有界解析；重复 ID、畸形条目和超限输入被拒绝或丢弃 | 纯解析门禁不证明用户账号已排队或模型已执行；真实队列需要登录后的运行中任务 |
| 桌面队列接线 | `AcpClient` 的 `x.ai/queue/changed` 监听与 `x.ai/queue/edit|remove|reorder|clear|interject` 通知；运行中 composer 原生队列卡片 | 通过源码与 TypeScript 门禁：普通文本排队走 `session/prompt`，队列卡片的编辑、删除、重排、清空、立即插入均发送真实 Grok Build 路由；状态按 sessionId 隔离 | 当前不把附件伪装成原生队列内容；附件仍走下一轮本地回退。真实账号下的多项排队、版本冲突和立即插入仍需人工点按验收 |

## 2026-07-31 · 桌面动作原生 ACP 化复核

| 范围 | 路由/步骤 | 结果 | 边界 |
|---|---|---|---|
| 运行中旁问、插入与记忆提炼 | 锁定 Grok Build 0.2.112；`_x.ai/btw`、`_x.ai/interject`、`_x.ai/memory/flush` | 通过：桌面按钮分别调用真实侧问、运行中插入和内核记忆 flush 路由；`scripts/verify-grok-acp.mjs --desktop-controls` 对所有路由完成无模型请求的原生 session guard 探测。 | 真实模型侧问与运行中安全点注入仍需登录后人工点按验收；带附件的插入暂回退到下一轮队列。 |
| 工作流、Goal 与通用桌面动作 | 锁定 Grok Build 0.2.116 + `0005-acp-desktop-actions.patch`；`_x.ai/desktop/workflow/launch`、`_x.ai/desktop/workflow/manage`、`_x.ai/desktop/goal`、`_x.ai/desktop/command` | 通过编译级验证：工作流入口复用现有 WorkflowManager，桌面工作流卡片已提供真实运行、暂停/继续、停止、保存按钮；停止/保存由 UI 明确确认后调用原生 manage 路由。Goal 入口复用现有 prompt/Goal orchestrator，通用入口仅把已存在的 Grok Build 命令解析包在结构化 ACP 请求内；桌面动作的 synthetic prompt 回显隐藏，用户会话显示由 gorkX 负责。 | 本轮已通过 `cargo check -p xai-grok-shell`、补丁 series apply-check；真实已认证账户下的工作流执行时间、停止取消结果和项目保存结果仍需人工点按验收，不把“路由可达”写成“任务已完成”。 |
| 损坏会话修复 | 认证态 `--session-controls` 追加 `_x.ai/session/repair {dryRun:true}`；错误面板的预览/确认/修复入口 | 通过：当前 0.2.112 真实路由返回结构化 dry-run 报告；桌面只在工具配对/历史损坏错误上显示修复按钮，并在写入前展示修复计数、要求明确确认。 | 本次探针使用干净会话，不修改任何历史；真实损坏会话的恢复仍需在用户确认后人工验收。 |

| 范围 | 命令或步骤 | 结果 | 边界 |
|---|---|---|---|
| Feedback 桌面入口 | `+` 菜单 → “发送反馈”；`AcpClient.sendFeedback()` → `_x.ai/feedback` | 通过：按钮不再把 `/feedback ...` 当作会话提示发送，改为 Grok Build 原生反馈扩展；提交成功后只在本地会话显示确认，不污染模型对话 | 反馈是否上报到远端由 Grok Build 账户/反馈配置决定；本次未伪造反馈内容或远端统计 |
| Recap 桌面入口 | `+` 菜单 → “总结本次会话”；`AcpClient.requestRecap()` → `_x.ai/recap`；实际包内二进制缺失会话探针 | 通过：参数按 0.2.112 的 `sessionId` 契约发送，路由抵达真实会话守卫；异步 `session_recap` / `session_recap_unavailable` 被桌面解析并显示在当前会话 | 回顾是内核异步模型调用；未认证/无真实会话探针不发送模型请求，真实摘要质量仍属于账号和模型行为 |
| 桌面回归 | `cd apps/desktop && npx tsc --noEmit && npm run test:stages && npm run build`；`cd apps/desktop/src-tauri && cargo test && cargo check`；`scripts/verify-grok-kernel-patches.sh`；无认证 ACP initialize | 通过：前端、80 项 Rust 测试、内核补丁 series、包内 ACP initialize 均通过 | 未生成新 DMG、未打 tag、未发布；仅更新源码与证据台账 |

## 2026-07-31 · Review 代理变更审阅复核

| 范围 | 路由/步骤 | 结果 | 边界 |
|---|---|---|---|
| Hunk Tracker 能力声明 | ACP initialize 的 clientCapabilities.meta.x.ai/hunkTracker = { mode: agent_only } | 通过源码与包内内核 0.2.112 扩展复核；gorkX 不从 Git 时间戳推断代理归属 | 只跟踪内核登记的 agent hunks；外部修改不会被误标成代理变更 |
| Review 文件摘要 | Review → Agent changes → x.ai/hunk-tracker/get-files（首选 _x.ai 兼容路由） | 已接入真实 ACP 调用，展示路径、变更块数、增删行数和暂存状态；无能力或旧内核时隐藏页签 | 认证态一次性 --hunk-controls 探针需使用明确的隔离 GROK_HOME 与项目目录；本次未用用户主目录做破坏性测试 |
| 接受/撤销 | Review → Agent changes → “全部接受/全部撤销” → 明确确认 → x.ai/hunk-tracker/all-action | 已接入原生内核动作；接受写入新的 tracker baseline，撤销由内核恢复旧内容；运行中任务禁用按钮 | 真实文件写入仍需用户在登录后的临时项目人工点按验收；gorkX 不提供假装可恢复的本地回滚 |

## 2026-07-26 · 受控内核 0.2.112 与成果中心回归

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 当前受控内核 | `apps/desktop/src-tauri/resources/grok --version` | 通过：当前应用资源为 `grok 0.2.112 (47348d1)` | 版本号不替代登录、实际模型回复或 macOS 安装验收 |
| 正式安装的数据隔离 | `paths::grok_home` 仅在 debug 构建接受 `GROK_HOME` / `GORKX_GROK_HOME` / 系统 CLI home 覆盖；`cargo test && cargo check --release`；`npm run build:app` 后运行 `verify-macos-app-bundle.sh` | 通过：正式构建始终将 Grok 认证、会话与配置置于 `~/Library/Application Support/gorkX/grok-home`，不会继承用户 CLI 的 `~/.grok` 或启动环境指定的外部数据目录；重建 App 的包内内核、许可证和隔离 `GROK_HOME` 也通过，版本 `0.2.112 (47348d1)`。 | 证明发行包的数据归属与包结构，不替代全新 macOS 的网页登录、真实对话和退出重开人工闭环。 |
| 内核 HOME 发现隔离 | 先以仅隔离 `GROK_HOME` 运行包内 `grok inspect --json`，再以一次性 `HOME` + `GROK_HOME` 运行同一命令；`paths::tests::engine_child_uses_only_app_owned_home_locations` | 通过：前者实际发现用户 `~/.agents/skills`，证明仅设置 `GROK_HOME` 不足；后者 `skills` 为空。gorkX 现为每个 Grok Build 子进程设置 App-owned `HOME`，并由第 65 项 Rust 测试锁定该环境。 | 子进程仍可通过受控 PATH 调用系统开发工具；这不是读取用户的 Grok/Agent 配置。 |
| Computer Hub 桌面入口 | 包内 `grok workspace --help`、`start/status/pause --help`；在隔离未登录 HOME 中运行 `workspace status --json`；gorkX 固定命令白名单测试 | 通过：0.2.112 实际提供 workspace start / pause / resume / stop / restart / status，且命令受本地 `GROK_WORKSPACE_COMMAND=1` 与服务端账户开关双重控制。gorkX 仅提供状态读取和当前选中项目的固定动作；开始、恢复、暂停、断开均先要求本地确认。 | 隔离未登录状态返回“无法加载设置”，故本轮不宣称已有可用 Hub 或远端电脑控制；真实账号是否获服务端开启及 Hub 的实际操作仍待人工验收。 |
| 前台 Computer 控制与 MCP 桥接 | Rust `computer` / `computer_mcp` 单元测试；MCP `initialize`、`tools/list`、`tools/call` 协议实测；`computer_accessibility_status` / `computer_control_set_enabled` / `computer_control_emergency_stop`；设置页注册与固定动作 | 通过：动作只经 `/usr/bin/osascript` 的固定脚本模板执行，启用前必须获得 macOS Accessibility 权限并确认；App 自带 MCP 只注册固定的截图、点击、按键、文字和急停工具；跨进程租约让急停后续调用失败；不接受模型或任务传入的 AppleScript。 | 当前环境未授予 gorkX 辅助功能权限，因此未宣称一次真实点击/按键结果；仍需在已授权 Mac 上人工验收 MCP 工具发现、截图和前台动作。Grok Build 0.2.116 的原生 `grok-computer` 仍是文件/终端工具集，MCP 桥接不等同于原生 Computer ACP。 |
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
| 每日 Token 本地记录 | `cd apps/desktop && npx tsc --noEmit && npm run test:stages`；`cd src-tauri && cargo check && cargo test`；本机新构建 App 打开“设置 → 使用情况和计费” | 通过：界面显示今日累计、输入/输出拆分和近 7 天趋势；缺失日期显示为零。0.2.116 的 ACP 回合响应含 `usage` 时，gorkX 仅在完成响应出现时按消息 ID 去重写入本机 SQLite，快照只更新当前上下文显示。前端阶段测试通过，Rust 81 项测试通过 | 未发起模型提示以制造计数；首次真实任务收到 PromptResponse usage 后才会形成今日累计。该数不是订阅额度、账单金额或估算值 |
| 项目 Hook 创作 | `cd apps/desktop && npx tsc --noEmit && npm run test:stage-a`；`cd src-tauri && cargo check && cargo test` | 通过：设置中的引导表单只允许固定事件、`command`/HTTPS handler、受限超时和安全文件名；Tauri 后端只在当前项目 `.grok/hooks` 下原子写入并拒绝 symlink，Rust/TS 测试覆盖 JSON、HTTPS、路径和文件名边界。保存不会授信或执行 Hook | 仍需在一个真实已授信项目中运行一次 Hook，验证由 Grok Build 执行而不是 App 自行执行 |

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
| 运行中旁问 `/btw`（历史结果，已被新锁定提交覆盖） | `GROK_HOME=<临时认证 home> node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --btw` | 2026-07-29 的 `0.2.112 (47348d1)` 资源返回 `Method not found`；2026-07-31 以当前锁定提交 `5da6962…` 重建资源后，`--desktop-controls` 已确认 `_x.ai/btw` 路由可达 | 旧二进制结论不再代表当前包；真实模型侧问仍需登录后人工点按验收。 |
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
| 补丁 series | `scripts/verify-grok-kernel-patches.sh` | PASS · 当前 series 含 0001–0005 |
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
