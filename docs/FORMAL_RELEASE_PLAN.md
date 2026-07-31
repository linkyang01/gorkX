# gorkX 正式版执行方案（v1.0.0 Stable）

> **状态：** `shipped`（2026-07-31：用户批准后已 push、`v1.0.0` tag、GitHub Release、DMG）  
> **触发语（任一句即可）：** `按方案做` · `执行正式版方案` · `做正式版` · `按 FORMAL_RELEASE_PLAN 执行`  
> **执行者：** 本会话 Agent  
> **完成定义：** 本文 §3「正式版完成标准」全部满足，并产出 §7 证据包；**打 tag / 发 GitHub Release / 上传 DMG 仅在用户明确批准后执行**。

---

## 0. 如何找到并执行本方案

| 项 | 值 |
|---|---|
| **唯一路径** | `docs/FORMAL_RELEASE_PLAN.md` |
| **检索关键词** | `FORMAL_RELEASE_PLAN` · `正式版执行方案` · `v1.0.0 Stable` |
| **关联文档** | `NEXT_RELEASE_GATES.md` · `STAGE_G_RELEASE_CREDIBILITY.md` · `FEATURES.md` · `VALIDATION_EVIDENCE.md` · `PRODUCT_DEVELOPMENT_PLAN.md` · `CODEX_PARITY_ROADMAP.md` |
| **执行纪律** | 一次会话内按 §4 阶段顺序做完；能自动完成的全部做完；需用户密钥/干净机/公证的，在方案内标记为 **[USER]** 并阻塞到有输入后再继续，不要跳过或伪造验收 |

**Agent 开跑检查清单（第一件事）：**

1. 打开本文件，确认「状态」与「完成标准」。  
2. `git status`：若有未提交的正式版相关 WIP，先执行 **阶段 0**（合入或整理），禁止在脏工作区上打 tag。  
3. 从 **阶段 1** 起逐项打勾；每完成一阶段更新 `docs/VALIDATION_EVIDENCE.md` 与本文件进度表。  
4. 全部阶段通过后写 `docs/RELEASE_NOTES_v1.0.0.md` 候选稿，**停在“等待用户批准发版”**，除非用户已说「可以打 tag / 发 Release / 做 DMG」。

---

## 1. 产品定位（正式版是什么、不是什么）

### 1.1 正式版是什么

**gorkX 1.0.0 Stable** = 面向真实开发者与知识工作者的 **macOS Apple Silicon 独立桌面 Agent**：

- 只装 gorkX，即可登录 Grok、打开项目、跑真实 ACP 任务、审阅变更、管理记忆与扩展。  
- 内核 = 锁定版 Grok Build（自编译、App-owned `GROK_HOME`）。  
- 主路径全部为桌面控件；无假按钮、无「Soon 可点」。  
- 对外可称为 **正式稳定版**（相对 0.5.x Beta），诚实写明边界。

### 1.2 正式版明确不做（延后 1.x / 2.0）

下列能力 **不阻塞 1.0.0**，但界面与宣传必须诚实，不得写进「已完整支持」：

| 能力 | 原因 | 去向 |
|---|---|---|
| 用户主动多 Agent 委派创建 | 锁定内核 ACP 无创建/指定委派路由 | `CODEX_PARITY_ROADMAP` P1 |
| GitHub App 最小权限 / 私有仓一等公民 | 需 App 注册与安装选择 | 1.1+ |
| 日历 / Slack / 飞书 / Notion 连接器 | 阶段 D 样板未完整 | 1.1+ |
| Computer 鼠标键盘自动化 | TCC + 可见操作 + 急停未闭环 | P4 |
| ChatGPT/Claude 网页订阅当 API | 产品原则禁止 | 永不作为 API 登录 |
| Windows / Linux GA | 平台验收未做 | 试验版另案 |
| 公证后的「下载即开」若无 Developer ID | 需 **[USER]** 证书 | 有凭证则做，无则 ad-hoc + 说明 |

---

## 2. 当前基线（方案定稿时）

| 项 | 值 |
|---|---|
| 公开版本 | `0.5.1`（Beta 线） |
| 目标版本 | **`1.0.0`** |
| 内核 | Grok Build `0.2.112`（`47348d1`）+ 补丁 series（含 `0004-acp-agent-stdio-cli-overrides`） |
| 平台 | macOS 12+ Apple Silicon（正式版主交付） |
| 进行中 WIP（方案执行时必须处理） | 任务工具 denylist、权限 allow/deny、stdio 根参数补丁、相关测试与文档 — 见仓库 `git status` |

