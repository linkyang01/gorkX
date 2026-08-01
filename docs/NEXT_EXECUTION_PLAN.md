# gorkX 下一阶段执行方案

> 用途：交给 Grok 继续开发 gorkX。  
> 原则：按阶段执行、每一步可验证；没有真实链路就标记限制，不得用静态 UI、slash 文本或本地假数据冒充完成。  
> 范围：只更新源码和验证记录；未经用户明确批准，不打 tag、不发 GitHub Release、不生成或上传 DMG。

## 0. 当前基线

- 工作区：`/Users/link/projects/gorkX`
- 分支：`main`
- 最近已推送提交：`5f2c930 feat: add desktop conversation timeline`
- 包内 Grok Build：`0.2.116 (dd04f39)`
- 当前内核来源与补丁由 `kernel/grok-build.lock.toml`、`kernel/patches/series` 管理。
- 当前工作区有一组未提交 WIP，主题是“`+ → 委派子任务`”的原生子 Agent 接入，包含：
  - `kernel/patches/0007-acp-desktop-subagent-spawn.patch`
  - `apps/desktop/src/components/SubagentSpawnPanel.tsx`
  - ACP 客户端、加号菜单、国际化、验证脚本和相关文档修改
- 这些 WIP 在全部门禁通过并提交前，不得写成已发布功能。

功能状态以 `docs/FEATURES.md` 为准：

- Real：桌面端已有真实端到端链路。
- Kernel-wired：已接入 Grok Build 原生能力，但仍可能需要账号、权限或人工验收。
- Soon：当前不支持，入口必须诚实显示原因，不能伪装成已连接。

## 1. 阶段 0：收口当前子 Agent WIP

### 工作内容

1. 审阅当前 diff，只保留子 Agent 委派相关源码、内核补丁、测试与文档。
2. 确认 `vendor/grok-build` 没有未记录修改。
3. 验证补丁序列：

   ```bash
   cd /Users/link/projects/gorkX
   scripts/verify-grok-kernel-patches.sh vendor/grok-build
   ```

4. 重新构建包内内核，并确认版本仍为 `0.2.116 (dd04f39)`：

   ```bash
   scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok
   apps/desktop/src-tauri/resources/grok --version
   ```

5. 运行 ACP 无认证探针，至少确认 `subagent/spawn` 路由存在且不存在父会话时安全拒绝，不启动真实子任务。
6. 运行桌面端门禁：

   ```bash
   cd apps/desktop
   npx tsc --noEmit
   npm run test:stages
   npm run build
   npm run build:app

   cd src-tauri
   cargo test
   cargo check

   cd /Users/link/projects/gorkX
   scripts/verify-macos-app-bundle.sh \
     apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app
   ```

7. 更新 `docs/VALIDATION_EVIDENCE.md`，说明：路由和源码编译已通过，但真实子任务执行仍需要一次性认证账号和可丢弃项目。
8. `git diff --check` 通过后再提交；不要在本阶段发 Release、打 tag 或做 DMG 发布。

### 阶段 0 出口

- 前端、Rust、内核补丁、ACP、App bundle 全部通过。
- `+ → 委派子任务` 是真实 ACP 路由，不是本地模拟循环。
- 所有共享写入/执行权限都有二次确认，默认只读。
- 工作区只剩有意保留的提交内容，不能带入 vendor 临时修改。

## 2. 阶段 1：下一版 Beta 的发布阻断验收

阶段 0 通过后，才进入本阶段。以下三项缺一不可；没有真实证据就保持“未验收”。

### H1：干净 macOS 独立安装

在没有既有 Grok CLI 数据的环境完成：

1. 安装 gorkX。
2. App 内完成登录或重新认证。
3. 打开一个真实项目并发送真实任务。
4. 退出 App。
5. 重新打开并恢复同一任务。
6. 确认使用的是 App 自有 `GROK_HOME`，不是用户 CLI 家目录。

记录安装、登录、首轮任务、重开恢复和失败信息。

### H2：第三方 API / 兼容模型真实链路

使用用户明确提供的 endpoint 和密钥，在一次性测试配置中完成：

1. 连接测试。
2. 读取真实模型目录或验证真实模型 ID。
3. 保存到 Keychain/受控配置。
4. 新建任务选择该模型。
5. 收到真实回复。
6. 切回 Grok 模型后仍能正常工作。

如果用户未提供可授权 endpoint，必须记录“未验收”，不能把配置成功或 `session/set_model` 接受写成真实推理完成。

