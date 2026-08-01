# 一次做完：gorkX 正式完备 →（可选）发版

> **目的**：避免「做一点停一下」。下面按 **一条龙执行** 设计：先列清边界，再给 **可无人值守连续跑的批次**，最后列 **必须你侧解锁** 的闸门。  
> **原则**：能自动的一次跑完；不能伪造的（Build 403、干净机、麦克风、tag）单独闸门，解锁后 **同一套脚本连续冲完**，不再拆成多次「继续」。

**当前基线（2026-08-01）**

| 项 | 状态 |
|---|---|
| 门禁 tsc / stages / cargo / patches / ACP / build:app | 已绿 |
| 桌面主路径映射 + 差距表 | `FORMAL_PARITY_GAP_TABLE.md` + `desktopPrimaryEntries` 20 路径 |
| 子任务 ACP 真完成 | explore/read-only → completed + output **有证据** |
| 主会话 `session/prompt` | **403** Build coming soon（本账号） |
| H1 / H2 / H3 / App 委派 GUI / tag·DMG | **未过** |

---

## 0. 两种「完成」定义（选一条当终点）

### 定义 A — 正式完备候选（**当前已基本达成，可再压实**）

- 桌面优先：Grok Build 用户能力 = 按钮/面板 **或** 诚实 Soon  
- 编码主路径接线 + 自动门禁绿 + ACP 可达证据  
- H1/H2/H3 / B1 主聊天：**书面阻塞** 或 **证据**  
- **不**强制 tag / DMG  

### 定义 B — 产品可对外「第一正式完整版」叙事（**需你解锁**）

- 定义 A  
- **+** B1 主聊天流式真回复（账号有 Grok Build）  
- **+** App 内委派子任务点按闭环（录像/步骤记录）  
- **+** H1 或书面接受开发机等价  
- **+**（可选）H2 / H3  
- **+** 你批准后的 tag / Release /（可选）DMG  

**建议默认终点：先压实定义 A → 你一句话解锁定义 B 的闸门 → 一条龙冲 B。**

---

## 1. 不可伪造闸门（必须你先给齐，否则永远「做一点停」）

| 闸门 ID | 你要提供 / 做的事 | 解锁后自动跑什么 |
|---|---|---|
| **G-BUILD** | xAI 账号开通 **Grok Build**（主 `session/prompt` 不再 403） | B1 短问答流式；可选 Rewind 两轮；升 FEATURES 主聊天证据 |
| **G-GUI** | 本机打开最新 `gorkX.app` 允许自动化/你坐镇 15 分钟 | 委派 ⇧⌘B → 树 → 停止/Inspect；A1–A5 点按勾选 |
| **G-H1** | 干净机 **或** 书面「接受开发机隔离证据等价 H1」 | 安装→登录→首任务→退出重开 记录 |
| **G-H2** | `BASE_URL` + API key + 模型 id（可丢弃） | Settings 验证→任务真回复→切回 Grok |
| **G-H3** | 允许麦克风 | 听写→草稿→不自动发送 |
| **G-SHIP** | 明确批准：`tag vX.Y.Z` / Release / 是否 DMG / 是否仅 ad-hoc | 打包、校验、（可选）`gh release` |

**没有 G-BUILD：主聊天无法「一次做完 Real」。** 子任务 ACP 已可完成，但主会话 403 是服务端策略。

---

## 2. 一条龙批次（执行者连续跑，中途不汇报「继续吗」）

### 批次 α — 纯自动压实（**现在就能一条龙，无需你在线**）

目标：把「能自动的」一次做满，产出可复核日志。

1. **映射审计再跑**  
   - 更新 `FORMAL_PARITY_GAP_TABLE` 若 FEATURES 有漂移  
   - `desktopPrimaryEntries` ≥20 全绿  
2. **全门禁**（失败则修到绿再往下，不中途停问）  
   ```bash
   cd apps/desktop && npx tsc --noEmit && npm run test:stages
   cd src-tauri && cargo test && cargo check
   cd ../.. && scripts/verify-grok-kernel-patches.sh vendor/grok-build
   node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok \
     --desktop-controls --voice-controls
   # 有 App auth 副本时：
   # GORKX_ACP_TEST_AUTH_DIR=... GORKX_ACP_TEST_PROJECT_DIR=... \
   #   node scripts/verify-grok-acp.mjs … --authenticated --subagent-controls --session-info --hooks-controls
   #   node scripts/verify-live-subagent-spawn.mjs …
   cd apps/desktop && npm run build:app
   scripts/verify-macos-app-bundle.sh …/gorkX.app
   ```  
