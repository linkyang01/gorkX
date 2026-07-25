# gorkX

<p align="center">
  <img src="docs/screenshots/00-icon.png" width="92" alt="gorkX" />
</p>

<p align="center"><strong>Grok Build, made usable for real work.</strong></p>

<p align="center">
  gorkX is the calm desktop command center for turning a folder, a question, or a messy brief into work you can see, direct, and review.
</p>

<p align="center">
  <a href="https://github.com/linkyang01/gorkX/releases/download/v0.4.4/gorkX_0.4.4_aarch64.dmg"><strong>↓ Download gorkX 0.4.4 for macOS Apple Silicon</strong></a><br />
  <sub>macOS 12+ · Apple Silicon · <a href="https://github.com/linkyang01/gorkX/releases">All releases</a></sub>
</p>

<p align="center">
  <a href="#why-gorkx">Why gorkX</a> ·
  <a href="#the-workspace">The workspace</a> ·
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

Grok Build is a powerful agent engine. A terminal is not always the best place to run a project, compare a decision, draft a document, or understand what changed. gorkX gives the engine a desktop home where the important parts of the work remain visible.

- **Start from an outcome, not a command.** Choose a folder and describe what you need. Guided starters help with reading material, drafting reports, research, comparison, planning, code exploration, and fixes.
- **Stay in the loop without living in the loop.** Watch the agent stream, see the tools it uses, answer questions with clear choices, approve plans and permissions deliberately, and keep the work moving.
- **Trust results because you can inspect them.** Review changed files, plans, tool activity, and local Git state before you accept the result or move on.
- **Return to work that still knows its context.** Projects, durable tasks, local memory, task search, archives, and project instructions keep a long-running effort coherent.
- **Keep the real engine.** gorkX ships and manages a locked Grok Build kernel, connects through ACP stdio, and keeps its own sessions, configuration, and memory separate from your repositories.

Slash commands remain available for experienced users. They are no longer the front door.

## The workspace

| You want to do | gorkX gives you |
|---|---|
| Turn a vague request into action | Outcome-oriented starters, a focused composer, goals, engine-generated plans, and approval cards when a decision is needed. |
| Work with code or documents safely | Project-scoped tasks, explicit file trust and permission prompts, terminal access, worktrees, sandbox profiles, and a review surface. |
| Understand an agent run | Streaming answers, a compact process view, tool history, task information, plan state, and readable Chinese-first summaries. |
| Keep useful context | Inspectable local memory, project instructions, durable task history, global task search, archive and restore. |
| Choose the right model | Grok sign-in plus real API or compatible-provider setup, returned-model selection, per-model connection tests, defaults, and session switching. |
| Speak instead of type | Grok Build’s native macOS voice capture and streaming transcription, with the final text placed in an editable draft — never silently sent. |
| Research with control | Open supplied web sources in a separate reading window; control whether Grok Build web search is available to new tasks. |
| Diagnose and tune | Built-in engine diagnostics, session information, media-tool controls, sandbox settings, and managed kernel/app update information. |

### Built for the work around code, too

gorkX is useful when the output is a report, research brief, operations checklist, content draft, project handoff, or a difficult decision — not only when the output is code. The agent can stay capable without making every user learn a command vocabulary.

## One clear flow

| Start | Direct | Verify | Remember |
|---|---|---|---|
| Pick a project and describe the outcome. | Use the composer, task starters, choices, plans, and permissions to steer the engine. | Inspect changes, tools, plans, and Git state. | Keep the useful context locally for the next task. |

![Review panel showing agent activity](docs/screenshots/03-review.jpg)

![Local memory management](docs/screenshots/01-memory.jpg)

## Install

### Get the app