---

## 3. 正式版完成标准（全部满足才算「方案完成」）

### 3.1 阻断门槛（缺一不可）

| ID | 标准 | 证据落点 |
|---|---|---|
| **R1** | 干净安装路径：无系统 grok 时，包内内核 + App `GROK_HOME` 可完成登录与首任务 | `VALIDATION_EVIDENCE.md` + 步骤记录；**[USER]** 干净机更佳 |
| **R2** | 核心循环在真实 git 项目可用：流式、工具审批、Plan、终端、Review、导出、归档/恢复 | 至少一条可复述的任务记录 |
| **R3** | 会话安全：fork、rewind 预览/确认、冲突不强制覆盖 | ACP 门禁 + 人工走查说明 |
| **R4** | 模型诚实：Grok 列表来自内核；≥1 条 OpenAI-compatible「测试→选中→真实回复」**或** 明确记录「用户未提供 endpoint，多 Provider 保持未通过且 UI 不宣传已完成」 | 脱敏验收或书面阻塞记录 |
| **R5** | 数据与密钥：Keychain/环境；正式包不继承 CLI `~/.grok`；敏感词不进日志/导出 | `cargo test` + 日志扫描记录 |
| **R6** | 无假功能：`FEATURES.md` 与设置页一致；可点 = 真链路 | 功能审计表勾选 |
| **R7** | 自动化质量门禁全绿 | 见 §4.2 命令清单 |
| **R8** | 版本元数据一致：`package.json` / `tauri.conf.json` / Cargo / 关于页 / 更新检查 = `1.0.0` | 构建产物检查 |
| **R9** | 发布说明与 README 下载链、边界声明与正式版一致 | `RELEASE_NOTES_v1.0.0.md` + README |
| **R10** | 用户明确批准后，才：打 `v1.0.0` tag、GitHub Release、DMG；未批准则只交付「发布候选」 | 会话确认记录 |

### 3.2 正式版必须合入的产品能力（相对 0.5.1 的增量底线）

| ID | 能力 | 完成标准 |
|---|---|---|
| **F1** | 内核 stdio 根参数真实生效 | 补丁 `0004` 在 series；`--no-memory` / `--no-subagents` / `--max-turns` / `--disallowed-tools` / `--allow`/`--deny` 在 `agent stdio` 生效；有单测或 ACP/构建证据 |
| **F2** | 任务级工具 denylist | 新建任务 UI + 持久化 + 重连/effort 重启保留 |
| **F3** | 任务级权限 allow/deny | 同上；拒绝 `*`/`**` 与注入字符 |
| **F4** | 认证过期可恢复 | 已有「过期登录 → 重新认证」路径；正式版回归一次 |
| **F5** | GitHub 连接器安全收口 | 断开清 Keychain；写操作逐次确认；授权前 scope 披露；审计可查 |
| **F6** | 宣传与边界对齐 | FEATURES / README / 设置 Soon 项无夸大 |

### 3.3 人工项（可阻塞发版，不可伪造）

| ID | 项 | 责任 |
|---|---|---|
| **H1** | 干净 macOS：安装 → 登录 → 真实会话 → 退出重开恢复 | **[USER]** 或本机等价隔离验收并写证据 |
| **H2** | 真实 API Provider 全链路（可选但强烈建议） | **[USER]** 提供 endpoint/key 或书面放弃并降级宣传 |
| **H3** | 语音：麦克风授权 → 听写 → 编辑草稿 → 手动发送 | **[USER]** 本机 TCC |
| **H4** | Developer ID + 公证（可选增强） | **[USER]** 凭证；无则 ad-hoc 构建 + README 说明 Gatekeeper |

**规则：** H1 为 1.0.0 **强烈建议阻断**；若用户书面接受「开发者自测机验收代替干净机」，可在证据中标注风险后继续。H2/H3 未做则宣传中禁止写「多模型已验收 / 语音已验收」。H4 未做则禁止写「下载即开、无需绕过」。

---

## 4. 执行阶段（严格顺序，一次做完）

### 阶段 0 — 工作区收口（必须先做）

