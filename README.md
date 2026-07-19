# gorkX

**给每天写代码的人：一台桌面上的 Grok Agent 指挥台。**

gorkX 不是又一个聊天壳。它把开源 **[Grok Build](https://github.com/xai-org/grok-build)** 做成可安装的 **macOS 桌面应用**：项目、任务、权限、审阅、记忆、登录与额度都在同一屏里完成——交互对标大家熟悉的 **Codex 指挥台**，引擎仍是你能审计、可升级的 Grok 内核。

**当前版本：0.4.2** · **许可：Apache-2.0** · **首选平台：macOS Apple Silicon**

<p align="center">
  <img src="docs/screenshots/00-icon.png" width="88" alt="gorkX" />
</p>

<p align="center">
  <a href="https://github.com/linkyang01/gorkX/releases/latest"><img alt="Download" src="https://img.shields.io/github/v/release/linkyang01/gorkX?label=Download%20DMG&color=0f172a" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" /></a>
  <a href="docs/FEATURES.md"><img alt="Features" src="https://img.shields.io/badge/Features-honest%20matrix-2dd4bf" /></a>
</p>

---

## 为什么选 gorkX

| 痛点 | gorkX 怎么解 |
|------|----------------|
| CLI / TUI 功能强，但日常要切终端、记路径、找历史 | **一窗完成**：侧栏项目 → 任务 → 对话 → 右侧审阅 |
| Agent 改了什么、跑了什么工具，看不清 | **审阅面板**：工具活动人类可读，成功/失败一眼能扫 |
| 跨会话「说了等于没说」 | **Hermes 式长期记忆**：画像 / 工作笔记 / 项目约定真正落盘、开局注入 |
| 登录、额度、会员状态分散 | **账号区**：订阅等级、已用/剩余额度、头像与显示名 |
| 桌面壳只调黑盒 API | **引擎自管**：App `GROK_HOME`，会话与记忆归你，可捆绑/替换 Grok Build |

一句话：**同样用 Grok 写代码，gorkX 让「开任务 → 看工具 → 留记忆 → 管额度」变成产品级路径，而不是每次从零拼命令。**

---

## 截图

### 主界面 · 项目、任务与创作区

侧栏管理项目与任务，中间是 Codex 风格的创作首页与对话，左下角账号区显示会员与额度。

![主界面](docs/screenshots/02-main.jpg)

### 审阅 · 工具活动一目了然

Agent 读文件、列目录、调工具的过程在右侧沉淀为中文摘要与状态，便于复盘与排错。

![审阅面板](docs/screenshots/03-review.jpg)

### 记忆 · 可打开、可写入、可遗忘

![记忆管理](docs/screenshots/01-memory.jpg)

---

## 下载

| 平台 | 安装包 |
|------|--------|
| **macOS Apple Silicon** | [gorkX_0.4.2_aarch64.dmg](https://github.com/linkyang01/gorkX/releases/download/v0.4.2/gorkX_0.4.2_aarch64.dmg) |

打开 DMG，将 **gorkX** 拖入「应用程序」。若系统提示未签名开发者，请到 **系统设置 → 隐私与安全性** 中允许打开（当前发布为未公证构建，属预期行为）。

完整发行说明与资源：[Releases](https://github.com/linkyang01/gorkX/releases)

---

## 核心能力（0.4.2）

### 1. 真·桌面 Agent 工作流

- **项目维度**：按文件夹组织任务，cwd 与 Agent 上下文一致  
- **任务 / 会话**：本地索引 + 内核会话，同名任务不胡乱合并  
- **Composer**：发送与停止融合、模型与努力程度、权限档位，贴近 Codex 手感  
- **审阅三栏**：变更 / 计划 / **工具活动**——工具标题可读，状态可扫  

### 2. Hermes 式记忆（可验证的文件链路）

- 分层文件：`USER.md` · `AGENT.md` · 项目 `MEMORY.md` · 会话沉淀  
- **新任务开局注入**优先文件**最新**内容（尾部），避免旧种子标题占满预算  
- 自动学习写会话摘要；超额合并进归档；支持「记一条」与按关键词**忘记**  
- 数据在本机：`~/Library/Application Support/gorkX/grok-home/memory/`  

### 3. 登录、额度与账号体验

- **浏览器设备码登录**（无需再弹系统终端）  
- 登录一次写在 App 专属 `auth.json`；**关软件保留登录**；点「退出」才清除  
- Token 到期前静默刷新；额度走官方 CLI billing（需 Grok CLI 权限）  
- 显示 **SuperGrok** 等会员档、已用/剩余百分比、账号头像；显示名可本机改，不影响云端账号  

### 4. 诚实交付

能力不是「菜单上有就算有」。真 / 半 / 规划写在 **[docs/FEATURES.md](docs/FEATURES.md)**，欢迎对照使用、提 Issue 纠偏。

---

## 适合谁

- 已用或准备用 **Grok Build / SuperGrok** 做日常编码的人  
- 喜欢 Codex 指挥台式布局、又不想离开 Grok 生态的人  
- 需要 **跨任务记忆**、工具过程可审阅、额度一眼可见的重度用户  
- 希望 **开源可审计**、数据目录清晰、能自己编安装包的开发者  

---

## 从源码运行

```bash
git clone https://github.com/linkyang01/gorkX.git
cd gorkX/apps/desktop
npm install
npm run tauri dev
```

可选指定引擎二进制：

```bash
export GORKX_GROK_CMD=/path/to/grok
npm run tauri dev
```

打包：

```bash
cd apps/desktop && npm run tauri build
# 或仓库根目录 ./scripts/mac-build.sh（若提供）
```

### 数据目录（默认）

```
~/Library/Application Support/gorkX/
  gorkx.db          # 任务 / 快照索引
  grok-home/        # 引擎 GROK_HOME：会话 · 登录 · 记忆 · 配置
  runtime/          # 可选捆绑引擎
```

**隐私：** 源码与 Release **不包含**任何用户 token 或账号密码。登录态仅存在于本机上述目录。

---

## 架构一瞥

```
┌─────────────────────────────────────────┐
│  gorkX UI (React + Tauri 2)             │
│  项目 · 任务 · 审阅 · 记忆 · 账号        │
└──────────────────┬──────────────────────┘
                   │ ACP stdio
┌──────────────────▼──────────────────────┐
│  Grok Build 引擎（App GROK_HOME）        │
│  tools · sessions · models · memory      │
└─────────────────────────────────────────┘
```

---

## 文档

| 文档 | 内容 |
|------|------|
| [docs/FEATURES.md](docs/FEATURES.md) | 能力诚实表：真 / 半 / 规划 |
| [docs/INDEPENDENT_APP_PLAN.md](docs/INDEPENDENT_APP_PLAN.md) | 独立 App 产品主线 |
| [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md) | 更长路线图 |

---

## 参与

Issue / PR 欢迎。讨论范围包括：审阅体验、记忆策略、多模型、Windows/Linux 打包、引擎捆绑与更新通道。

若 gorkX 对你有用，请 **Star** 仓库，并分享给同样在找「Grok 的 Codex 式桌面」的同事——产品靠真实使用迭代，你的反馈就是路线图。

---

## License

[Apache-2.0](LICENSE)

---

# gorkX (English)

**A desktop command center for Grok Build—built for people who ship code every day.**

gorkX is **not** another thin chat wrapper. It turns open-source **[Grok Build](https://github.com/xai-org/grok-build)** into an installable **macOS app**: projects, tasks, permissions, review, memory, sign-in and quota in one place. The UX is intentionally close to the **Codex command-center** layout; the runtime remains an auditable Grok Build kernel you can upgrade.

**Version 0.4.2** · **Apache-2.0** · **macOS Apple Silicon first**

---

## Why gorkX

| Friction | What you get |
|----------|----------------|
| CLI power buried in terminals and flags | **One window**: projects → tasks → chat → review |
| Hard to see what the agent actually did | **Review pane**: human-readable tool activity |
| Context dies between sessions | **Hermes-style memory**: real files, inject on first prompt |
| Auth and quota live elsewhere | **Account chip**: plan tier, usage %, avatar |
| Desktop shells hide the model stack | **App-owned `GROK_HOME`**: your sessions and memory, replaceable engine |

**Same Grok coding agent—product path for start → tools → memory → quota, without re-assembling a CLI ritual every morning.**

---

## Screenshots

### Home · projects and composer

![Main UI](docs/screenshots/02-main.jpg)

### Review · tool activity

![Review](docs/screenshots/03-review.jpg)

### Memory · files you can open and edit

![Memory](docs/screenshots/01-memory.jpg)

---

## Download

| Platform | Package |
|----------|---------|
| **macOS Apple Silicon** | [gorkX_0.4.2_aarch64.dmg](https://github.com/linkyang01/gorkX/releases/download/v0.4.2/gorkX_0.4.2_aarch64.dmg) |

Drag **gorkX** to Applications. Unsigned builds may need **System Settings → Privacy & Security** on first launch.

[All releases](https://github.com/linkyang01/gorkX/releases)

---

## Highlights (0.4.2)

- **Desktop agent workflow** — projects, tasks, fused send/stop composer, plan/tools review  
- **Real Hermes-style memory** — layered markdown, tail-prefer injection, auto-learn digests, forget  
- **Auth that behaves** — browser device login, stay signed in across restarts, silent refresh, explicit logout  
- **Account surface** — SuperGrok-class tier label, usage %, avatar, local display name only  
- **Honest feature matrix** — [docs/FEATURES.md](docs/FEATURES.md)

---

## Develop

```bash
git clone https://github.com/linkyang01/gorkX.git
cd gorkX/apps/desktop
npm install
npm run tauri dev
```

Data lives under `~/Library/Application Support/gorkX/` (`gorkx.db` + `grok-home/`). **No user credentials are embedded in the repository or release artifacts.**

---

## Contributing

Issues and PRs welcome—especially review UX, memory policy, multi-model, and packaging.

If gorkX helps your workflow, **star the repo** and send it to someone still living in a pure CLI loop. Real usage is the best roadmap.

## License

[Apache-2.0](LICENSE)