### H3：macOS 语音真实验收

在用户允许麦克风权限的 macOS 上完成：

1. 点击语音按钮。
2. 允许麦克风访问。
3. 说出一段话并看到流式转写。
4. 转写进入可编辑草稿。
5. 用户手动发送，不得自动发送。
6. 检查停止、关闭窗口和权限拒绝状态。

### 阶段 1 出口

- H1、H2、H3 均有步骤记录和结果。
- 所有未通过项在 README、设置页和发布说明中保持诚实边界。
- 通过后才可形成下一版 Beta 发布候选；仍需用户明确批准才可真正发布。

## 3. 阶段 2：补齐完整 Agent 工作流

这些是完整目标的主要开发缺口，不应通过静态入口提前宣传。

### 3.1 子 Agent 真正闭环

- 在可丢弃 Git 项目中真实启动只读子任务。
- 验证角色、权限、worktree 隔离和父子任务树。
- 验证审批、取消、失败、重试、完成结果和 App 重开恢复。
- 禁止父任务和子任务在共享工作区发生未确认的并行写入。

### 3.2 Hooks 真执行闭环

- 创建一个最小项目 Hook。
- 显式信任项目。
- 由 Grok Build 执行 Hook，App 不自行执行。
- 验证启用、禁用、重载、移除和失败提示。

### 3.3 GitHub 安全收口

- 浏览器授权后显示身份、权限范围和最后验证时间。
- 断开连接时删除 Keychain 凭据并显示未连接。
- 创建 PR、评论或其他远端写入前逐次确认目标仓库和动作。
- 验证 GitHub 侧撤销后 App 能识别过期状态。
- 后续再评估最小仓库权限的 GitHub App；不把公开 OAuth 范围扩大成默认可信。

### 3.4 Browser / Computer 真实边界

- Browser：目标页、动作日志、域名许可、截图和停止操作可见可复盘。
- Computer：只允许用户授权后的前台可见动作、固定截图/点击/按键/文字和急停。
- 不做后台屏幕采集、隐藏窗口操控、任意 AppleScript 或任意脚本执行。
- Grok Build 没有原生 Computer ACP 时，不能把 App-owned MCP 桥称为原生内核能力。

## 4. 阶段 3：连接器与多 Provider

按一个平台一个完整闭环推进，不一次性铺开大量入口：

1. 点击连接。
2. 打开官方网页或系统授权页。
3. 回到 gorkX 自动显示连接状态。
4. 展示权限范围、可访问对象和最后验证时间。
5. 用真实读操作验证。
6. 高风险写操作逐次确认。
7. 支持断开并清理本地凭据。

API Key、PAT、网关 URL 只能作为高级兼容入口。网页订阅不能直接伪装成 API 登录；没有官方授权链的服务显示 Soon 或高级配置说明。

## 5. 阶段 4：正式版稳定性

只有阶段 1 的 Beta 真实验收稳定后才进入：

- 数据迁移和回滚。
- 更新失败恢复。
- 崩溃报告选择加入。
- 性能预算和长会话稳定性。
- 隐私、密钥、日志和导出复查。
- Developer ID 签名/公证（若具备凭证）。
- 至少两周真实使用，无 P0/P1 数据损失。
- 版本元数据、README、发布说明和功能矩阵一致。

## 6. 严格禁止事项

- 不在 App 层重写 Grok Build Agent/Planner/Worker 循环。
- 不用 slash 文本回显冒充桌面能力。
- 不把路由可达、编译通过或按钮出现写成真实任务完成。
- 不估算或猜测 Grok 订阅额度；只显示服务端真实字段。
- 不读取用户 CLI `GROK_HOME`、浏览器登录状态或 `gh` 凭据作为隐藏快捷方式。
- 不在用户明确批准前打 tag、发 Release、生成或上传 DMG。

## 7. 交给 Grok 的执行指令

将下面这句话连同本文件路径交给 Grok：

> 打开 `/Users/link/projects/gorkX/docs/NEXT_EXECUTION_PLAN.md`，从阶段 0 开始执行。先审阅当前 WIP 和工作区状态，再按顺序完成代码、内核、ACP、前端、Rust 和 App bundle 验收。每个阶段必须留下真实证据；遇到账号、权限或内核能力不足时记录阻塞，不得伪造成功。未经用户明确批准，不打 tag、不发 GitHub Release、不做 DMG 发布。

