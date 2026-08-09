# gorkX 桌面对齐 · 人工点按验收清单

> 用途：在真实已登录 App 上按按钮验收，**不**用 slash 冒充完成。  
> 每项：操作步骤 → 期望结果 → 通过/失败/阻塞原因。  
> 与 `DESKTOP_ALIGNMENT_PLAN.md`、`VALIDATION_EVIDENCE.md` 配套。

**当前候选构建（2026-08-09）**：gorkX `1.2.0`；包内内核 `grok 1.0.0 (8a14c91)`，含补丁 0001–0007。下方 0.2.116 记录为历史验收。
**禁止**：未批准打 tag / Release / DMG。

---

## A. 入口可达（无需模型额度）

| # | 操作 | 期望 | ☐ |
|---|------|------|---|
| A1 | 折叠侧栏，点顶栏 **扩展 / 记忆 / 计划 / 待处理** | 面板或对话框打开 | |
| A2 | `⌘/` 打开快捷键 | 中文/英文说明，含 ⇧⌘A/B/M/S/P/I | |
| A3 | 无任务时点麦克风 | 提示需已连接任务；不闪退 | |
| A4 | 扩展 → Skills/MCP/插件 空列表 | 有下一步按钮（打开目录 / Chrome MCP / 市场） | |
| A5 | 计划任务空列表 | 「新建」与「使用建议」可点 | |

## B. 会话主路径（需登录）

| # | 操作 | 期望 | ☐ |
|---|------|------|---|
| B1 | 新建任务 → 发一句短问题 | 流式回复；不依赖 slash | |
| B2 | Composer **委派子任务** 或 ⇧⌘B | 引导面板；默认只读 | |
| B3 | 启动只读 Explore | 进程面板出现子任务行；可停止/完成后可查看结果 | |
| B4 | ⇧⌘P 进程面板 | 开/关 | |
| B5 | ⇧⌘I 任务信息 | 显示模型/上下文；无密钥原文 | |
| B6 | `+` → 会话时间线 | 只滚动本地消息，不发请求 | |
| B7 | 权限/计划/信任请求 | 内联卡可点；跨任务时顶栏 **!** 有角标并打开收件箱 | |

## C. 扩展 / 记忆 / Hooks

| # | 操作 | 期望 | ☐ |
|---|------|------|---|
| C1 | 扩展 → 有 skill 时点 **运行** | 表单，不出现必须手打 `/skill` | |
| C2 | 记忆 → Remember / Forget | 本地或内核路径有反馈 | |
| C3 | 设置 → Hooks（有项目 Hook 时） | 信任/重载/启停有成功或错误短文案 | |

## D. Computer / 语音（权限依赖）

| # | 操作 | 期望 | ☐ |
|---|------|------|---|
| D1 | 设置 → 屏幕截图 → Computer | 自动检查权限；四步说明可见 | |
| D2 | 未授权时「打开辅助功能设置」 | 系统页打开 | |
| D3 | （已授权）启用 → 急停 | 状态切换；急停后动作不可用 | |
| D4 | （已授权麦克风）语音听写 | 草稿更新；**不**自动发送 | |

## E. 发布阻断（阶段 1）

| # | 项 | 结果 | ☐ |
|---|-----|------|---|
| E1 | H1 干净安装 → 登录 → 首任务 → 退出重开 | | |
| E2 | H2 第三方 endpoint 真回复 | 未提供则 **未验收** | |
| E3 | H3 语音完整听写 | 见 D4 | |

---

## 记录模板

```
日期：
构建：commit / 本地 app
账号：已登录 / 未登录
通过项：
失败项 + 截图/日志路径：
阻塞：
```

通过项写入 `VALIDATION_EVIDENCE.md` 对应日期小节；失败不标 Real。

---

## 2026-08-01 执行记录（按建议：A + B）

| 字段 | 值 |
|------|-----|
| 日期 | 2026-08-01 |
| 构建 | `658c6ae`（`origin/main`）；内核 `grok 0.2.116 (dd04f39)` |
| 账号 | App 登录副本可用（ACP `cached_token` 成功） |

### A 入口可达

| # | 结果 | 证据类型 | 说明 |
|---|------|----------|------|
| A1 | **通过（源码接线）** | 静态 | 顶栏 `setExtOpen` / `setMemoryOpen` / `setScheduledOpen` / `setApprovalInboxOpen` 均存在 |
| A2 | **通过（源码接线）** | 静态 | `⌘/` + ⇧⌘ A/B/M/S/P/I 与 i18n 说明齐备 |
| A3 | **通过（源码接线）** | 静态 | `voiceNeedTask` + `humanizeVoiceError`；ACP `voice start/stop/shutdown` 路由通过（无采集） |
| A4 | **通过（源码接线）** | 静态 | Skills/MCP/插件空状态含下一步按钮 |
| A5 | **通过（源码接线）** | 静态 | 计划空状态含新建 + 建议 |