3. **证据落盘**  
   - `docs/VALIDATION_EVIDENCE.md` 追加本跑日期节  
   - 日志目录固定：`docs/evidence/latest/` 或会话 scratch（二选一，计划默认 **docs/evidence/** 可提交摘要 + 大日志 gitignore）  
4. **文档对齐**  
   - FEATURES / README 候选包说明 / NEXT_EXECUTION_PLAN 状态表  
5. **提交 + push main**（仍 **不** tag）

**α 出口：** 候选包 + 证据刷新；B1 若仍 403 则 **只写阻塞不装作完成**。

---

### 批次 β — G-BUILD 解锁后（主聊天 + 深化，一条龙）

前置：`session/prompt` 对一句 `ping` 返回非 403。

1. B1：新建任务 → 短问题 → 流式 → 工具/权限若触发则点按  
2. Rewind：两轮后 checkpoints → conversation_only 预览  
3. 旁问 / 队列各一次（若 busy 可构造）  
4. 子任务：App 内委派只读 explore → 进程树 → Inspect（与 ACP 对齐）  
5. 更新 FEATURES：主聊天证据升级措辞；子任务 GUI 若完成则注明  
6. 全门禁再跑 + 证据 + push  

**β 出口：** 主聊天 + 委派 GUI 有证据；仍可不 tag。

---

### 批次 γ — G-GUI +（可选）H1/H2/H3（人工/半自动，一次坐镇）

**检查单（连续勾，不拆会话）：**

| # | 操作 | 通过标准 |
|---|---|---|
| A1 | 顶栏 扩展/记忆/计划/待处理 | 面板打开 |
| A2 | ⌘/ | 含 ⇧⌘A/B/M/S/P/I |
| A3 | 无连接点麦克风 | 提示 need task，不崩 |
| A4–A5 | 扩展/计划空状态 | 有下一步按钮 |
| B2–B3 | 委派只读 → 树 → 停/Inspect | 与内核状态一致 |
| B4–B5 | ⇧⌘P / ⇧⌘I | 开关/信息无密钥 |
| D1–D3 | Computer 急停 | 需 Accessibility |
| D4 | 语音 | 需 G-H3 |
| E1–E3 | H1/H2/H3 | 见闸门 |

全部结果写入 `DESKTOP_ACCEPTANCE_CHECKLIST.md` **一节**，截图可选放 `docs/screenshots/acceptance/`。

---

### 批次 δ — G-SHIP 解锁后（发版一条龙）

仅当你明确说例如：  
「批准 tag v1.1.0，ad-hoc DMG，发 GitHub Release」

1. 版本号对齐（package / tauri / Cargo / appMeta）  
2. `test:stages` + `build:app` +（若要）DMG  
3. `verify-macos-app-bundle` + 签名级别记录  
4. `gh release create` + 校验码  
5. RELEASE_NOTES 诚实写：Known limits（Soon 连接器、H* 若未过）

**无 G-SHIP 句：永不自动 tag。**

---

## 3. 执行协议（解决「做一点又停」）

对执行 Agent 的硬性约定：

1. **一次授权**：用户说「按 ONE_SHOT 跑 α」或「α+β（已开通 Build）」后，**连续执行到该批次出口**，中途只因 **红门禁修代码** 或 **闸门未满足** 停。  
2. **禁止**：每修一个小功能就停下来问「继续吗」。  
3. **允许停的唯一理由**：  
   - 闸门未开（403 / 无 endpoint / 无批准 tag）  
   - 修同一缺陷超过 N 次仍红（默认 N=3）→ 写阻塞报告  
4. **进度可见**：用 todo 列表；结束时用 **一张出口表**，不拆多轮叙事。

### 你可直接复制的触发语

```
按 docs/ONE_SHOT_COMPLETION_PLAN.md 跑批次 α，连续到出口再汇报。
```

```
Build 已开通。按 ONE_SHOT 跑 α+β，连续到出口；不要中途问继续。
```

```
批准 tag v1.1.0 ad-hoc DMG 发 Release。按 ONE_SHOT 批次 δ 一条龙做完。
```

```
开发机等价 H1 我接受。H2 endpoint=… key=… model=…。按 γ 能跑的一起跑完。
```

---

## 4. 与 Codex「完成度」对齐的诚实边界

| Codex 级期望 | 本计划覆盖 |
|---|---|
| 桌面写码主循环 | α +（β 若 G-BUILD） |
| 多任务 / 审阅 / 终端 / worktree | 已接线；γ 点按确认 |
| 连接器全家桶 Real | **不做假**；Soon 保持 |
| 公证分发 | 仅 δ + 证书 |

**「Grok Build 全部对应桌面」** = 有能力就有按钮；没有官方链 = Soon。  
**不是** 在账号无 Build 时硬做出主聊天 Real。

---

## 5. 推荐路径（你要「一次性完成」时）

| 步骤 | 谁 | 动作 |
|---|---|---|
| 1 | 你 | 选定终点：**仅 A** 或 **A+B（发版）** |
| 2 | 你 | 打开需要的闸门（至少 G-BUILD 才能主聊天 Real） |
| 3 | Agent | **一条龙 α**（及已解锁的 β/γ/δ） |
| 4 | 双方 | 出口表签字：绿项 / 永久阻塞项 |

---

## 6. 批次 α 出口检查表（Agent 自检）

- [ ] `test:stages` PASS  
- [ ] `cargo test` PASS  
- [ ] ACP desktop (+ auth 子任务若可) 记录  
- [ ] `build:app` + bundle verify PASS  
- [ ] `FORMAL_PARITY_GAP_TABLE` 与证据无矛盾 Real  
- [ ] B1：绿证据 **或** 403 阻塞仍在  
- [ ] main 已 push；**无** tag 除非 G-SHIP  

---

## 7. 当前账号已知事实（避免重复撞墙）

- 主 `session/prompt`：**403** Build coming soon  
- 只读 **subagent spawn→completed**：已成功（同账号）  
→ β 里「主聊天」依赖 G-BUILD；「委派 ACP」已可做，**App GUI** 仍要 G-GUI  

---

*本文件是「一次做完」的执行合同。日常碎片「继续」请改为上方触发语之一。*