| 步骤 | 动作 | 完成标准 |
|---|---|---|
| 0.1 | 审阅当前 diff：kernel `0004`、工具限制、权限规则、store/threads/UI、文档 | 无无关改动混入 |
| 0.2 | 跑 §4.2 本地门禁 | 全绿 |
| 0.3 | 按逻辑拆 commit 或单个清晰 commit 推送到 `main`（**仅在用户允许 push 时 push**；至少本地 commit） | `git status` 干净或仅剩无关文件 |
| 0.4 | 若资源内核已重建：确认 `scripts/verify-grok-kernel-patches.sh` + ACP initialize 通过 | 日志写入 VALIDATION_EVIDENCE |

### 阶段 1 — 质量与无假功能

| 步骤 | 动作 | 完成标准 |
|---|---|---|
| 1.1 | `FEATURES.md` 与 UI 对表：每个主路径 Real / Kernel-wired / Soon | 审计表写入 VALIDATION_EVIDENCE 或本文件附录 |
| 1.2 | 设置页 / + 菜单：不可用能力不可执行 | 无死按钮 |
| 1.3 | 敏感路径扫描：日志、导出、SQLite schema 无密钥字段 | 通过 |
| 1.4 | 修复阶段 0–1 发现的 P0/P1 | 无 P0/P1 开放 |

### 阶段 2 — 连接器与安全收口（GitHub）

| 步骤 | 动作 | 完成标准 |
|---|---|---|
| 2.1 | 断开 GitHub：本地 Keychain 删除 + UI 状态「未连接」 | 可复跑测试或人工步骤 |
| 2.2 | 创建 PR / 评论：二次确认文案含目标仓库与动作 | 代码审查 + 若有 token 则人工一次 |
| 2.3 | 授权前 UI 展示 `read:user` + `public_repo` 风险 | 中英 copy 到位 |
| 2.4 | 连接器审计记录含 connect / disconnect / write | 可查看 |

### 阶段 3 — 发布元数据与候选包

| 步骤 | 动作 | 完成标准 |
|---|---|---|
| 3.1 | 版本升至 **1.0.0**（desktop package、tauri.conf、Cargo.toml、锁文件、i18n/关于若硬编码） | 一致 |
| 3.2 | 撰写 `docs/RELEASE_NOTES_v1.0.0.md` | 含亮点、边界、安装、回滚 |
| 3.3 | 更新 README 下载链接占位与中英文边界（Release 后改真实 URL） | 草稿完整 |
| 3.4 | `npm run build:app` 或项目约定的 mac-build；`verify-macos-app-bundle.sh` | 通过 |
| 3.5 | `scripts/verify-release-readiness.sh`（默认不 ship） | JSON/报告可读 |
| 3.6 | **[USER 可选]** 签名公证 | `SIGNING_LEVEL=notarized` 或记录未做 |

### 阶段 4 — 人工闭环与证据

| 步骤 | 动作 | 完成标准 |
|---|---|---|
| 4.1 | 执行 H1（或用户书面降级） | 证据入 VALIDATION_EVIDENCE |
| 4.2 | H2/H3 做或标注未做 | 同上 |
| 4.3 | 汇总「正式版证据索引」表（日期、命令、结果、边界） | 本文 §7 填满 |

### 阶段 5 — 发布门（默认停止）

| 步骤 | 动作 | 完成标准 |
|---|---|---|
| 5.1 | 向用户展示：版本、SHA、证据索引、边界、是否公证 | 用户可读 |
| 5.2 | **仅当用户明确说可以发版：** `git tag v1.0.0`、GitHub Release、上传 DMG、更新 README 链接 | Release 公开 |
| 5.3 | 若用户不批准发版：将本方案状态改为「发布候选已就绪，待批准」 | 不擅自 tag |

---

## 4.2 本地门禁命令（阶段 0/1/3 必跑）

```bash
# 内核与补丁
scripts/verify-grok-kernel-source.sh
scripts/verify-grok-kernel-patches.sh
# 若需刷新包内内核：
# scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok
node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok

# 桌面
cd apps/desktop
npx tsc --noEmit
npm run test:stages
npm run verify:web-bundle
cd src-tauri && cargo test && cargo check

# 包（有 .app 后）
# scripts/verify-macos-app-bundle.sh apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app
# scripts/verify-release-readiness.sh
```

---

## 5. 进度表（执行时更新）

