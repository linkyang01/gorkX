# gorkX

<p align="center">
  <img src="docs/screenshots/00-icon.png" width="92" alt="gorkX" />
</p>

<p align="center"><strong>Grok Build, made usable for real work.</strong></p>

<p align="center">
  gorkX is the calm desktop command center for turning a folder, a question, or a messy brief into work you can see, direct, and finish — without living in the terminal.
</p>

<p align="center">
  <a href="https://github.com/linkyang01/gorkX/releases/download/v1.0.0/gorkX_1.0.0_aarch64.dmg"><strong>↓ Download gorkX 1.0.0 for macOS Apple Silicon</strong></a><br />
  <sub>macOS 12+ · Apple Silicon · <a href="https://github.com/linkyang01/gorkX/releases">All releases</a> · link active after approved ship</sub>
</p>

<p align="center">
  <a href="#why-gorkx">Why gorkX</a> ·
  <a href="#what-you-get">What you get</a> ·
  <a href="#install">Install</a> ·
  <a href="#中文">中文</a>
</p>

<p align="center">
  <a href="https://github.com/linkyang01/gorkX/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/linkyang01/gorkX?display_name=release&label=macOS" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-2563eb.svg" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20Apple%20Silicon-111827.svg" />
</p>

![gorkX main workspace](docs/screenshots/02-main.jpg)

## Why gorkX

Grok Build is a strong agent engine. A terminal is rarely the best place to run a project, compare options, draft a document, or understand what changed. gorkX gives the engine a **desktop home** — so important work stays visible, steerable, and reviewable.

### Advantages that matter day to day

| Advantage | What it means for you |
|---|---|
| **Outcome first** | Describe what you want done. Guided starters cover reading material, reports, research, decisions, planning, code exploration, and fixes — no command vocabulary required. |
| **Real kernel, not a mock** | Ships a locked Grok Build engine, talks over ACP, and manages its own sessions under an app-owned `GROK_HOME`. One install. No separate CLI hunt. |
| **Stay in control** | Stream the run, see tools and plans, answer with clear choices, approve permissions deliberately. High-risk steps stay visible and refuse-able. |
| **Multi-task you can trust** | Run more than one task; switch freely. The **Run center** and **Decisions** inbox show real ACP status — not fake progress bars. |
| **Results as a product** | **Deliverables** collect files and media the agent actually returned — open, preview, and safely edit text in-project. No silent “scan your disk and guess.” |
| **Inspect before you accept** | Review diffs, plans, tool activity, and local Git state before you move on. |
| **Context that survives** | Projects, durable tasks, local memory, search, archive/restore, and project instructions keep long work coherent. |
| **Models you can verify** | Grok sign-in, plus real API / compatible providers with connection tests and provider · model shown on the task — web subscriptions are never dressed up as API logins. |
| **Private by architecture** | App data stays under Application Support. Project folders stay project folders. No silent read of `~/.grok` or browser cookies. |

Slash commands remain for experts. They are not the front door.

## What you get

| You want to… | gorkX helps you… |
|---|---|
| Turn a vague brief into motion | Outcome starters, focused composer, goals, engine plans, approval cards when a decision is needed. |
| Work on code or documents safely | Project-scoped tasks, file trust and permissions, terminal, worktrees, sandbox profiles, Review. |
| Run several things at once | Independent tasks, run status, decision queue keyed to the right session. |
| Ship something concrete | Deliverables panel, rich previews, safe text/Markdown edit, copy summary / open in Finder / export. |
| Keep work moving on a rhythm | Scheduled briefings and follow-ups; optional plan-only background worker on macOS — external writes never run unattended. |
| Collaborate when you’re ready | GitHub connect (official device flow), read PRs/checks, create PR or comment only after you confirm. |
| Understand the run | Streaming answers, process view, tool history, task info, Chinese-first readable summaries. |
| Speak instead of type | Native macOS voice capture into an **editable draft** — never auto-sent. |
| Research with control | Open supplied web sources in a reading window; control whether web research is available to new tasks. |

