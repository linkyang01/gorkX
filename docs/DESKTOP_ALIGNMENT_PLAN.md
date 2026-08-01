# Grok Build → gorkX 桌面对齐执行方案

> 目标：把 **Grok Build 日常能力**做成 **真实端到端桌面能力**。  
> 操作类功能 **必须按键/表单/面板化**，不以输入 slash 命令或 CLI 作为主路径。  
> `/` 仅保留专家键盘兼容；未知引擎命令仍走 **引导表单**（`openEngineAction`），不把 `/foo` 留在输入框冒充产品。

## 1. 产品原则

1. **真链路**：按钮 → 原生 ACP / 白名单 CLI / Keychain，无 mock、无“回显 slash 即完成”。
2. **桌面优先**：命名按钮、对话框、卡片；失败有可读错误。
3. **诚实边界**：引擎/账号未提供时显示原因（Soon / Kernel-wired），不可执行假按钮。
4. **安全默认**：写操作逐次确认；子任务默认只读；不读用户 CLI `~/.grok`。

## 2. 对齐状态（2026-08-01）

图例：✅ Real 桌面主路径 · 🟡 Kernel-wired/有限 · 🔶 已按键但验收未齐 · ⬜ Soon/不做 TUI 克隆

| 域 | 能力 | 桌面入口 | 状态 | 备注 |
|---|---|---|---|---|
| 会话 | 新建/恢复/重命名/删除/搜索 | 侧栏、任务搜索 | ✅ | |
| 会话 | 模型/努力程度 | 选择器、设置 | ✅ | |
| 会话 | 权限 Default/Auto/Full | Composer | ✅ | |
| 会话 | Plan / Explore | 模式钮、新建任务 | 🟡 | 质量看内核 |
| 会话 | Compact / Context / Task info | `+`、任务信息 | ✅ | slash 已路由到桌面 |
| 会话 | Fork / Rewind / Undo | `+` 与 slash 路由 | ✅ | |
| 会话 | 时间线 / 提示历史 / 建议下一步 | `+`、Composer | ✅ | |
| 会话 | 可恢复任务包 | `+` 导入导出 | 🟡 | 跨设备人工验收 |
| 会话 | 导出/诊断/反馈/Recap/Share | `+` | ✅ | |
| 子任务 | 树、停止、Inspect、重连 get | Process 面板 | 🟡 | ACP completed 有证据；UI 点按仍建议验收 |
| 子任务 | 主动委派 | `+ → 委派子任务` | 🟡 | 默认只读；真实 UI 闭环待人工 |
| Goal / Loop / Deep research | 表单 + 卡片 | `+` | ✅ | |
| 图像/视频/编辑 | 表单 | `+` | 🟡 | 账号门控 |
| 工作流 | 启动/暂停/停止/保存 | `+`、会话卡片 | 🟡 | |
| 运行中 | 旁问 / 插入 / 队列 | Composer | ✅ | |
| 记忆 | 面板：Remember/Forget/Flush/Dream/Compact | 记忆面板 | ✅ | slash 路由到面板 |
| 扩展 | Skills 运行表单、MCP、Plugins | 扩展面板 | ✅ | |
| Hooks | 创建/信任/启停/重载 | 设置 | 🟡 | ACP 真执行有证据 |
| Git / Review | Diff、Agent changes、Code nav | Review | ✅ | |
| Worktree | 创建/列表/切换 | 面板 | ✅ | |
| 账号/账单 | 登录、用量 | 设置/芯片 | ✅ | |
| 更新 | 检查（源码锁内核） | 设置 | ✅ | 升级 gorkX 不热更内核 |
| 环境 | Playwright MCP、读网页、截图 | 设置/添加 | ✅ | |
| Computer | 前台固定动作 + MCP 桥 | 设置 | 🟡 | 非原生 Computer ACP |
| GitHub | OAuth、PR 只读、写前确认 | 设置/Review | ✅ | scopes + lastVerified |
| 其它连接器 | Calendar 等 | 目录 | ⬜ Soon | 无官方授权链不伪装 |
| 第三方模型 | 验证后添加 | 设置 | 🔶 | H2 真推理待用户 endpoint |
| 语音 | 原生按钮 | Composer | 🔶 | H3 听写待麦克风 |
| TUI 主题/vim/fullscreen | App 主题与布局 | — | ⬜ | 不克隆 TUI |

## 3. 本轮已落地的“去命令化”

- **`applySlashPick`**：已知能力全部转到桌面控件（Review、扩展、记忆、Goal、Loop、媒体、设置模型、任务搜索、Task info、Worktree、Compact、Feedback…）。  
- 仍广告的未知引擎命令 → **`openEngineAction` 引导表单**，不再默认 `insertSlash`。  
- 仅完全未知的本地 token 才回退插入 `/name`（专家兼容）。  
- **顶栏一键**：进程 · 任务信息 · 扩展 · 记忆 · 计划 · 待处理 · Review · 终端。  
- **Composer**：活动会话显示「委派子任务」按钮。  
- **快捷键**（⌘⇧）：E 扩展 · M 记忆 · A 待处理 · S 计划 · B 委派 · P 进程 · I 任务信息；`⌘/` 打开说明（中英）。  
- **人工点按清单**：`docs/DESKTOP_ACCEPTANCE_CHECKLIST.md`。

## 4. 下一阶段实施顺序（按用户价值）

### P0 — 主路径完整易用（继续做）

1. **委派子任务 UI**（部分已落地）：启动后立即写入 Process 树行、打开进程面板、有界轮询 `get` 更新状态；Inspect 展示 output/worktree；Stop 立即标 cancelled。仍待人工点按验收与退出重开。  
2. **语音 H3**：麦克风授权后流式转写 → 草稿 → 手动发送。  
3. **干净安装 H1 / 第三方模型 H2**（发布阻断）。  

### P1 — 深化 Real

1. Hooks 设置页失败提示与启停人工走查。  
2. Computer：Accessibility 下截图/点击/急停一次。  
3. GitHub：网页撤销后“验证连接”提示完整往返。  

### P2 — 连接器逐个闭环

按 `NEXT_EXECUTION_PLAN` 阶段 3：一个平台走完 OAuth → 范围 → 读验证 → 写确认 → 断开。无官方链保持 Soon。

### 明确不做

- 在 App 层重写 Agent/Planner/Worker。  
- 把 TUI pager/vim/theme 伪造成 Agent 能力。  
- 未验收就标 Real 或发 DMG/Release。

## 5. 验证门禁

```bash
cd apps/desktop && npx tsc --noEmit && npm run test:stages && npm run build
cd apps/desktop/src-tauri && cargo test && cargo check
scripts/verify-grok-kernel-patches.sh vendor/grok-build
node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --desktop-controls
scripts/verify-macos-app-bundle.sh apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app
```

证据写入 `VALIDATION_EVIDENCE.md`。功能矩阵以 `FEATURES.md` + 本文件为准。

## 6. 与既有文档关系

| 文档 | 作用 |
|---|---|
| `DESKTOP_CAPABILITY_MAP.md` | 内核路由 ↔ 桌面入口对照 |
| `FEATURES.md` | Real / Kernel-wired / Soon 对外矩阵 |
| `NEXT_EXECUTION_PLAN.md` | 阶段与发布禁令 |
| **本文件** | **对齐执行清单与去命令化原则** |
