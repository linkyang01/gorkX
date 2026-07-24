# gorkX

<p align="center">
  <img src="docs/screenshots/00-icon.png" width="92" alt="gorkX" />
</p>

<p align="center"><strong>Your Grok Build agent, finally at home on the desktop.</strong></p>

<p align="center">
  A calm command center for turning a folder, a question, or a messy task into visible progress — without living in a terminal.
</p>

<p align="center">
  <a href="#try-it"><strong>Try gorkX</strong></a> ·
  <a href="#what-you-can-do">What you can do</a> ·
  <a href="#run-from-source">Run from source</a> ·
  <a href="#中文">中文</a>
</p>

<p align="center">
  <a href="https://github.com/linkyang01/gorkX/releases"><img alt="Releases" src="https://img.shields.io/github/v/release/linkyang01/gorkX?display_name=release&label=macOS%20build" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-2563eb.svg" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20Apple%20Silicon-111827.svg" />
</p>

![gorkX main workspace](docs/screenshots/02-main.jpg)

## Stop managing the agent. Start directing the work.

Grok Build is powerful, but a terminal is a poor place to keep a project moving. gorkX turns its real ACP engine into a desktop workspace where the important things stay visible:

- **Pick a folder, start a task, and keep going.** Projects, durable tasks, the working directory, and live agent activity are together instead of scattered across tabs and terminals.
- **See what happened before you trust it.** Review changes, plans, tool activity, permissions, and Git state without decoding a scrollback buffer.
- **Give the agent context that survives.** Keep working preferences and project notes in local, inspectable memory.
- **Use ordinary controls first.** Buttons, pickers, forms, and guided choices are the normal path. Slash commands remain for people who want them — they are not the product’s front door.
- **Keep the actual Grok Build engine.** gorkX ships an app-owned Grok Build kernel, talks to it over ACP stdio, and keeps its sessions, config, and memory in the application data folder.

## What you can do

| In gorkX | Why it feels better |
|---|---|
| **Projects and durable tasks** | Come back to real work with the folder, session, and history still attached. |
| **Streaming agent workspace** | Write, research, plan, operate files, and follow tool activity from one focused screen. |
| **Review that explains itself** | Inspect file changes, plans, Git state, and Chinese summaries of agent actions before you accept a result. |
| **Long-term local memory** | Save working preferences and project conventions; inspect and clean them whenever you want. |
| **Goals, plans, and decision cards** | Turn a broad intent into a visible goal, let the engine plan, and answer its questions through clear UI choices. |
| **Model and provider setup** | Use Grok login or configure supported API/compatible providers; select real returned model IDs instead of guessing. |
| **Native Grok Build voice dictation** | Use the kernel’s macOS capture and streaming STT path — never browser Web Speech — then edit the transcript before sending. |
| **Worktrees, sandbox profiles, and diagnostics** | Keep implementation work isolated, choose an engine-owned sandbox profile, and run Grok Build diagnostics from Settings. |
| **App-owned updates** | See the bundled engine version and app update path without confusing a kernel update with a user’s own project repository. |

### Built for more than programming

The same workflow is useful when the task is a report, research brief, operations checklist, content draft, project handoff, or a hard decision. gorkX keeps the power-user escape hatches, but makes the primary experience legible for people who do not think in commands.

## A workspace you can read at a glance

| Start | Direct | Verify | Remember |
|---|---|---|---|
| Choose a project and describe the outcome. | Use the composer, guided buttons, plans, and permissions to steer the engine. | Review what changed, what tools ran, and what Git sees. | Keep the useful context for the next task — locally. |

![Review panel showing agent activity](docs/screenshots/03-review.jpg)

![Local memory management](docs/screenshots/01-memory.jpg)

## Try it

### Install a packaged build