**[Download gorkX 0.4.4 for macOS Apple Silicon](https://github.com/linkyang01/gorkX/releases/download/v0.4.4/gorkX_0.4.4_aarch64.dmg)**, open the DMG, drag **gorkX** to Applications, then open it.

On first launch, macOS may ask you to approve an unrecognized developer in **System Settings → Privacy & Security**. gorkX then guides you through Grok sign-in in the browser. API and compatible providers can also be configured in Settings when you have a provider key.

### Run from source

```bash
git clone https://github.com/linkyang01/gorkX.git
cd gorkX/apps/desktop
npm install
npm run tauri dev
```

To use a development engine rather than the bundled kernel:

```bash
export GORKX_GROK_CMD=/path/to/grok
npm run tauri dev
```

## Private by architecture

gorkX keeps application-owned data apart from the folder you are working in. It does not require a separately installed Grok CLI and does not scan `~/.grok`.

```text
~/Library/Application Support/gorkX/
  gorkx.db       # task index and local app state
  grok-home/     # app-owned Grok Build sessions, login, config, memory
  runtime/       # optional managed runtime files
```

The app talks to its managed kernel over ACP stdio:

```text
React + Tauri 2 desktop app
projects · tasks · review · memory · settings
                  │
                  │ ACP stdio
                  ▼
App-owned Grok Build kernel
sessions · tools · models · voice · config
```

## Built with honest edges

gorkX is actively developed, with macOS Apple Silicon as its first platform. It is designed to make real Grok Build workflows easier to direct and inspect, not to simulate capabilities the engine or an authorization flow cannot support. Some deeper connector and desktop-automation experiences are on the roadmap; they stay out of the main product path until their full authorization and safety flow is ready.

For the precise, auditable capability status, see the [feature matrix](docs/FEATURES.md). For the product direction, see the [independent app plan](docs/INDEPENDENT_APP_PLAN.md).

## Development

```bash
cd apps/desktop
npx tsc --noEmit
npm run build
cd src-tauri
cargo test
cargo check
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
  gorkX 让一个文件夹、一个问题或一团乱麻的需求，变成看得见、能指挥、可审阅的实际进展。
</p>

<p align="center">
  <a href="https://github.com/linkyang01/gorkX/releases/download/v0.4.4/gorkX_0.4.4_aarch64.dmg"><strong>↓ 下载 gorkX 0.4.4（macOS Apple Silicon）</strong></a><br />
  <sub>macOS 12+ · Apple Silicon · <a href="https://github.com/linkyang01/gorkX/releases">查看全部版本</a></sub>
</p>

<p align="center">
  <a href="#为什么选择-gorkx">为什么是 gorkX</a> ·
  <a href="#工作台能做什么">工作台能力</a> ·
  <a href="#安装">安装</a> ·
  <a href="#gorkx">English</a>
</p>

## 为什么选择 gorkX

Grok Build 是很强的 Agent 引擎，但终端并不总是适合推进项目、比较方案、起草材料，或回看究竟发生了什么。gorkX 给它一个桌面上的家：真正重要的工作信息始终留在眼前。

- **从想完成什么开始，而不是从命令开始。** 选择文件夹，说明结果；阅读材料、起草报告、调研比较、项目计划、代码探索和修复，都有易懂的快捷入口。
- **始终在场，但不必盯着终端。** 看 Agent 流式工作、了解它调用的工具、用选项回答问题、明确审批计划与权限，让工作持续向前。
- **先审阅，再接收结果。** 文件改动、计划、工具活动和本地 Git 状态都可以直接检查。
- **下次回来，工作仍然连贯。** 项目、持久任务、本地记忆、全局任务搜索、归档和恢复，让长任务不再断线。
- **保留真实的引擎能力。** gorkX 内置并管理锁定版本的 Grok Build 内核，通过 ACP stdio 通信；它的会话、配置和记忆与项目仓库分开保存。

熟练用户仍可使用斜杠命令；普通用户不需要先学会命令，才能把事情做好。

## 工作台能做什么

| 你想做的事 | gorkX 提供的体验 |
|---|---|
| 把模糊需求变成下一步 | 面向结果的快捷入口、专注输入框、目标、由内核生成的计划，以及需要你决定时才出现的审批卡片。 |
| 安全处理代码或材料 | 项目范围内的任务、明确的文件信任和权限提示、终端、工作树、沙箱档位与审阅入口。 |
| 看懂一次 Agent 工作 | 流式回答、紧凑过程视图、工具记录、任务信息、计划状态，以及中文优先的可读摘要。 |
| 留住真正有用的上下文 | 可查看的本地记忆、项目指令、持久任务历史、全局搜索、归档与恢复。 |
| 选择合适的模型 | Grok 登录，或真实 API / 兼容提供商配置；读取返回模型、连接测试、默认模型和会话切换。 |
| 用说话代替输入 | 复用 Grok Build 原生 macOS 采集与流式转写；最终文本先进入可编辑草稿，绝不静默发送。 |
| 有控制地阅读与调研 | 在独立阅读窗口打开你指定的网页资料；可控制新任务是否启用 Grok Build 网页搜索。 |
| 排查与调整 | 内核诊断、会话信息、媒体工具控制、沙箱设置，以及受管内核与应用更新信息。 |

### 不只服务开发者

报告、调研简报、运营清单、内容草稿、项目交接和复杂决策，也适合这套流程。gorkX 保留高手需要的效率入口，但不要求每位用户先学习一套命令语言。

## 一条清晰的工作流

| 开始 | 指挥 | 验证 | 记住 |
|---|---|---|---|
| 选择项目，描述想要的结果。 | 用输入框、快捷入口、选择项、计划和权限控制来引导内核。 | 审阅改动、工具、计划与 Git 状态。 | 把真正有用的上下文留在本地，供下一次任务使用。 |

## 安装

### 下载应用

**[下载 gorkX 0.4.4（macOS Apple Silicon）](https://github.com/linkyang01/gorkX/releases/download/v0.4.4/gorkX_0.4.4_aarch64.dmg)**，打开 DMG，将 **gorkX** 拖入“应用程序”，然后启动。

首次打开时，macOS 如提示开发者未被识别，可在“**系统设置 → 隐私与安全性**”中允许打开。随后应用会引导你在浏览器中登录 Grok；如你持有提供商密钥，也可以在“设置”中配置 API 或兼容提供商。

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

gorkX 的应用数据与正在处理的项目目录分开保存。不要求用户另装 Grok CLI，也不会扫描 `~/.grok`。

```text
~/Library/Application Support/gorkX/
  gorkx.db       # 任务索引与本地应用状态
  grok-home/     # 应用自管的 Grok Build 会话、登录、配置、记忆
  runtime/       # 可选的受管运行时文件
```

桌面应用通过 ACP stdio 与受管内核通信：

```text
React + Tauri 2 桌面应用
项目 · 任务 · 审阅 · 记忆 · 设置
                  │
                  │ ACP stdio
                  ▼
应用自管的 Grok Build 内核
会话 · 工具 · 模型 · 语音 · 配置
```

## 真实能力，清晰边界

gorkX 正在积极开发，当前优先支持 macOS Apple Silicon。它的目标是让真实的 Grok Build 工作流更容易指挥、更容易检查，而不是把还没有完整授权与安全链路的能力包装成“已连接”。更深入的连接器和桌面自动化体验正在完善，完整流程就绪后才会进入主操作路径。

如需逐项核对能力状态，请查看[功能矩阵](docs/FEATURES.md)；产品方向见[独立应用计划](docs/INDEPENDENT_APP_PLAN.md)。

## 开发与验证

```bash
cd apps/desktop
npx tsc --noEmit
npm run build
cd src-tauri
cargo test
cargo check
```

## 参与贡献

欢迎提交 Issue 和 PR。最有价值的贡献，是让 Agent 更容易指挥、更容易审阅，也让更多人能真正用它完成工作。

如果 gorkX 对你有帮助，欢迎 **Star**，也请分享给仍被终端工作流困住的朋友。

## 许可证

[Apache-2.0](LICENSE)