### Built for work around code, too

Reports, research briefs, ops checklists, content drafts, handoffs, and hard decisions use the same flow as coding. Capability without forcing every user to learn a command language.

## One clear flow

| Start | Direct | Verify | Remember |
|---|---|---|---|
| Pick a project and describe the outcome. | Steer with the composer, starters, choices, plans, and permissions. | Inspect changes, tools, plans, deliverables, and Git. | Keep useful context locally for the next task. |

![Review panel showing agent activity](docs/screenshots/03-review.jpg)

![Local memory management](docs/screenshots/01-memory.jpg)

## Install

### Get the app

**[Download gorkX 1.0.0 for macOS Apple Silicon](https://github.com/linkyang01/gorkX/releases/download/v1.0.0/gorkX_1.0.0_aarch64.dmg)** · open the DMG · drag **gorkX** to Applications · open it.

> **Release note:** Until `v1.0.0` is tagged and published, use the latest
> [GitHub Release](https://github.com/linkyang01/gorkX/releases) or build from
> source. See [`docs/RELEASE_NOTES_v1.0.0.md`](docs/RELEASE_NOTES_v1.0.0.md).

On first launch, macOS may ask you to allow an unrecognized developer under **System Settings → Privacy & Security**. gorkX then guides Grok sign-in in the browser. You can also add API or compatible providers in Settings when you have keys.

> **Tip:** If Gatekeeper blocks a first open, allow it in System Settings, or run:
> `xattr -dr com.apple.quarantine /Applications/gorkX.app`

> **Signing boundary:** Public builds may be ad-hoc until Developer ID + notarization
> credentials are available. That is honest and expected — not a “download and open
> with zero Gatekeeper steps” claim.

### Run from source

```bash
git clone https://github.com/linkyang01/gorkX.git
cd gorkX/apps/desktop
npm install
npm run tauri dev
```

Optional development engine path:

```bash
export GORKX_GROK_CMD=/path/to/grok
npm run tauri dev
```

## Private by architecture

Application data stays separate from the folder you are working in. No separately installed Grok CLI required; no scan of `~/.grok`.

```text
~/Library/Application Support/gorkX/
  gorkx.db       # task index and local app state
  grok-home/     # app-owned Grok Build sessions, login, config, memory
  runtime/       # optional managed runtime files
```

```text
React + Tauri 2 desktop app
projects · tasks · review · deliverables · memory · settings
                  │
                  │ ACP stdio
                  ▼
App-owned Grok Build kernel
sessions · tools · models · voice · config
```

## Looking ahead

gorkX ships a focused, production-ready path for **macOS Apple Silicon** today. Deeper workspace integrations and broader platforms continue to expand in the same spirit: real authorization, explicit confirmation, and no fake “connected” states.

For auditable detail, see the [feature matrix](docs/FEATURES.md). For product direction, see the [product development plan](docs/PRODUCT_DEVELOPMENT_PLAN.md).

**Formal release (v1.0.0 Stable):** the single executable plan is
[`docs/FORMAL_RELEASE_PLAN.md`](docs/FORMAL_RELEASE_PLAN.md). In a development
session, say **「按方案做」** to run it end-to-end to a release candidate
(tag / Release / DMG still need your explicit approval).

## Development

```bash
cd apps/desktop
npm run typecheck
npm run test:stages
npm run build
cd src-tauri && cargo test && cargo check
```

## Contribute

Issues and pull requests are welcome. The best contributions make agents easier to direct, easier to audit, and more useful to people who have work to finish.

If gorkX helps, please **star the repository** and share it with someone ready to move beyond the terminal-only loop.

## License

[Apache-2.0](LICENSE)

---

# 中文

<p align="center"><strong>把 Grok Build 变成真正好用的桌面工作台。</strong></p>

<p align="center">
  gorkX 让一个文件夹、一个问题或一团乱麻的需求，变成看得见、能指挥、可交付的实际进展 —— 不必整日泡在终端里。
</p>

<p align="center">
  <a href="https://github.com/linkyang01/gorkX/releases/download/v1.0.0/gorkX_1.0.0_aarch64.dmg"><strong>↓ 下载 gorkX 1.0.0（macOS Apple Silicon）</strong></a><br />
  <sub>macOS 12+ · Apple Silicon · <a href="https://github.com/linkyang01/gorkX/releases">查看全部版本</a></sub>
</p>

<p align="center">
  <a href="#为什么选择-gorkx">为什么是 gorkX</a> ·
  <a href="#你能得到什么">你能得到什么</a> ·
  <a href="#安装-1">安装</a> ·
  <a href="#gorkx">English</a>
</p>

## 为什么选择 gorkX

Grok Build 是很强的 Agent 引擎，但终端并不总是适合推进项目、比较方案、起草材料，或回看究竟发生了什么。gorkX 给它一个**桌面上的家**：真正重要的工作始终留在眼前、可指挥、可审阅。

### 日常真正有用的优势

| 优势 | 对你意味着什么 |
|---|---|
| **从结果出发** | 说清楚要完成什么即可。阅读材料、写报告、调研决策、项目计划、代码探索与修复都有易懂入口，不必先学命令。 |
| **真内核，不是壳** | 内置锁定版本的 Grok Build，经 ACP 通信，会话与配置在应用自管的 `GROK_HOME`。装好就能用，不用另找 CLI。 |
| **人始终在回路里** | 流式过程、工具与计划可见；用选项回答问题；权限与高风险动作需你明确确认，可拒绝。 |
| **可信的多任务** | 多个任务并行推进，随时切换。**运行中心**与**待处理决定**只反映真实 ACP 状态，不造假进度。 |
| **成果就是产品单位** | **本次成果**汇总 Agent 明确回传的文件与媒体：打开、预览、在项目内安全编辑文本。不静默扫盘猜产出。 |
| **先审阅，再接收** | 改动、计划、工具活动、本地 Git 状态都可直接检查。 |
| **上下文不断线** | 项目、持久任务、本地记忆、搜索、归档恢复与项目指令，让长周期工作保持连贯。 |
| **模型可验证** | Grok 登录 + 真实 API/兼容提供商；连接测试与任务上显示「提供商 · 模型」；网页订阅不会被说成 API 已连接。 |
| **架构级隐私** | 应用数据在 Application Support；项目目录仍是项目目录。不偷偷读 `~/.grok` 或浏览器 Cookie。 |

熟练用户仍可使用斜杠命令；普通用户不需要先学会命令，才能把事情做好。

## 你能得到什么

| 你想做的事 | gorkX 的体验 |
|---|---|
| 把模糊需求变成下一步 | 面向结果的快捷入口、专注输入、目标、内核计划，以及需要你决定时才出现的审批。 |
| 安全处理代码或材料 | 项目范围任务、文件信任与权限、终端、工作树、沙箱与审阅。 |
| 同时推进多项工作 | 独立任务、运行状态、按原任务归属的决定收件箱。 |
| 留下可打开的成果 | 成果面板、富预览、安全编辑、复制摘要 / 在访达中显示 / 导出。 |
| 按节奏跟进 | 定时简报与跟进；可选 macOS 后台（仅规划）；外发与改远端绝不会无人值守执行。 |
| 需要时再连工作平台 | GitHub 官方设备授权；读 PR/检查；创建 PR 或评论须逐次确认。 |
| 看懂一次 Agent 工作 | 流式回答、过程视图、工具记录、任务信息、中文优先的可读摘要。 |
| 用说话代替输入 | 原生 macOS 采集与转写，结果进入**可编辑草稿**，绝不静默发送。 |
| 有控制地调研 | 独立窗口打开你指定的网页资料；可控制新任务是否启用网页研究。 |

### 不只服务开发者

报告、调研简报、运营清单、内容草稿、项目交接和复杂决策，也适合这套流程。保留高手入口，但不要求每位用户先学一套命令语言。

## 一条清晰的工作流

| 开始 | 指挥 | 验证 | 记住 |
|---|---|---|---|
| 选择项目，描述想要的结果。 | 用输入框、快捷入口、选择项、计划和权限引导内核。 | 审阅改动、工具、计划、成果与 Git。 | 把真正有用的上下文留在本地，供下次使用。 |

## 安装

### 下载应用

**[下载 gorkX 1.0.0（macOS Apple Silicon）](https://github.com/linkyang01/gorkX/releases/download/v1.0.0/gorkX_1.0.0_aarch64.dmg)**，打开 DMG，将 **gorkX** 拖入“应用程序”，然后启动。

> **发布说明：** 在 `v1.0.0` tag 与 Release 公开前，请使用最新
> [GitHub Release](https://github.com/linkyang01/gorkX/releases) 或从源码构建。
> 详见 [`docs/RELEASE_NOTES_v1.0.0.md`](docs/RELEASE_NOTES_v1.0.0.md)。

首次打开时，如系统提示开发者未被识别，可在“**系统设置 → 隐私与安全性**”中允许。随后会引导你在浏览器登录 Grok；若你持有提供商密钥，也可在设置中配置 API 或兼容提供商。

> **提示：** 若首次打开被拦截，可在系统设置中允许，或执行：  
> `xattr -dr com.apple.quarantine /Applications/gorkX.app`

> **签名边界：** 在完成 Developer ID 与公证前，公开构建可能是 ad-hoc 签名；
> 不宣称「下载即可开、无需绕过 Gatekeeper」。

### 从源码运行

```bash
git clone https://github.com/linkyang01/gorkX.git
cd gorkX/apps/desktop
npm install
npm run tauri dev
```

开发时如需指定自己的内核：

```bash
export GORKX_GROK_CMD=/path/to/grok
npm run tauri dev
```

## 数据与隐私

应用数据与正在处理的项目目录分开保存。不要求另装 Grok CLI，也不会扫描 `~/.grok`。

```text
~/Library/Application Support/gorkX/
  gorkx.db       # 任务索引与本地应用状态
  grok-home/     # 应用自管的 Grok Build 会话、登录、配置、记忆
  runtime/       # 可选的受管运行时文件
```

```text
React + Tauri 2 桌面应用
项目 · 任务 · 审阅 · 成果 · 记忆 · 设置
                  │
                  │ ACP stdio
                  ▼
应用自管的 Grok Build 内核
会话 · 工具 · 模型 · 语音 · 配置
```

## 持续演进

gorkX 当前以 **macOS Apple Silicon** 为主力交付路径。更多工作平台对接与跨平台覆盖会按同一原则推进：真实授权、逐次确认、从不假装“已连接”。

如需逐项核对，见[功能矩阵](docs/FEATURES.md)；产品方向见[产品开发计划](docs/PRODUCT_DEVELOPMENT_PLAN.md)。

**正式版（v1.0.0 Stable）唯一执行方案：**
[`docs/FORMAL_RELEASE_PLAN.md`](docs/FORMAL_RELEASE_PLAN.md)。  
在开发会话中说 **「按方案做」**，即可按该方案连续执行到发布候选完成  
（打 tag / 发 Release / 上传 DMG 仍须你明确批准）。

## 开发与验证

```bash
cd apps/desktop
npm run typecheck
npm run test:stages
npm run build
cd src-tauri && cargo test && cargo check
```

## 参与贡献

欢迎提交 Issue 和 PR。最有价值的贡献，是让 Agent 更容易指挥、更容易审阅，也让更多人能真正用它完成工作。

如果 gorkX 对你有帮助，欢迎 **Star**，也请分享给仍被终端工作流困住的朋友。

## 许可证

[Apache-2.0](LICENSE)