Visit [GitHub Releases](https://github.com/linkyang01/gorkX/releases), download the current **macOS Apple Silicon** build, drag **gorkX** to Applications, and open it.

On a first launch, macOS may ask you to approve an unrecognized developer in **System Settings → Privacy & Security**. gorkX then guides you to sign in to Grok Build in your browser or to configure a supported provider in Settings.

### Run from source

```bash
git clone https://github.com/linkyang01/gorkX.git
cd gorkX/apps/desktop
npm install
npm run tauri dev
```

To use a development engine instead of the app-bundled one:

```bash
export GORKX_GROK_CMD=/path/to/grok
npm run tauri dev
```

## How it works

```text
React + Tauri 2 desktop app
projects · tasks · review · memory · settings
                  │
                  │ ACP stdio
                  ▼
App-owned Grok Build kernel
sessions · tools · models · voice · config
                  │
                  ▼
~/Library/Application Support/gorkX/
```

gorkX does not depend on a user-installed CLI or scan `~/.grok`. Its application data is separate from your repositories:

```text
~/Library/Application Support/gorkX/
  gorkx.db       # task index
  grok-home/     # app-owned Grok Build sessions, login, config, memory
  runtime/       # optional managed runtime files
```

## Current scope

gorkX is actively developed and macOS Apple Silicon is the first supported platform. The repository includes a locked, source-built Grok Build kernel (currently 0.2.111) plus maintained ACP adapters that make desktop workflows feel natural.

## Development and verification

```bash
cd apps/desktop
npx tsc --noEmit
npm run build
cd src-tauri
cargo test
cargo check
```

For the exact capability status, safeguards, and reproducible checks, see:

- [Feature matrix](docs/FEATURES.md)
- [Independent app plan](docs/INDEPENDENT_APP_PLAN.md)
- [Validation evidence](docs/VALIDATION_EVIDENCE.md)

## Contribute

Issues and pull requests are welcome. The highest-value contributions make an agent easier to direct, easier to audit, and more truthful about what really happened.

If gorkX makes your work feel lighter, please **star the repository** and share it with someone ready to leave the terminal-only loop.

## License

[Apache-2.0](LICENSE)

---

# 中文

<p align="center"><strong>让 Grok Build 真正成为桌面上的工作指挥台。</strong></p>

<p align="center">
  把一个文件夹、一个问题或一团乱麻的任务，变成看得见、接得住、可复查的进展；不必一直泡在终端里。
</p>

<p align="center">
  <a href="#试用-gorkx"><strong>开始试用</strong></a> ·
  <a href="#你能用它做什么">核心能力</a> ·
  <a href="#从源码运行">从源码运行</a> ·
  <a href="#gorkx">English</a>
</p>

## 别再管理 Agent，开始指挥工作

Grok Build 很强，但终端并不适合承载持续推进的项目。gorkX 把真实的 ACP 引擎放进一个桌面工作区：项目、任务、工作目录和 Agent 的活动都留在眼前。

- **选文件夹，开任务，随时回来继续。** 项目、持久任务、内核会话和历史不会散落在多个终端标签里。
- **先看清发生了什么，再相信结果。** 变更、计划、工具活动、权限和 Git 状态都有可读的审阅入口。
- **让上下文留下来。** 工作偏好与项目约定保存在本地，可查看、可整理、可删除。
- **默认使用普通操作。** 按钮、选择器、表单和引导式选项才是主路径；斜杠命令留给需要效率的熟练用户，而不是所有人的入口。
- **保留真正的 Grok Build。** gorkX 自带并管理 Grok Build 内核，通过 ACP stdio 通信；会话、配置与记忆都在应用自己的数据目录中。

## 你能用它做什么

| 在 gorkX 中 | 你得到的体验 |
|---|---|
| **项目与持久任务** | 下次回来，文件夹、会话和工作历史仍在原处。 |
| **流式 Agent 工作区** | 写作、研究、计划、文件操作与工具过程，都在一个专注界面中完成。 |
| **会解释自己的审阅** | 在接受结果前，查看文件变更、计划、Git 状态，以及 Agent 行动的中文摘要。 |
| **本地长期记忆** | 保存你的习惯与项目约定，随时检查和清理。 |
| **目标、计划与决策卡** | 用表单明确目标，让内核生成计划；当 Agent 需要选择时，用清晰的选项直接回答。 |
| **模型与提供商设置** | 使用 Grok 登录，或配置受支持的 API/兼容提供商；从真实返回的模型 ID 中选择，而不是猜名称。 |
| **原生 Grok Build 语音听写** | 复用内核的 macOS 采集与流式转写，不使用浏览器 Web Speech；转写先进入可编辑草稿，不会自动发送。 |
| **工作树、沙箱与诊断** | 隔离实现任务，选择内核拥有的沙箱档位，并在设置里运行 Grok Build 诊断。 |
| **应用内更新** | 清楚区分应用更新、内核版本和用户自己的项目仓库。 |

### 不只服务开发者

报告、调研简报、运营清单、内容草稿、项目交接和复杂决策，同样适合这套流程。gorkX 保留高手需要的快捷方式，但让不写代码的人也能看懂、敢用、能复查。

## 一眼看懂的工作区

| 开始 | 指挥 | 验证 | 记住 |
|---|---|---|---|
| 选择项目，描述想要的结果。 | 用输入框、引导按钮、计划和权限控制引擎。 | 审阅改动、工具活动与 Git 结果。 | 把真正有用的上下文留在本地，供下一次任务使用。 |

## 试用 gorkX

### 安装已打包版本

前往 [GitHub Releases](https://github.com/linkyang01/gorkX/releases)，下载最新的 **macOS Apple Silicon** 构建，将 **gorkX** 拖入“应用程序”后打开。

首次启动时，如果 macOS 提示开发者未被识别，可在“**系统设置 → 隐私与安全性**”中允许打开。随后 gorkX 会引导你在浏览器中登录 Grok Build，或在设置中配置受支持的模型提供商。

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

## 架构与数据

```text
React + Tauri 2 桌面应用
项目 · 任务 · 审阅 · 记忆 · 设置
                  │
                  │ ACP stdio
                  ▼
应用自管的 Grok Build 内核
会话 · 工具 · 模型 · 语音 · 配置
                  │
                  ▼
~/Library/Application Support/gorkX/
```

gorkX 不依赖用户另装 CLI，也不会扫描 `~/.grok`。应用数据和你的项目仓库是分开的：

```text
~/Library/Application Support/gorkX/
  gorkx.db       # 任务索引
  grok-home/     # 应用自管的 Grok Build 会话、登录、配置、记忆
  runtime/       # 可选的受管运行时文件
```

## 当前范围

gorkX 正在积极开发，当前优先支持 macOS Apple Silicon。仓库包含锁定源码、自行构建的 Grok Build 内核（当前 0.2.111），以及让桌面工作流更自然的 ACP 适配层。

## 开发与验证

```bash
cd apps/desktop
npx tsc --noEmit
npm run build
cd src-tauri
cargo test
cargo check
```

能力状态、保护边界与可复跑验证见：

- [功能矩阵](docs/FEATURES.md)
- [独立应用计划](docs/INDEPENDENT_APP_PLAN.md)
- [验证证据](docs/VALIDATION_EVIDENCE.md)

## 参与贡献

欢迎提交 Issue 和 PR。最有价值的贡献，是让 Agent 更容易指挥、更容易审阅，并且对真实发生的事情更诚实。

如果 gorkX 让你的工作轻松了一点，欢迎 **Star**，也请分享给仍被终端工作流困住的朋友。

## 许可证

[Apache-2.0](LICENSE)