> A 项未在本会话启动 GUI 点按；源码 + `tsc` + `test:stages` + ACP 无认证探针已绿。

### B 会话主路径

| # | 结果 | 证据类型 | 说明 |
|---|------|----------|------|
| B1 | **未验收** | — | 需 App 内人工发真实消息看流式 |
| B2 | **部分** | 源码 | Composer / ⇧⌘B → `SubagentSpawnPanel`；默认只读在面板源码中 |
| B3 | **部分（ACP）** | 运行时 | 历史会话：spawn→completed/cancel 有证据；本会话 `--subagent-controls`：spawn 路由拒缺父、list/get/cancel 通过；**非** App 点按 |
| B4 | **通过（源码接线）** | 静态 | ⇧⌘P 切换 `processOpen` |
| B5 | **部分（ACP）** | 运行时 | `_x.ai/session/info` 返回无 token 的 auth 快照；App 面板未点按 |
| B6 | **通过（源码接线）** | 静态 | 时间线只 `onJump` 本地 DOM，不发 prompt |
| B7 | **通过（源码接线）** | 静态 | 跨任务入队 `setApprovalInboxOpen(true)`；内联卡仍在 |

### 门禁命令（本会话）

```
npx tsc --noEmit                          → 通过
npm run test:stages                       → 通过
node scripts/verify-grok-acp.mjs … --desktop-controls --voice-controls → 通过
… --authenticated --subagent-controls --session-info → 通过
```

### 阻塞 / 下一步

- **人工**：在本机打开 gorkX.app，按 A1–A5 与 B1–B3 各点一次，把 ☐ 改成真人结果。  
- **B1 / 完整 B2–B3 UI / E1–E3** 仍未用 GUI 闭环。  
- 不把本记录写成「A+B 人工全绿」或发布候选。

---

## 2026-08-01 复核（`1dc37f7` 后 · 快捷键目录化）

| 字段 | 值 |
|------|-----|
| 日期 | 2026-08-01 |
| 构建 | `main` @ 快捷键目录化提交；包内内核 `grok 0.2.116 (dd04f39)`；`build:app` + `verify-macos-app-bundle` 已绿 |
| 账号 | 本复核未做 GUI 登录点按 |

| # | 结果 | 证据 |
|---|------|------|
| A1 | **通过（源码接线）** | 顶栏 chrome 按钮：`setExtOpen` / `setMemoryOpen` / `setScheduledOpen` / `setApprovalInboxOpen` |
| A2 | **通过（单测）** | `desktopShortcuts.ts` + `desktopShortcuts.test.ts`：⇧⌘A/B/M/S/P/I 与帮助表同源；`matchDesktopShortcut` 覆盖 |
| A3–A5 | **通过（源码接线）** | 与上轮相同；未 GUI 录像 |
| B2 | **部分** | ⇧⌘B → `spawn-subagent` 需 live session；默认只读在 `SubagentSpawnPanel` |
| B4–B5 | **通过（源码/单测）** | process / task-info 在目录与 matcher 中 |
| App 包 | **通过** | `npm run build:app`；`verify-macos-app-bundle.sh` PASS |
| B1 / E1–E3 | **未验收** | 需 Build 权限 / 干净机 / 麦克风 |

**结论：** A2 从「静态存在」升级为「目录 + 单测锁定」。仍非人工全绿；不 tag / 不 DMG。

---

## 2026-08-01 正式完备条记录

| 字段 | 值 |
|------|-----|
| 构建 | `main` + formal gap table / primary-entries test；包内 `grok 0.2.116 (dd04f39)` |
| 自动门禁 | tsc · test:stages · cargo 88 · patches · ACP desktop+voice · auth subagent/hooks/session-info · build:app · bundle **全绿** |
| A1–A5 | **源码/单测通过**；**非** GUI 录像全绿 |
| B1 | **未验收** — 无确认的 Grok Build 额度（禁止伪造流式） |
| B2–B3 GUI | **未验收** — ACP 层有证据；App 点按无录像 |
| E1 H1 | **未验收（阻塞）** — 需干净机 |
| E2 H2 | **未验收（阻塞）** — 无用户 endpoint |
| E3 H3 | **未验收（阻塞）** — 需麦克风真人 |

**正式完备条：** 自动门禁 + 映射诚实 + 阻塞书面化 = **达标（候选包）**。  
**不**宣称人工全绿或新 tag/DMG。

---

## 2026-08-01 ONE_SHOT 一条龙结果

| 批次 | 结果 |
|------|------|
| α | 自动门禁全绿；候选 app 包绿 |
| β | 子任务 ACP completed；主聊天 403 |
| γ | 结构 A1/A2/B2/B4/B5 PASS；真人 GUI/H* 未做 |
| δ | 未 tag / 未 Release / 未 DMG |

定义 A 候选：**达成**。定义 B 全量发版叙事：**未达成**。
