# gorkX 下一阶段执行方案

> 用途：交给 Grok 继续开发 gorkX。  
> 原则：按阶段执行、每一步可验证；没有真实链路就标记限制，不得用静态 UI、slash 文本或本地假数据冒充完成。  
> 范围：只更新源码和验证记录；**未经用户明确批准，不打 tag、不发 GitHub Release、不生成或上传 DMG**。

## 0. 当前基线（2026-08-01）

| 项 | 值 |
|---|---|
| 工作区 | `/Users/link/projects/gorkX` |
| 分支 | `main`（与 `origin/main` 同步） |
| 近期主线 | 错误 humanize、子任务树/轮询/Inspect、快捷键目录、`build:app` 绿 |
| 包内 Grok Build | `0.2.116 (dd04f39)` + 补丁 0001–0007 |
| App 包 | `apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app`（CFBundle `1.0.0`，`verify-macos-app-bundle` PASS） |
| 功能矩阵 | `docs/FEATURES.md` · 对齐 `docs/DESKTOP_ALIGNMENT_PLAN.md` · 证据 `docs/VALIDATION_EVIDENCE.md` |

### 阶段完成度（诚实）

| 阶段 | 状态 |
|---|---|
| **0** 子 Agent WIP 收口 | **已完成**：补丁 0007、spawn 路由、桌面面板、门禁与证据已落；**真 UI 点按 spawn 仍缺** |
| **1** H1/H2/H3 发布阻断 | **未达成**：需干净机 / endpoint / 麦克风真人证据 |
| **2** 深化 Real | **部分**：Hooks/Computer/GitHub **代码**已增强；**真人 live** 仍缺；子任务代码闭环加固 |
| **3** 连接器闭环 | Calendar 等保持 **Soon**；GitHub OAuth/验证代码已有，live 撤销往返待人工 |

功能状态口径：

- **Real**：桌面端已有真实端到端链路（有证据）。
- **Kernel-wired**：已接 Grok Build 原生能力，仍可能需账号、权限或人工验收。
- **Soon**：无官方授权链；入口必须诚实，不可伪装已连接。

## 1. 当前优先（按用户价值，无额度也可推进代码）

1. **人工点按**（本机 `gorkX.app`）：`docs/DESKTOP_ACCEPTANCE_CHECKLIST.md` A1–A5、B2–B5；有 Build 权限时再做 B1/B3。  
2. **委派子任务**：GUI 闭环录像（启动 → 树 → 停止/Inspect）；仍标 Kernel-wired 直至重开恢复有证据。  
3. **阶段 1**：H1 干净安装、H2 endpoint、H3 语音 — **用户侧**；不得伪造。  
4. **连接器**：仅当有官方 OAuth 链时推进；否则保持 Soon。

### 门禁（每次合入前）

```bash
cd apps/desktop
npx tsc --noEmit
npm run test:stages
npm run build

cd src-tauri && cargo test && cargo check

cd /Users/link/projects/gorkX
scripts/verify-grok-kernel-patches.sh vendor/grok-build
node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --desktop-controls
# 改过 Tauri/前端生产路径后：
# npm run build:app -C apps/desktop
# scripts/verify-macos-app-bundle.sh apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app
```

证据写入 `docs/VALIDATION_EVIDENCE.md`。失败不标 Real。

## 2. 明确不做

- 未批准：tag、GitHub Release、DMG 上传。  
- 不在 App 层重写 Agent/Planner/Worker。  
- 不把 TUI pager/vim/theme 伪造成 Agent 能力。  
- 不把 SuperGrok 聊天权限写成 Grok Build 可用；**403 不得绕过**。  
- 不读用户 CLI `~/.grok` 冒充 App 登录。

## 3. 给执行者的触发语

> 打开 `docs/NEXT_EXECUTION_PLAN.md`，从「当前优先」继续。先跑门禁再改代码。无 Build 权限时做桌面 UX/接线/测试；有权限时优先 B1 真对话与委派 UI 闭环。未经用户明确批准，不打 tag、不发 Release、不做 DMG。

## 4. 与文档关系

| 文档 | 作用 |
|---|---|
| `FEATURES.md` | 对外 Real / Kernel-wired / Soon |
| `DESKTOP_ALIGNMENT_PLAN.md` | 对齐矩阵与 P0/P1 |
| `DESKTOP_ACCEPTANCE_CHECKLIST.md` | 人工点按清单 |
| `VALIDATION_EVIDENCE.md` | 可复跑证据台账 |
| **本文件** | 阶段状态与下一刀执行顺序 |