| 阶段 | 状态 | 备注 |
|---|---|---|
| 0 工作区收口 | ✅ done | F1–F3 WIP + 补丁 0004 + 本地门禁；本地 commit |
| 1 质量与无假功能 | ✅ done | FEATURES/能力图已对齐；敏感扫描无密钥 schema 字段 |
| 2 GitHub 安全收口 | ✅ done | 断开清 Keychain；写确认含仓库；scope 披露；审计 connect/disconnect/write |
| 3 元数据与候选包 | ✅ done | 版本 `1.0.0`；`RELEASE_NOTES_v1.0.0.md`；README 占位链接 |
| 4 人工闭环 | 🟡 partial | H1–H3 未在干净机重做；用户明确批准以候选证据 ship |
| 5 发布门 | ✅ shipped | `v1.0.0` tag + Release + `gorkX_1.0.0_aarch64.dmg`（ad-hoc） |

**方案整体状态：** `shipped`（https://github.com/linkyang01/gorkX/releases/tag/v1.0.0）

---

## 6. 风险与决策

| 风险 | 处理 |
|---|---|
| 无干净机 | 用隔离 `GROK_HOME` + 新用户步骤；证据标注非干净机 |
| 无第三方 API key | R4 走「未验收」分支，FEATURES 不写多 Provider 已完成 |
| 无 Apple 公证 | 正式版仍可发源码与 ad-hoc DMG，README 写清 Gatekeeper 步骤 |
| 内核升级诱惑 | 1.0.0 **锁定当前 0.2.112 + series**；升级另开 1.0.1 方案 |
| 范围膨胀 | 日历/Computer/多 Agent 创建一律不进本方案 |

---

## 7. 证据包模板（完成后填写）

见 `docs/VALIDATION_EVIDENCE.md` 章节 **「正式版 v1.0.0 证据索引 · 2026-07-31」**。

| ID | 结果 | 命令或步骤 | 边界 |
|----|------|------------|------|
| R1 | 部分 | 包内内核 + App `GROK_HOME` 路径/门禁历史证据 | 干净机 H1 仍待 **[USER]** |
| R2 | 历史通过 | 既有真实 ACP / 任务链路证据 | 本会话未重做完整人工首轮 |
| R3 | 历史通过 | fork / rewind 预览确认 | 同上 |
| R4 | 未做 | 无用户提供第三方 endpoint | UI 不宣传多 Provider 已验收 |
| R5 | 通过 | `cargo test` 含 Keychain/隔离；schema 无密钥列 | — |
| R6 | 通过 | FEATURES 与任务工具/权限 UI 对齐 | 设置 Soon 项保持不可执行 |
| R7 | 通过 | §4.2 本会话全绿 | 见 VALIDATION_EVIDENCE |
| R8 | 通过 | package / tauri / Cargo / appMeta = `1.0.0` | 发版后需再验构建产物 |
| R9 | 通过 | `RELEASE_NOTES_v1.0.0.md` + README 边界 | 下载链在 tag 后生效 |
| F1–F6 | 通过 | 补丁 0004、denylist、allow/deny、GitHub 收口、文档 | 需重建资源内核时再验二进制 |
| H1–H4 | 阻塞 | **[USER]** | 未伪造通过 |

---

## 8. 1.0 之后的路线（本方案不执行，仅挂账）

1. **1.1** GitHub App 最小权限；断开/撤销深链；私有仓体验  
2. **1.2** 第二连接器（日历）完整 OAuth 样板  
3. **1.3** Browser 任务内动作日志与域名许可产品化  
4. **1.4** 内核升级与 ACP 新能力审计流程例行化  
5. **2.0** 多 Agent 委派（待内核路由）、Computer 急停闭环、跨平台  

完整对照仍见 `CODEX_PARITY_ROADMAP.md`。

---

## 9. 给执行 Agent 的最短指令（复制即用）

```text
读取并严格执行 docs/FORMAL_RELEASE_PLAN.md。
从阶段 0 做到阶段 4 全部完成标准；更新进度表与 VALIDATION_EVIDENCE。
不要打 tag、不要发 Release、不要上传 DMG，除非用户在本会话明确批准。
遇到 [USER] 项：说明缺什么、给可选降级，等待用户回复后再继续，不要伪造通过。
一次会话内尽量连续做完；中断时在进度表写清下一动作。
```

---

## 10. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-07-30 | 初稿：定义 v1.0.0 Stable、触发语、阶段 0–5、完成标准、与 Beta/Codex 边界 |
