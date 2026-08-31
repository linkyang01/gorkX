# 本地验收证据台账

本文件记录可复跑的本地验收，不将单机通过扩大解释为发布或完整端到端验收。
发布门槛仍以 [NEXT_RELEASE_GATES.md](NEXT_RELEASE_GATES.md) 为准。

## 2026-08-31 · 后续开发收口与真实门禁复核

本节记录本次“把后续开发全做完”实际完成的源码、依赖、安全门禁和内核重建。
提交只包含源码、锁文件、脚本、CI 配置与证据文档；没有 tag、Release、DMG 或上传资产。

| 项 | 结果 |
|---|---|
| 任务/审批生命周期 | **PASS**：`taskLifecycle.ts` 把发送、重连、内核队列、本地 fallback、忙时 `/btw`、审批去重/选择/按任务清理、取消/失败/进程退出状态收敛为可测纯函数；`taskLifecycle.test.ts` 已接入 Stage B。 |
| ACP 契约 | **PASS**：`acpContract.test.ts` 使用官方 `@agentclientprotocol/sdk` in-process agent/client，实测 initialize、session/new、permission、session/update、end_turn、session/cancel/cancelled，并再次完成完整握手。 |
| Hook 阻止文案 | **PASS**：`taskRunStatus.test.ts` 覆盖 `HookDenied`、`stopReason`、`stop_reason`、`message` 中的上游 “Turn blocked by a hook” 变体；普通取消语义保持独立。 |
| Web UI 核心流 | **PASS**：`GORKX_CARGO_OFFLINE=1 ./scripts/verify-quality.sh` 内的 Playwright Chromium 实际打开 Vite Web UI，home composer、slash listbox、Escape、`+` capability menu 均通过。 |
| 前端与 Rust 统一门禁 | **PASS**：同一统一命令完成 Stage A–G、TypeScript、生产 Web 构建、bundle 体积/懒加载检查、Rust fmt/check/clippy `-D warnings` 与 Rust **104/104** 单测。Vite 大 chunk 仍为非阻断 warning。 |
| 依赖修复与供应链 | **PASS（范围明确）**：`portable-pty` 升至维护中的 `0.9.0`，移除已弃用 `serial` 链；`event-listener` 升至修复版 `5.4.2`；本地 `cargo-deny 0.20.2` 对正式 `aarch64-apple-darwin` 图的 advisories/bans/licenses/sources 全通过，OSV-Scanner `2.5.1` 对 npm 锁文件报告 `No issues found`。Linux GTK3 传递图仍是实验平台单独门槛。 |
| 锁定内核与补丁 | **PASS**：`bc7f02eddd3d84085849dc19ed216f11c23b0571` 已复核，0001–0007 七个补丁按 series 顺序均可重放。 |
| Bundled kernel 重建 | **PASS**：`CARGO_TARGET_DIR="$PWD/.cache/kernel-target" scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok` 完成 release 构建；资源报告 `grok 1.0.12 (bc7f02eddd3d)`，binary SHA-256=`d5032fdfa5adb049022dbc35cabede8e869ab2076844aefa40082c51a6646aea`，LICENSE / THIRD-PARTY-NOTICES SHA-256 仍分别为 `116f7778b9802e569b7fa3a532b17bd80eb13c67837def01eed093d4ea472f28` / `7b7c315403c596f9b7a13bb562553ee4fd4c05da8672f95bcaa02a125eea2947`；重建后 bundled kernel ACP initialize 通过。 |
| 真实发布边界 | **未关闭**：CI runner 首次执行、Developer ID/公证、Tauri updater 密钥、干净 Mac、原生 Intel、真实账号/Hook/麦克风等仍不能由本地 Web/协议 fixture 推断；本次没有执行发布动作。 |

## 2026-08-31 · gorkX 1.3.1 Apple Silicon arm64_adhoc 发布

本条记录对应 gorkX `1.3.1` 发布候选和 Grok Build `1.0.12`；公开范围明确为
Apple Silicon `arm64_adhoc`。完整分发门槛仍未被豁免为“已通过”：干净机安装/登录/重开、
Developer ID 与 Apple 公证、原生 Intel 验收继续保留在 waiver 中。

| 项 | 结果 |
|---|---|
| 版本一致性 | **PASS**：`apps/desktop/package.json`、`package-lock.json`、Tauri config、Cargo manifest/lock 与 renderer `APP_VERSION` 均为 `1.3.1`；Stage G 版本单测通过。 |
| 锁定源码与补丁 | **PASS**：锁定 `xai-org/grok-build` 提交 `bc7f02eddd3d84085849dc19ed216f11c23b0571`；source verification、0001–0007 `git apply --check` 与按 series 重放均通过。 |
| Bundled kernel | **PASS**：release 构建后资源为 `grok 1.0.12 (bc7f02eddd3d)`；binary SHA-256=`3900246994a28e64343a3d77ba61c0600582cbaf4c0e95580dd844a8294b32c7`，LICENSE / THIRD-PARTY-NOTICES SHA-256=`116f7778b9802e569b7fa3a532b17bd80eb13c67837def01eed093d4ea472f28` / `7b7c315403c596f9b7a13bb562553ee4fd4c05da8672f95bcaa02a125eea2947`。 |
| ACP 与前端 | **PASS**：新 bundled kernel 的无认证完整 ACP 控制矩阵通过；`npm run typecheck`、`npm run build`、`npm run test:stages`（Stage A–G）与 `npm run verify:web-bundle` 通过；`HookDenied` / “Turn blocked by a hook” 回归通过。 |
| Rust | **PASS**：`cargo check` 与 `cargo test --workspace --lib` 通过，96/96 tests passed。 |
| 当前真实认证回合 | **PASS**：隔离 App-owned 登录副本与一次性 Git 项目执行 `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --resource`；`initialize`、`authenticate(cached_token)`、`session/new`、`session/load`、真实 `session/prompt` resource-link 和后续只读控制检查均通过，临时目录已清理。 |
| App / DMG | **PASS**：App 与 DMG 只读核验均为 arm64，App 版本 `1.3.1`、包内内核 `grok 1.0.12 (bc7f02eddd3d)`、许可证/声明、隔离 `GROK_HOME` 通过；签名完整性通过但级别为 `adhoc`，未公证。DMG 大小 `71,006,820` bytes，SHA-256=`c372662bf1b4d7a5fa93bd220ae7137679666a4da616e76dd72642f6900e5f62`。 |
| 受限发布门 | **PASS WITH EXPLICIT WAIVER**：以用户本轮发布授权、`GORKX_RELEASE_SCOPE=arm64_adhoc`、`GORKX_LIMITED_RELEASE_WAIVER=1`、当前真实 prompt、既有真实第三方模型/麦克风证据和 `GORKX_ARCH_VERIFIED=arm64` 运行 `scripts/verify-release-readiness.sh`；结果 `releaseCandidateReady: true`、`canShipPublicArtifacts: true`、`blockers: []`。waiver 明确保留 clean-machine、Developer ID/notarization 和 x86_64 范围，不将其写成通过。 |
| 公开发布 | **PUBLISHED**：提交 `e782fe946a8eec43db94e8fc972075b04b7e27a9` 已推送到 `main`，annotated tag `v1.3.1` 解引用到同一提交；[GitHub Release v1.3.1](https://github.com/linkyang01/gorkX/releases/tag/v1.3.1) 为非 draft、非 prerelease，资产 `gorkX_1.3.1_aarch64.dmg` 状态为 `uploaded`、大小 `71,006,820` bytes，GitHub digest 与本地均为 `sha256:c372662bf1b4d7a5fa93bd220ae7137679666a4da616e76dd72642f6900e5f62`。从公开下载 URL 重新下载后再次只读挂载，App 1.3.1、arm64 主程序/内核、Grok Build 1.0.12、许可证、隔离 `GROK_HOME` 与完整签名完整性均 **PASS**；签名仍为 ad-hoc，未公证。 |

## 2026-08-31 · 8 分质量提升 P0 源码与回归门禁

本条只登记本轮实际退出成功的源码、构建和锁定内核检查；供应链扫描工具缺失不列为通过项。

| 项 | 结果 |
|---|---|
| 前端 Stage A–G | **PASS**：`cd apps/desktop && npm run test:stages`；包含 HookDenied、队列、审批、连接器、模型验证和发布一致性回归。 |
| TypeScript 与 Web 包 | **PASS**：`cd apps/desktop && npm run typecheck && npm run build`，随后 `scripts/verify-desktop-web-build.sh`；初始 JS gzip `185,971 / 512,000` bytes，懒加载面板检查通过。 |
| Rust 格式、编译与静态检查 | **PASS**：`cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --all -- --check`、`cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --offline --locked`、`cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --all-targets --offline --locked -- -D warnings`。 |
| Rust 全量单测 | **PASS**：`cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --offline --locked`；104/104 passed。 |
| 模型配置安全回归 | **PASS**：`models_config::tests` 17/17 passed；覆盖标准 TOML、注释/引号/逗号/未知字段保留、非法/超大配置、env_key 校验、Keychain 生命周期决策、原子私有配置写入、请求元数据和秘密 Debug 脱敏。 |
| ACP 文件边界回归 | **PASS**：`workspace::tests::client_file_read_is_project_bounded_and_rejects_symlinks`；项目内文本可读，项目外路径和符号链接均拒绝；`fs/read_text_file` 已接入同一原生边界。 |
| Hook 阻止文案回归 | **PASS**：`cd apps/desktop && node --experimental-strip-types src/lib/taskRunStatus.test.ts`；上游 `Turn blocked by a hook` 的 `stopReason`、`stop_reason`、`message` 与 `HookDenied` 均识别为 Hook 阻止，普通取消仍保持原语义。 |
| 锁定内核源码、补丁与 ACP | **PASS**：`scripts/verify-grok-kernel-source.sh`、`scripts/verify-grok-kernel-patches.sh`、`node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok`；锁定提交 `bc7f02eddd3d84085849dc19ed216f11c23b0571`，0001–0007 重放检查和无认证 ACP initialize 均通过。 |
| 变更一致性 | **PASS**：`bash -n scripts/verify-quality.sh scripts/verify-supply-chain.sh` 与 `git diff --check` 通过；`.cache/`、`target/`、`node_modules/` 未纳入源码提交范围。 |

## 2026-08-31 · 8 分质量提升 P1/P2 代码与安全门禁

本节只记录本轮已经在本机实际执行并退出成功的检查；GitHub runner、真实签名、
updater 密钥和跨平台原生 App 仍单独列为未执行，不从配置文件推断通过。

| 项 | 结果 |
|---|---|
| 任务生命周期策略 | **PASS**：`node --experimental-strip-types apps/desktop/src/lib/taskLifecycle.test.ts`；覆盖空提交、重连、内核队列、本地 fallback、`/btw` 忙时旁问、审批去重/选择/按任务清理，以及失败/取消/进程退出后 busy、queue、approval 一致性。 |
| ACP 官方 SDK 契约 | **PASS**：`node --experimental-strip-types apps/desktop/src/lib/acpContract.test.ts`；使用现有 `@agentclientprotocol/sdk` in-process agent/client，实际走 initialize、session/new、permission request、session/update、end_turn、session/cancel/cancelled，并再次完成完整握手。 |
| 浏览器 Web UI 冒烟 | **PASS**：`cd apps/desktop && npm run test:e2e -- --reporter=line`；Playwright Chromium 真实打开 Vite Web UI，验证 home composer、slash listbox、Escape 关闭和 `+` capability menu。该项不替代 Tauri 原生权限/Keychain/真实内核回合。 |
| Updater manifest 形状回归 | **PASS**：`cd apps/desktop && npm run test:stage-g`；验证合法 semver/HTTPS/签名/SHA-256，以及 HTTP、缺签名反向拒绝。没有把该脚本写成密码学签名验证。 |
| npm 依赖漏洞 | **PASS**：`cd apps/desktop && npm audit --omit=dev --audit-level=high --json` 返回生产依赖 high/critical 为 `0`；全量 audit 修复 `nanoid` / `postcss` 传递版本后返回总漏洞 `0`。 |
| 统一门禁接线 | **PASS（源码级）**：`verify-quality.sh` 已包含 Playwright；`quality.yml` 接入 cargo-deny、OSV-Scanner、Rustfmt/Clippy、SBOM、依赖审查、内核重建和 Ubuntu/macOS/Windows Web 矩阵；Actions 使用不可变 commit SHA。GitHub runner 尚未在本台执行，不将配置写成 CI PASS。 |
| 严格签名门禁 | **已实现，未通过/未执行**：`verify-release-signing.sh` 要求 Developer ID、TeamIdentifier 和 Gatekeeper；当前 `signingIdentity: "-"` 的 ad-hoc 候选不能通过，故不创建伪造签名证据。 |
| 供应链本机 Rust/npm 扫描 | **PASS（范围明确）**：`./scripts/verify-supply-chain.sh`；cargo-deny `0.20.2` 对正式 `aarch64-apple-darwin` Rust 图的 advisories/bans/licenses/sources 通过，OSV-Scanner `2.5.1` 对 npm 锁文件报告 `No issues found`。`cargo-audit` 未安装，仅保留为可选补充；Linux GTK3 实验图不从该 PASS 推断。 |

## 2026-08-31 · Grok Build 1.0.12 内核同步与桌面回归

本条记录对应源码分支 `agent/grok-build-1.0.12-sync`。只记录本轮实际通过的
机器侧检查；没有创建 tag、发布 GitHub Release、生成 DMG 或上传发布资产。

| 项 | 结果 |
|---|---|
| 锁定源码 | **PASS**：`kernel/grok-build.lock.toml` 锁定 `xai-org/grok-build` 提交 `bc7f02eddd3d84085849dc19ed216f11c23b0571`；`scripts/verify-grok-kernel-source.sh` 通过，`source_revision_verified = true` 仅在完成重建和版本校验后更新。 |
| 补丁重放 | **PASS**：`scripts/verify-grok-kernel-patches.sh` 逐一对 `0001`–`0007` 执行 `git apply --check`，七个补丁全部通过；构建脚本在锁定提交的临时 worktree 中按 `kernel/patches/series` 顺序重放。 |
| Bundled kernel | **PASS**：`CARGO_TARGET_DIR="$PWD/.cache/kernel-target" scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok` 完成 release 构建；资源版本为 `grok 1.0.12 (bc7f02eddd3d)`，binary SHA-256=`3900246994a28e64343a3d77ba61c0600582cbaf4c0e95580dd844a8294b32c7`，LICENSE / THIRD-PARTY-NOTICES SHA-256 分别为锁定值 `116f7778b9802e569b7fa3a532b17bd80eb13c67837def01eed093d4ea472f28` / `7b7c315403c596f9b7a13bb562553ee4fd4c05da8672f95bcaa02a125eea2947`。 |
| ACP 控制面 | **PASS**：使用新 bundled kernel 运行 `verify-grok-acp.mjs` 完整无认证控制矩阵；initialize、voice、interject/btw、memory/repair/goal/desktop actions、hunk/code/Git、cloud/billing guards、session search/history/suggestion/bundle、client FS、禁用 Web Search 和 model reload 均通过。认证扩展仍未冒充通过。 |
| 前端门禁 | **PASS**：`npm run typecheck`、`npm run build`、`npm run test:stages`（Stage A–G）和 `npm run verify:web-bundle` 均通过；Stage B 包含 Hook 终态回归。Vite 继续报告既有大 chunk warning，不影响退出码。 |
| Rust 门禁 | **PASS**：`cargo check` 和 `cargo test --workspace --lib` 通过，96/96 tests passed。 |
| Hook 阻止提示 | **PASS**：前端识别 Grok Build 1.0.12 的 `_meta.cancellationCategory=HookDenied`，显示上游语义 “Turn blocked by a hook.”；普通取消仍显示通用停止原因；`node --experimental-strip-types src/lib/taskRunStatus.test.ts` 及 Stage B 回归通过。 |

## 2026-08-23 · gorkX 1.3.0 Apple Silicon 正式发布验收

本条记录发布所有者随后作出的明确决定：`v1.3.0` 以 `arm64_adhoc` 范围正式
发布。它是独立的风险豁免，不回写或伪造下方全量分发门槛的通过状态。

| 项 | 结果 |
|---|---|
| 版本一致性 | **PASS**：`package.json`、`package-lock.json`、Tauri config、Cargo manifest/lock 与 renderer `APP_VERSION` 均为 `1.3.0`；Stage G 单测继续锁定五处版本一致。 |
| 完整 App 签名 | **PASS**：Tauri 使用 identity `-` 对主程序和完整 `.app` 重新签名；`codesign --verify --deep --strict` 返回 valid，Info.plist 与 sealed resources 均进入签名。旧 `1.2.0` App 因版本不匹配且签名不完整被新版门禁分别拒绝，未复用旧包。 |
| DMG 真实复验 | **PASS**：`gorkX_1.3.0_aarch64.dmg` 只读挂载后，主程序与包内 Grok Build 均为 arm64，App 版本 `1.3.0`，内核版本 `grok 1.0.6 (19d42e35)`，许可证、隔离 `GROK_HOME` 和完整 App 签名均通过。SHA-256 `00d212cfb6e9d498a9eb1fac282215c9feca34da8b65d50ae78f4d6e75040fba`。 |
| 受限发布门 | **PASS WITH EXPLICIT WAIVER**：`GORKX_RELEASE_SCOPE=arm64_adhoc`、`GORKX_LIMITED_RELEASE_WAIVER=1`、真实 prompt/第三方模型/麦克风证据与 `GORKX_ARCH_VERIFIED=arm64` 复跑，结果为 `canShipPublicArtifacts: true`、`blockers: []`。JSON 的 `waivers` 仍分别保留 clean-machine、Developer ID/notarization 与 x86_64 范围决定，不将其记为测试通过。 |
| 发布状态 | **PUBLISHED**：发布提交 `d5d46ab` 已快进到 `main`，annotated tag `v1.3.0` 解引用到同一提交；[GitHub Release v1.3.0](https://github.com/linkyang01/gorkX/releases/tag/v1.3.0) 为 Latest、非 draft、非 prerelease，资产 `gorkX_1.3.0_aarch64.dmg` 状态为 uploaded、大小 `69,669,173` bytes，GitHub digest 与本地均为 `sha256:00d212cfb6e9d498a9eb1fac282215c9feca34da8b65d50ae78f4d6e75040fba`。从公开 Release 重新下载后再次只读挂载，版本、arm64 架构、Grok Build 1.0.6、许可证、隔离 `GROK_HOME` 与完整 App 签名全部 **PASS**。 |

## 2026-08-23 · Hooks 真实验收闭环、发布通道修复与跨架构复验

本条记录对应源码分支 `agent/grok-build-1.0.6-sync`。本轮只把内核真实写入的
marker 作为证据：任务失败时即使观察到 marker 也仍判失败；没有用 UI 状态、超时
或验证脚本自行写 marker。专项验收通过后，按仓库 Stage G 规则仍未创建 tag、
GitHub Release、DMG 或上传发布资产。随后修复认证兼容问题，并在修复后的新 App
包中重新完成清洁 HOME、真实任务和 Settings Hook 闭环；又完成真实第三方模型、
真人麦克风与 x86_64 产物的补充复验。一次性凭据、项目、模型配置和构建目录均已清理。

| 项 | 结果 |
|---|---|
| 版本闸门修复 | **PASS**：第一次锁定构建暴露出显示版本错误 `grok grok 1.0.6`，构建闸门拒绝该产物；`scripts/build-grok-kernel.sh` 已将锁文件中的用户显示版本拆为编译期裸版本 `1.0.6`，最终资源和 App 包均报告 `grok 1.0.6 (19d42e35)`。这保证发布候选不会因错误版本字符串绕过服务端版本合同，也不会因开发态版本自动授信。 |
| Settings 实际点按 | **PASS**：用修正后的源码构建 `.app`，Settings → Hooks 实际创建 OS 临时 Git 项目和固定受限 `SessionStart` Hook；控制任务初始 marker 为 `missing`。随后依次实际点击“明确授信项目”“重新加载 Hooks”“启动真实任务”，每一步均由真实 ACP 返回结果推进，不是状态注入。 |
| Settings 真实任务 | **PASS**：真实任务消息返回 `HOOK_VERIFICATION_TASK_OK`；随后 Settings 只读 marker 得到 `match`，界面显示“已确认 marker”和“通过：Grok Build 在真实 SessionStart 任务中创建了 marker”。marker 由 Hook command 创建，gorkX 没有补写。 |
| 认证 schema 兼容 | **PASS**：真实清洁 HOME 复核发现旧版 gorkX OAuth 登录写入的 `auth_mode: "oauth"` 会被 Grok Build 1.0.6 拒绝；已改为新登录直接写 `oidc`，并在启动 App-owned Agent 前仅将带 `https://auth.x.ai` issuer 的旧版 App 条目迁移为 `oidc`，不改写不明/第三方 issuer。Rust 单测覆盖 first-party migration 与 third-party fail-closed，认证修复后的真实任务返回 `CLEAN_HOME_TASK_OK`。 |
| 清洁 HOME 真实重开 | **PASS（开发机隔离 HOME）**：从无 App auth.json 的临时 HOME 通过官方 xAI Device Sign-in 完成真实登录，选择一次性 Git 项目，真实任务返回 `CLEAN_HOME_TASK_OK`；退出并重新打开同一 App 包后，账号仍显示已连接，任务卡和返回文本仍可查看。该证据证明 App-owned 登录/持久化/重开链路，不扩大解释为另一台 Mac 的安装验收。 |
| 修复后 Settings 重跑 | **PASS**：修复后二次真实点按生成临时项目 `gorkx-hook-verify-1787474014482984000`；初始 marker 为 `missing`，依次点击“明确授信项目”“重新加载 Hooks”“启动真实任务”，真实消息返回 `HOOK_VERIFICATION_TASK_OK`，状态变为“已确认 marker”，marker 为 `match`。项目由 Settings 删除，文件系统复核为不存在。 |
| ACP 实证 | **PASS**：使用一次性认证副本和正确版本的真实 Grok Build，`verify-grok-hook.mjs --authenticated --no-prompt` 完成控制面、未授信不执行、显式 trust、显式 reload、Hook marker、revoke 和临时项目清理；同一脚本带真实 prompt 的重跑也完成真实任务，并确认任务期间 Hook marker 未被任务正文改写。此前错误版本候选出现的真实 HTTP 426 仅作为失败诊断，不作为最终通过依据。 |
| 失败提示与测试 | **PASS**：`settingsFeedback.ts` 新增 Grok Build 版本过旧/426 的可读提示，`settingsFeedback.test.ts` 覆盖 426 形状；Settings 任务失败后再次只读 marker，若 marker 存在也明确显示“任务失败但观察到 marker，验证仍失败”，不会把 marker 单独升级为成功。既有 `hookAuthoring.test.ts`、Rust 临时项目/marker 安全测试继续纳入 Stage 门禁。 |
| GitHub 发布通道 | **PASS**：通过 GitHub 官方 Device Flow 重新连接 `gh`，`gh auth status` 确认 `linkyang01` 账号与 `repo` / `workflow` scope 可用，仓库解析为 `linkyang01/gorkX`；仓库级 Git 已绕开失效的本机代理，直连 API 可读取 Release。仓库当前没有 Actions 工作流、发布 Secrets 或 Variables；这不是 CLI 未连接，而是尚未配置 Apple 发布凭据。未把 token 写入仓库或验收记录。 |
| 第三方模型真实回复 | **PASS**：安装并启动官方 Ollama `0.32.15`，真实拉取 `qwen2.5:0.5b`；Settings → 模型与提供商 → 本地 Ollama 实际点击“验证并添加”，界面记录“已通过模型响应验证 · 2026/8/23 17:32:22”。随后在一次性 Git 项目中选择该模型并通过真实 gorkX 任务路径取得模型生成回复。小模型回复质量和工具调用意图不作为能力扩张，只证明用户配置的 OpenAI-compatible endpoint 完成真实协议响应与 App 任务调用。 |
| macOS 麦克风真人验收 | **PASS**：由用户真实说话，输入区在“正在听”状态将“验收通过 麦克风真实验收通过”写入可编辑草稿，发送按钮可用；发送前草稿已单独观察。源码终态处理只调用 `setDraft`，没有自动发送；后续发送发生在用户接管 App 后，不把它描述成自动化操作。 |
| x86_64 构建与运行预检 | **PARTIAL / 不关闭原生 Intel 门**：新增 `GORKX_BUILD_TARGET` 后，用锁定源码和七个补丁交叉构建 `x86_64-apple-darwin` 内核，版本 `grok 1.0.6 (19d42e35)`，ACP initialize 通过；Tauri x86_64 `.app` 的主程序、包内内核、许可证与隔离 `GROK_HOME` 校验通过。只启动该精确 x86_64 App，在 Rosetta 下打开一次性 Git 项目并通过本地 Ollama 启动真实任务、取得回复。该证据证明 x86_64 产物可构建和运行，不冒充原生 Intel Mac 安装验收。 |
| 发布门禁与诊断修复 | **PASS**：ad-hoc / 未公证签名及缺少 arm64/x86_64 证据现均为 hard blocker；签名脚本使用绝对 App 路径和唯一临时报表，只在 Developer ID 签名存在时检查 staple；bundle 校验现在拒绝主程序与包内内核架构不匹配。readiness 不再把宿主机架构自动算作验收证据，只有显式且有记录的 `GORKX_ARCH_VERIFIED` 才进入判定，并支持合并两份独立架构证据。用户批准已存在时，失败提示不再误写成“或取得批准”。 |
| 前端 / Rust / 内核门禁 | **PASS**：`npm run typecheck`、`npm run test:stages`（Stage A–G）、`npm run verify:web-bundle`、`cargo check`、完整 `cargo test`（95 passed）、内核 source/patch 校验、锁定 release 构建、无认证 ACP 控制面、源码构建 ACP baseline、`npm run build:app` 和包内版本校验均通过。Vite 仍有既有主 chunk 大于 500 kB warning；`cargo fmt --check` 仍被仓库既有未格式化代码阻断，本轮未混入无关格式化。 |
| 清理 | **PASS**：两个临时 Hook 项目均通过原生 ACP `untrust`，主 App trust store 对两个精确路径均为 `trusted = false`；另一个旧 Hook 临时目录的精确路径不在 trust store。临时 Ollama 模型从 Settings 删除、一次性项目从侧栏移除，Ollama 服务已停止。两处系统临时目录内超过 9.7 GB 的模型、x86 构建缓存、内核副本、arm64 资源备份、验收项目及旧版固定 codesign 报表均按精确路径删除，复核无 `gorkx-*` 残留；Homebrew Ollama 安装、用户账号和其他配置未动。 |
| 发布决定 | **候选通过、公开发布仍被真实门禁拒绝**：以已记录证据设置 `GORKX_REAL_PROMPT_PASSED=1`、`GORKX_THIRD_PARTY_MODEL_PASSED=1`、`GORKX_MICROPHONE_PASSED=1`、`GORKX_ARCH_VERIFIED=arm64`，并按用户发布授权设置 `GORKX_USER_APPROVED_SHIP=1` 后运行 `bash scripts/verify-release-readiness.sh`，仍返回 `NO PUBLIC SHIP`。H2 第三方模型和 H3 麦克风已关闭；剩余阻断仅为另一台干净 Mac 的安装/登录/重开、Developer ID 签名与 Apple 公证、原生 Intel Mac 的安装/项目证据。当前 Keychain 为 `0 valid identities`，仓库也没有对应 GitHub Secrets；本机 Parallels 没有可用 VM。故没有伪造 `GORKX_CLEAN_INSTALL_PASSED` / x86_64 证据，没有创建 tag、Release、DMG 或上传资产。 |

## 2026-08-22 · Hooks 临时项目真实验收闭环实现

本条记录对应源码分支 `agent/grok-build-1.0.6-sync`。本轮只提交源码与本验收记录；
真实 Hook marker 尚未取得通过证据，因此没有创建 tag、GitHub Release、DMG 或上传发布资产。

| 项 | 结果 |
|---|---|
| Settings 安全流程 | **已实现**：Settings → Hooks 创建 OS 临时目录下的全新 Git 项目，写入 App 固定的 `SessionStart` command Hook；创建控制任务后必须显式 `trust`、显式 `reload`，再启动第二个真实任务。marker 只由内核 Hook command 写入，renderer 仅按固定 token 读取；关闭 Settings 或点击清理会撤销临时 trust、停止临时任务、删除临时项目并移除最近项目引用。 |
| 安全边界 | 临时项目名、Hook 文件名、marker 目录、token 和 command 均由 App 固定/校验；不接受用户命令、不访问任意路径、不以 UI 状态或超时伪造成功；missing、pre-existing、mismatch、Hook load error、任务失败均显示失败提示。 |
| 自动测试 | `hookAuthoring.test.ts` 覆盖固定 `SessionStart` JSON、shell quoting、路径/文件名拒绝；`settingsFeedback.test.ts` 覆盖 marker 缺失/不匹配/已存在提示；完整 Rust 单测 **93/93 PASS**，包含临时 Git 项目、严格 marker reader、symlink/非临时目录清理拒绝；`node --check scripts/verify-grok-hook.mjs` **PASS**。 |
| 前端门禁 | `npm run typecheck`、`npm run test:stages`（Stage A–G）、`npm run verify:web-bundle` **PASS**；Vite 仍报告既有主 chunk 大于 500 kB 的 warning。 |
| Rust 门禁 | `cargo check`、`cargo test workspace --lib` **PASS**；`cargo fmt --check` 仍被仓库既有的大量未格式化代码阻断，本轮未把整库无关格式化混入提交。 |
| 内核门禁 | `verify-grok-kernel-source.sh`、`verify-grok-kernel-patches.sh`（0001–0007）**PASS**；`verify-grok-kernel-build.sh` 在获批环境完成 11 分 18 秒 release 构建，版本 `grok 1.0.6 (19d42e35)`，锁定源码 ACP initialize baseline **PASS**；既有无认证 desktop ACP 控制面探针 **PASS**。 |
| 真实 Hook 尝试 | **BLOCKED，不能记为验收通过**：使用 App 登录目录的一次性副本和一次性临时项目启动真实 `grok 1.0.6`；沙箱内首先被认证端点网络限制阻断，获批网络重跑后 `authenticate(cached_token)` 超时，内核日志为 `No auth credentials for cli-chat-proxy`。副本 `auth.json` 的 access token 已于 `2026-08-10` 过期；本次没有观察到 marker，也没有把 `session/new`/UI 状态当作 Hook 执行证据。每次尝试均清理临时项目。 |
| 发布决定 | **未发布**：用户要求的“达到验收就发布”条件尚未满足，当前公开版本仍为 `1.2.0`；待 Settings 真实流程在重新登录/有效额度账号下取得 marker `match`、完成真实任务并留存输出后，再复跑发布门槛并决定是否发布。 |

## 2026-08-21 · Grok Build 1.0.6 内核同步与桌面回归

本条记录对应源码分支 `agent/grok-build-1.0.6-sync`。它是下一版候选的
机器侧证据，不代表已创建 tag、GitHub Release 或 DMG；公开版本仍是
gorkX `1.2.0`。

| 项 | 结果 |
|---|---|
| 上游锁定 | `xai-org/grok-build` 锁定 `19d42e35c07a9c9244f03f6df0c4c353f970d4f9`，上游包版本 `xai-grok-pager-bin 1.0.6`；`kernel/grok-build.lock.toml` 记录 `observed_at = 2026-08-21`、源码修订和许可证/第三方声明 SHA-256。官方源码与提交见 [grok-build](https://github.com/xai-org/grok-build) 与 [同步提交](https://github.com/xai-org/grok-build/commit/19d42e35c07a9c9244f03f6df0c4c353f970d4f9)。 |
| 补丁 0001–0007 | `scripts/verify-grok-kernel-patches.sh vendor/grok-build` **PASS**；旧内核上无法直接应用的 0001、0002、0004、0005 已按 1.0.6 当前源码重做，七个补丁可在临时 worktree 顺序重放。 |
| 锁定源码重建 | `scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok` **PASS**；包内版本 `grok 1.0.6 (19d42e35)`，LICENSE / THIRD-PARTY-NOTICES 校验通过。 |
| ACP 路由回归 | `node scripts/verify-grok-acp.mjs ... --voice-controls --desktop-controls --cloud-controls --billing-controls --session-search --prompt-history --prompt-suggestion --session-bundle --client-fs-write --disable-web-search --model-reload` **PASS**：原生语音 start/stop/shutdown、Goal/command/workflow 桌面动作、hunk/code/Git、云与账单守卫、会话搜索/历史/建议/任务包、模型刷新、客户端文件写能力和禁用 Web Search 均通过无认证控制面探针。该探针不发送模型提示词，也不启动麦克风。 |
| 桌面侧接线 | `store.ts` 的无缓存模型上下文回退更新为 `grok-4.6`；运行时模型目录仍以内核和账号返回值为准，不在 App 内硬编码可用模型。 |
| 桌面停止手势 | Composer 与全局键盘路径均支持单次 `Esc`：菜单/对话框优先关闭，空闲状态不产生请求，运行中的选中任务调用实时 ACP cancel；`desktopPrimaryEntries.test.ts` 已锁定入口存在。 |
| 前端 / Stage / Rust | `cd apps/desktop && npx tsc --noEmit` **PASS**；`npm run test:stages` stage A–G **PASS**；`npm run build` **PASS**；`cd apps/desktop/src-tauri && cargo check` **PASS**；`cargo test` **91 passed**。 |
| App Bundle | `npm run build:app` 与 `scripts/verify-macos-app-bundle.sh apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app` **PASS**；arm64 `.app` 包内版本 `grok 1.0.6 (19d42e35)`，资源、许可证和隔离 `GROK_HOME` 均通过。未生成 DMG；当前开发包仍为 ad-hoc、未公证。 |
| 既有警告 | Stage 测试仍报告 Node 的 `localStorage` experimental warning；Vite 仍报告主 chunk 超过 500 kB。这两项不影响退出码，属于后续性能/测试环境整理项。 |
| 未覆盖边界 | 本轮没有用用户 OAuth 发起真实模型回合、三方模型请求或麦克风采集；这些能力仍需真实账号/设备人工验收，不能以无认证路由 PASS 代替。 |

## 2026-08-10 · Grok Build 上游刷新至 75e73f3

| 项 | 结果 |
|---|---|
| 上游锁定 | `git ls-remote https://github.com/xai-org/grok-build.git HEAD refs/heads/main` 返回 `75e73f3d6ac0350d211f12ae7d57c2c0aad72576`；`kernel/grok-build.lock.toml` 已更新并记录 `observed_at = 2026-08-10`。源码提交说明包含启动/模型预取、沙箱钩子、工作区状态、文本框 Home/End 和仪表盘徽章修复。 |
| 补丁 0001–0007 | `scripts/verify-grok-kernel-patches.sh vendor/grok-build` **PASS**；七个补丁均在新锁定源码上 `git apply --check` 通过。 |
| ACP 路由审计 | 对比 `8a14c91..75e73f3` 的 ACP 相关启动/会话/工作区代码，并用新二进制逐项探测；无认证完整矩阵中 voice、interject/btw、memory/repair/goal/command、workflow、hunk/code/Git、cloud、billing、session search/history/suggestion/bundle、model reload、client FS 和 web-search 开关均 **PASS**。认证控制矩阵中 session、Plan、session info、rename/fork/rewind、模型、Hooks、Worktree、子代理、语音、账单、搜索/历史/任务包也 **PASS**；云环境列表到达 provider 但返回 provider-side `Internal error`。源码字面路由集合为旧版 329 / 新版 329，removed=0、added=0；未发现已接入路由被移除。 |
| 锁定源码重建 | `scripts/verify-grok-kernel-build.sh` **PASS**；临时 worktree 应用七个补丁后 release 构建完成，版本 `grok 1.0.0 (75e73f3)`，LICENSE/THIRD-PARTY-NOTICES 校验通过，源码构建 ACP initialize **PASS**。 |
| App Bundle | `npm run build:app`、`verify-macos-app-bundle.sh` **PASS**；arm64 `.app` 包内版本 `grok 1.0.0 (75e73f3)`，包内与 resources 二进制 SHA-256 均为 `49321f257410f0b14149f9bd95a76cf947480046d0e8d62684e31f826393697d`，许可证和第三方声明齐全。 |
| DMG / 发布资产 | `npx tauri build --bundles dmg` **PASS**；DMG 只读 `hdiutil verify` **PASS**，挂载后 `.app` 的 arm64 主程序/内核、许可证、隔离 `GROK_HOME` 与 `grok 1.0.0 (75e73f3)` **PASS**；签名报告为 `SIGNING_LEVEL=adhoc`、未公证；DMG SHA-256=`b3847d3fcb67d6e947840ca07655271a8d85210d917a0c8d9be78114520dd3e7`。 |
| 前端 / Rust | `npx tsc --noEmit`、`npm run test:stages`（stage A–G）、`npm run build` **PASS**；Vite 仍仅报告主 chunk 超过 500 kB 的既有警告；模型元数据加固与 request-builder 覆盖后 `cargo test` **91 passed**、`cargo check` **PASS**。 |
| 真实认证回合 | 账户菜单触发 OAuth 刷新后，`authenticate(cached_token)` **PASS**；认证 ACP 全矩阵的 session、Plan/profile、session info、rename/fork/repair/rewind、Hooks、Worktree、搜索/历史/任务包、语音和模型刷新 **PASS**；`--authenticated --resource --rewind-execute` 的 resource-link 两轮提示、conversation-only rewind preview/commit/reload **PASS**；新内核真实 read-only explore 子任务 spawn → `running → completed`（本轮输出=`Absent.`）**PASS**。 |
| 强制重新登录 | 账户页“重新登录”、任务失效后的“重新登录”现在显式跳过本机 `~/.grok` 快速同步，启动官方 xAI Device Sign-in；本轮通过正式 `.app` 完成真实 OAuth 授权，回到 gorkX 后显示账户与 28% 周额度。 |
| 第三方请求元数据 | `models_config` 现在将已配置的 `query_params`、静态安全 Header 和环境变量 Header 同时应用到模型目录/连接测试请求；静态 Authorization/API Key/token/query secret 被拒绝，密钥继续只走 Keychain/环境变量；新增安全校验单测 **PASS**。本机仍没有真实第三方凭据，因此 H2 真实回复门槛保持未通过。 |
| 同机空白 HOME 补充验收 | 正式 `.app` 在临时空白 `HOME` 启动；退出预置账号后通过官方 `accounts.x.ai` Device Sign-in 完成登录，选择临时项目，GUI 真实首轮返回 `clean-machine-smoke`，退出再启动后任务和账号均恢复 **PASS**。该环境仍是开发机，只证明 App-owned 数据目录与登录/重开链路，不替代发布要求的干净 Mac H1。 |
| 发布状态 | 用户已明确批准公开发布；已创建 `v1.2.0`、上传 Apple Silicon DMG 并发布 GitHub Release。干净机安装、第三方 endpoint 和麦克风真人验收仍未完成，未将本次发布包装成这些路径已普遍通过。 |

## 2026-08-09 · Grok Build 1.0.0 完整机器验收

| 项 | 结果 |
|---|---|
| 上游锁定 | `kernel/grok-build.lock.toml` 锁定 `8a14c91d88875a831a38b3a066b1683116bcb31c`；`git ls-remote https://github.com/xai-org/grok-build.git HEAD refs/heads/main` 返回同一提交；官方 Changelog 当前最新为 Grok Build `v1.0.0` |
| 补丁 0001–0007 | `scripts/verify-grok-kernel-source.sh vendor/grok-build` 与 `scripts/verify-grok-kernel-patches.sh vendor/grok-build` **PASS**；七个 patch 均在锁定源码上 `git apply --check` 通过 |
| 最新 ACP 路由矩阵 | `verify-grok-acp.mjs` 无认证复跑 `voice`、desktop actions、hunk/code/Git、cloud/billing guards、session search、prompt history/suggestion、session bundle、model reload **PASS**；未发送模型提示词 |
| 锁定源码重建 | `scripts/verify-grok-kernel-build.sh` **PASS**；临时 worktree 应用七个补丁后 release 构建完成，版本 `grok 1.0.0 (8a14c91) [stable]`，并生成上游 LICENSE / THIRD-PARTY-NOTICES；无认证 ACP baseline **PASS** |
| ACP 初始化合同 | 桌面与探针统一使用 `clientType=grok-shell`、1.0 `startupHints`、`auth.terminal=false`、`authenticate _meta.headless=true`、`agent --no-leader stdio`；避免旧 leader 复用和 1.0 entitlement 误判 |
| ACP 认证控制矩阵 | 一次性 App home / 临时 Git 项目：session new/load/info、Plan、rename、fork、repair、rewind points、model reload、voice start/stop/shutdown、desktop actions、Hooks、hunk/code/Git、session search、prompt history/suggestion/bundle、subagent list/get/cancel/spawn guards、client fs capability **PASS**；rename/fork/rewind 使用当前内核实际暴露的 `_x.ai/*` 路由 |
| ACP 真实回合 | `--authenticated --resource --rewind-execute` **PASS**：resource_link 由验证客户端响应 `fs/read_text_file`，两轮模型提示完成；conversation-only rewind preview (`force=false`)、commit (`force=true`) 与 reload **PASS** |
| 真实子任务 | `verify-live-subagent-spawn.mjs` **PASS**：隔离 read-only explore 子任务从 spawn → poll → `completed`，返回短输出 |
| 自定义模型 | 隔离 `[model.gorkx-acp-custom-smoke]` 公告和 `session/set_model` **PASS**；端点固定为 `127.0.0.1:9`，未发送推理请求 |
| 前端 / Rust | `npx tsc --noEmit`、`npm run test:stages`（全部 stage A–G）、`npm run build` **PASS**；`cargo test` **88 passed**、`cargo check` **PASS** |
| App Bundle | `npm run build:app`、`verify-macos-app-bundle.sh` **PASS**；arm64 `.app`，包内 `grok 1.0.0 (8a14c91)`、LICENSE/NOTICE 齐全；包内 ACP initialize 和 authenticated resource-link prompt **PASS**；包内与 resources 二进制 SHA-256 均为 `5473b393f0802c5b30ab5ea9a2e524aeb5dba2e230e7ba6fe1c0c1dcb647a980` |
| Web 构建警告 | Vite 报告主 chunk `610.52 kB` 超过默认 500 kB 提示；生产构建和 `verify-desktop-web-build.sh` 体积/按需加载门禁均 **PASS**，该提示未被伪装成错误或通过调高阈值隐藏 |
| 外部 / 真人门槛 | 干净 Mac 安装登录重开、用户自有第三方 endpoint 真实回复、macOS 麦克风授权转写仍未由机器探针替代；云环境列表 native route 已达 provider，但本账号返回 provider-side `Internal error`，桌面应显示错误而非假造空列表 |
| 发布状态 | 仅完成源码提交、验证和 App-only bundle；未打 tag、未发 GitHub Release、未生成/上传 DMG |

## 2026-08-09 · gorkX App GUI 真实点按复核

> 本节是同一台已登录 macOS 的 App-only 候选包人工走查；它补充机器门禁，
> 不把单机走查扩大解释为干净机发布验收，也不包含麦克风授权或第三方 endpoint。

| 项 | 结果 |
|---|---|
| 构建 | `apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app`；内核 `grok 1.0.0 (8a14c91)` |
| 账户与真实额度 | 账户菜单显示服务器返回的 `已用 16% · 剩 84%`；使用情况页刷新后显示周周期、套餐分项、预付余额与自动充值状态；未估算缺失字段 |
| 模型 | 设置 → 模型与提供商只显示内核实际返回的 `Grok 4.5 · grok-4.5`；第三方区显示 `0 / 建议 2`，没有伪装已连接 |
| 外观 | 设置 → 外观深色预览和完整控件可见，走查截图未出现设置卡片白底；主题、HEX、密度、时间显示均通过按钮/控件进入 |
| 桌面入口 | `+` 菜单真实显示文件、文件夹、截图、网页资料、项目、终端、审阅、规划、探索、单 Agent、记忆、目标、导入任务包和技能等按钮；slash 仅作为专家快捷方式保留 |
| B1 首轮任务 | 通过 GUI 新建任务并发送无敏感短提示；Grok Build 返回 `桌面验收通过。`，消息卡出现复制/导出/分叉，未调用工具 |
| 退出重开 | 退出 gorkX 后重新打开，首轮任务仍出现在最近任务和任务列表中；证明本机持久化与重开恢复链路 |
| 委派入口 | 输入框上方独立快捷操作条的「委派子任务」打开真实引导面板，默认 `只读（推荐）`，角色/权限/工作区和确认按钮可见；GUI 已实际点击启动，进程面板观察到 `running → completed`，并收到 `UI_SUBAGENT_OK`；输入框本体只保留核心控件 |
| 会话快捷操作布局 | 空闲会话最多显示「委派子任务 / 建议下一步」2 个按钮；运行中最多显示「旁问 / 加入当前回合 / 排队到下一轮」3 个按钮；全部位于 composer 上方独立条带，不挤占输入框 |
| 语音 | 输入区显示「语音输入」且默认关闭；本次未触发麦克风 TCC，H3 仍待用户授权后的真人听写 |
| 结论 | B1、B3 GUI 子任务启动/完成、额度/模型/外观/桌面入口、重开恢复通过；H1 干净机、H2 第三方 endpoint、H3 麦克风仍未通过，不发 tag/Release/DMG |

## 2026-08-08 · gorkX 1.2.0 / Grok Build 1.0.0 内核升级候选

| 项 | 结果 |
|---|---|
| 上游锁定 | `xai-org/grok-build` `afbc0fb710320c7add294c2106d447ecc3e3af2e`，版本 `grok 1.0.0`；官方更新说明见 [Grok Build Changelog](https://x.ai/build/changelog) |
| 补丁队列 | `scripts/verify-grok-kernel-patches.sh vendor/grok-build`：0001–0007 **PASS**，均可在干净 worktree 直接应用 |
| 内核构建 | `scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok`：**PASS**；资源版本 `grok 1.0.0 (afbc0fb)`，SHA-256 `a90ec8caeeaa1019e6ea83ce88621578a74f7f476f7d9b86431a07e91b84de7d` |
| ACP 无认证探针 | `verify-grok-acp.mjs`：initialize、原生 voice start/stop/shutdown、desktop actions、billing/auto-topup guards、session search、prompt history/suggestion、session bundle、client fs capability、disable web search、model catalog reload **PASS** |
| ACP 认证态 1.0.0 回归 | 使用 App 登录目录的一次性副本执行 `--authenticated --session-info --session-controls --runtime-controls --subagent-controls --hooks-controls --voice-controls --client-fs-write --disable-web-search --model-reload`：`session/new/load`、Plan、session info、fork、rewind points、Hooks、Worktree、子代理生命周期、语音守卫和模型刷新 **PASS**；未发送模型提示词 |
| ACP 真实回复探针 | 使用同类一次性认证副本执行 `--authenticated --resource`：**未通过**；沙箱内试跑受网络代理限制，放行一次受控网络后请求已真正到达服务端，但返回 `403 Forbidden: Grok Build is coming soon. You don't have access now.`。该结果证明当前账号没有 Grok Build 推理权限，不是本地 ACP 路由问题；不伪造额度或模型成功 |
| 本机 CLI 真实额度/请求 | 本机已安装 `grok 1.0.0 (3cd0d0cbcebe)`；官方 `grok models` 返回唯一可用模型 `grok-4.5`。同一登录下的最小 `grok --single` 请求到达服务端并返回 `403 personal-team-blocked:spending-limit`。官方 `/v1/billing?format=credits` 返回 `creditUsagePercent: 100.0`、`GrokBuild: 7%`、`GrokImagine: 92%`、`GrokChat: 1%`、本周期无 on-demand 余额；gorkX 现在将该错误显示为“额度或订阅限制”，并提供官方使用量入口，不把失败伪装成登录或进程错误 |
| 前端门禁 | `npx tsc --noEmit`、`npm run test:stages`、`npm run build` **PASS**；Vite 仅保留既有大 chunk warning |
| Rust 门禁 | `cargo test` **88 passed**；`cargo check` **PASS** |
| App 包 | `npm run build:app` + `verify-macos-app-bundle.sh` **PASS**；arm64 `.app`（CFBundle `1.2.0`）包含 `grok 1.0.0 (afbc0fb)`、许可证和第三方声明；未生成 DMG、未打 tag、未发 GitHub Release |
| 发布就绪脚本 | `scripts/verify-release-readiness.sh`：候选包 **READY**；公共发布现在还会硬性拦截真实回复、干净机重开、三方模型、麦克风四项真人证据，以及签名/架构/批准条件 |
| 桌面 1.0 适配 | 会话列表消费 `lastTurnSummary`；权限卡保留完整脚本并支持展开/复制；扩展 Skills/Plugins 按名称排序并折叠展示全部项目；计划审批弹窗可在执行前切换内核返回的模型 |

### ACP 逐项兼容性结论

| 路由类别 | 1.0.0 结论 | gorkX 处理 |
|---|---|---|
| 基线 `initialize` / `session/new` / `session/load` / `session/prompt` | 保持 ACP 基线；返回模型目录与会话状态 | 继续使用标准 ACP 生命周期；版本信息改为 1.2.0 |
| 原生语音 `x.ai/voice/*` | 路由仍由内核提供；无认证缺失会话守卫可达 | 继续调用上游 CoreAudio/STT，不另做浏览器语音 |
| 规划与审批 `x.ai/ask_user_question` / `x.ai/exit_plan_mode` | 响应形状兼容；计划审阅可保留完整 Markdown | 桌面弹窗展示原生内容、复制，并提供执行前模型切换 |
| 桌面动作 `x.ai/desktop/*` | 0005 补丁在 1.0.0 新架构重放成功 | 继续复用 Workflow/Goal/command 原生控制面，不重写 Agent 循环 |
| 会话/账单/搜索/任务包/模型目录刷新 | native route + auth/missing-session guards 均通过；`_x.ai/internal/reload_models` 以 1.0.0 实际探针确认 | UI 只显示服务器返回值；配置保存后对运行中的内核发起受控目录刷新；缺字段不估算 |
| 0001–0007 扩展路由 | 全部在干净 worktree apply-check 通过并进入包内二进制 | 对标准/`_x.ai` 兼容拼写按探针结果路由；不把 Method not found 写成成功 |

### 当前仍需真人验收

- 真实 OAuth 会话下的首轮对话、额度/账单字段、三方模型真实请求仍需在账号获得 Grok Build 推理权限后验收；本轮 1.0.0 隔离回复探针已到达服务端但收到 403，没有用测试请求伪造额度。
- macOS 麦克风授权后真实语音转写仍是 H3；ACP 路由本身已通过无采集探针。
- H1 干净机安装、H2 三方 endpoint、GitHub OAuth revoke round-trip 仍未完成。


## 2026-08-01 · 发布 gorkX 1.1.0

| 项 | 结果 |
|---|---|
| 版本 | `1.1.0`（相对 1.0.0：外观 Codex 化 + 设置页深化 + 暗色白底修复） |
| 代码 | `main` @ `f54ae56` + tag **`v1.1.0`** |
| 门禁 | tsc / test:stages / cargo / bundle verify **PASS** |
| 包 | `gorkX.app` + `gorkX_1.1.0_aarch64.dmg` |
| 内核 | `grok 0.2.116 (dd04f39)` |
| 签名 | **adhoc**（未公证；Gatekeeper 可能需「仍要打开」） |
| DMG SHA-256 | `c93f996018f3c8293727af025c2ed9cae3854908f7b7aa50ce72e8b8c0e22734` |
| GitHub Release | https://github.com/linkyang01/gorkX/releases/tag/v1.1.0 |
| 说明 | `docs/RELEASE_NOTES_v1.1.0.md` |

用户明确要求「git 上去，可以发布就发一版」后执行。

---

## 2026-08-01 · ONE_SHOT COMPLETE（全的做 · 一次验证）

> 用户：「全的做，一次性完成，完成的验证」。  
> 摘要：`docs/evidence/one-shot-complete-20260801/SUMMARY.md`。

### 本轮代码

| 项 | 说明 |
|---|---|
| 暗色白底 | 建议卡/子菜单/附件 chip/权限块/表单/hover 等改主题 token |
| 主题守卫 | `findLightSurfaceHardcodes` + `designTokens.test` 禁止组件层浅灰 `background` |
| 主路径矩阵 | `desktopPrimaryEntries` **25** 路径 |
| live subagent 脚本 | 绝对路径解析，避免相对路径 ENOENT |

### 自动门禁

| 门禁 | 结果 |
|---|---|
| tsc / test:stages | PASS（含 25 主路径 + 白底守卫） |
| cargo test | **88** passed |
| patches 0001–0007 | PASS @ dd04f39 |
| ACP desktop+voice（无登录） | PASS |
| ACP 登录副本：session/info、fork、hooks、bundle 守卫、subagent 路由、billing… | PASS |
| **Live 子任务** spawn→poll→**completed** `smoke` | PASS |
| **主 `session/prompt`** 短答 `end_turn` · `grok-4.5` | **PASS**（本账号副本不再 403） |
| build:app + verify-macos-app-bundle | PASS · `gorkX.app` · 内核 0.2.116 |

### 仍阻塞（诚实）

| 项 | 状态 |
|---|---|
| App 内委派 GUI 录像 | 未做 |
| H1 干净机 / H2 endpoint / H3 麦克风 | 未做 |
| tag / 公证 DMG / Release | **未批准** |

**结论：** 定义 A **加强达成**（含 ACP 级 B1 真 prompt + 主题收口）；定义 B 仍待人工与发版批准。

---

## 2026-08-01 · ONE_SHOT「跑完所有」再执行

> 用户再次要求一次性跑完所有。机器可完成部分已连续执行；外部阻塞如实列出。

| 项 | 结果 |
|---|---|
| α | 全绿（tsc/stages/cargo88/patches/ACP/desktop） |
| β | 子任务 **completed**；主 prompt **403** |
| γ | App 进程 gorkx 已拉起；结构 A/B PASS |
| δ | **DMG 已生成** `gorkX_1.0.0_aarch64.dmg` + app bundle 校验 PASS |
| tag/gh release/公证 | **未上传** — 无新版本号与公证材料；本地 DMG 已在 target/release/bundle/dmg/ |

证据目录：`docs/evidence/one-shot-full-20260801-195145/FINAL_EXIT.md`

---

## 2026-08-01 · ONE_SHOT 一条龙（α–δ）

> 触发：用户「一条龙完成，全做了」。计划：`docs/ONE_SHOT_COMPLETION_PLAN.md`。  
> 摘要：`docs/evidence/one-shot-20260801/SUMMARY.md`。

| 批次 | 结果 |
|---|---|
| α 门禁 | tsc / stages / cargo 88 / patches / ACP desktop+voice / build:app / bundle **全绿** |
| β 实机 | 子任务 explore **completed**；主 `session/prompt` **403** |
| γ 清单 | A/B 结构项 PASS；GUI 录像 / H1–H3 **未过** |
| δ 发版 | 候选 `gorkX.app` 有；**无** tag/Release/DMG（无版本句+公证） |

**出口：** 定义 A **达成**；定义 B **未达成**（服务端 Build 主会话 403 + 人工闸门 + 未批 tag）。

---

## 2026-08-01 · 正式完备条（Formal completeness bar）

> 目标：桌面优先映射 + 编码核心可证 + ACP 可达 + 门禁绿 + 诚实 H1/H2/H3 阻塞记录。  
> 差距表：`docs/FORMAL_PARITY_GAP_TABLE.md`。  
> 自动门禁日志（本机 scratch，会话内）：`gates-tsc-stages-cargo-acp-bundle.log`、`acp-desktop.log`、`acp-auth-subagent.log`、`stage-ab.log`、`cargo-test.log`、`live-loop.txt`。

| 门禁 | 结果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run test:stages` | PASS（含 stage-b `desktopPrimaryEntries` 20 路径） |
| `cargo test` | **88 passed** |
| `cargo check` | PASS |
| `verify-grok-kernel-patches` | PASS 0001–0007 @ `dd04f39` |
| ACP `--desktop-controls --voice-controls` | PASS（无模型请求） |
| ACP auth：session/info + subagent list/get/cancel/spawn(缺父拒) + hooks list/reload + worktree list | PASS（App GROK_HOME 副本，临时目录已删） |
| `npm run build:app` + `verify-macos-app-bundle` | PASS · `gorkX.app` 1.0.0 · 包内 `grok 0.2.116 (dd04f39)` · 隔离 GROK_HOME |
| 直播码 B1 / 真对话 | **未验收（服务端 403）** — 2026-08-01 用 App `GROK_HOME` 副本：`authenticate`+`session/new|load` PASS；`--resource` 触发 `session/prompt` 得 **403** `Grok Build is coming soon. You don't have access now.`（见 scratch `live-resource-prompt.log`）。**不得伪造流式**；UI humanize 路径已测 |
| H1 干净安装 | **未验收（阻塞）** — 需无既有 Grok 数据的 macOS 机上：安装 → 登录 → 首任务 → 退出重开 |
| H2 第三方模型真回复 | **未验收（阻塞）** — 用户未提供可授权 endpoint/密钥 |
| H3 语音听写 | **未验收（阻塞）** — 需麦克风 TCC + 真人朗读；ACP 路由已绿 |
| 子任务 GUI 点按 | **未验收** — App 委派按钮→树→停止/Inspect **无录像** |
| 子任务 ACP 真跑（父会话存在） | **通过（2026-08-01）** — App GROK_HOME 副本 + 可丢弃 git 项目：`_x.ai/subagent/spawn` explore/read-only → `status=started` → poll `get` → **`status=completed`**、`output=hello-gorkx`、`toolCalls=1`（scratch `live-spawn-get-poll.log`）。**非** App UI 点按 |
| tag / Release / 公证 DMG | **未做** — 需用户明确批准；当前为 release **候选** 包 |

### 映射抽检（≥15）

见 `FORMAL_PARITY_GAP_TABLE.md` 行 1–22；`desktopPrimaryEntries.test.ts` 锁定 20 个桌面主路径符号。Calendar 等为 Soon，非可点已连接。

### 正式条结论（诚实）

- **达到**本目标定义的正式完备条：桌面优先、编码主路径有 Real/Kernel-wired 接线与自动门禁、缺口与 H1–H3 **书面阻塞**、无 403 绕过、无假连接器。  
- **未达到**「无人工阻塞的全量 Codex P1–P6 / 全 Build 真对话验收」；有 Build 额度与干净机后可升 Real 条目。  
- 不打 tag、不发 Release、不做公证 DMG，除非用户另批。

---

## 2026-08-01 · 错误体验与设置/GitHub/Computer 深化（无模型额度）

> 目标：账号缺 Grok Build 或未做真人点按时，桌面仍诚实、可读、不假重连。  
> 提交线索：`5b46579` … `8970e6c` 及本轮扩展/审阅面板 humanize。

| 范围 | 变更 | 证据类型 | 边界 |
|---|---|---|---|
| Build 403 | stderr 尽早 `markTaskFailed`；不自动重连；运行中心失败行短标题 | 源码 + `chatFormat.test` | **不能绕过服务端 403**；真对话仍需 Build 权限 |
| 进程退出 | 稳定 token `Agent process exited`；UI i18n；过程面板 system 行友好化 | 源码 + 单测 | 旧会话英文 token 仍可识别 |
| Hooks / Computer | 设置成功/失败短文案；急停始终可点 + danger；状态 detail 本地化 | 源码 + `settingsFeedback.test` | 急停/点击真人验收仍待 |
| GitHub 验证连接 | `githubFeedback`：成功 login+最后验证；401/403 撤销提示；审计 test/fail | 源码 + `githubFeedback.test` / stage-d | 需用户 token 才能 live 绿 |
| 设置全局 | catch → `showErr`；成功 `setMsg` 清 err 样式；网络/钥匙串/MCP/模型映射 | 源码 + stage-a | 不伪造连接成功 |
| 扩展 / Review / Inspect | 原始 dump → `settingsErrorMessage` / `githubActionError` | 源码 | 未做 GUI 录像 |
| 其它面板 | Worktree / TaskInfo / Subagent / HookBuilder / Terminal / Kernel / Attachment / Memory / Scheduled 同样 humanize | 源码 | 不伪造成功 |
| 门禁 | `npx tsc --noEmit`；`npm run test:stages`（a–g 全绿） | 本会话通过 | — |
| Rust | `cd apps/desktop/src-tauri && cargo test` | **88 passed**（本会话） | 未 cargo check 之外的签名 |
| ACP 桌面控制 | `node scripts/verify-grok-acp.mjs …/resources/grok --desktop-controls` | 全绿：interject/btw/memory/repair/goal/command/workflow/hunk/code/git 原生守卫 | 无模型请求；`--authenticated` 另跑 |
| 主界面错误 | 账户刷新/登录、提示历史、建议下一步 catch → `settingsErrorMessage` | 源码 | 任务 `error` 仍存原始 token 供 403 识别 |
| 子任务 P0 加固 | `subagentStatus` 归一化；运行中可 Inspect；轮询计时器清理；停止/Inspect humanize（`73ce3aa`） | 源码 + `subagentStatus.test` / stage-b | **非** App UI 真 spawn 录像；仍 Kernel-wired |
| 子任务标签 i18n | 行标题 `Subtask`/`子任务` 随语言；生命周期与 spawn 种子同一格式 | 源码 + 单测 | 旧会话中文前缀仍可 strip |
| 主界面 alert | 用户可见 `alert` 失败走 `settingsErrorMessage` | 源码 | 非替代 toast 体系 |
| 旁问/队列/计划/修复 | follow-up、队列、plan 警告、session repair 系统行 humanize | 源码 | 任务连接失败 error 仍可为原始 token |
| 前端生产构建 | `cd apps/desktop && npm run build` | 通过（本会话） | 非 App bundle / 非 DMG |
| App-only 包 | `cd apps/desktop && npm run build:app` | 通过：`…/bundle/macos/gorkX.app` · CFBundle `1.0.0` | 未签名公证；未 DMG；未 tag |
| Bundle 结构 | `scripts/verify-macos-app-bundle.sh …/gorkX.app` | PASS：arm64 主程序 + 包内 `grok 0.2.116 (dd04f39)` + 隔离 `GROK_HOME` + 许可证 | 不构成干净机 H1 |
| 快捷键目录 | `desktopShortcuts.ts`：App matcher 与 ShortcutsHelp 同源；`desktopShortcuts.test` 锁定 A2 的 ⇧⌘A/B/M/S/P/I | stage-b 通过 | 非 GUI 录像；⌥⌘ 任务切换仍在 App 内联 |
| ⇧⌘B 无会话 | 始终打开委派面板；空状态显示 `subagentSpawnNoTask`（不再静默吞键） | 源码 | 父任务 busy 时仍不打开 |
| 任务信息重连 CTA | 有 sessionId 无 client 时显示重连；`test:stages` + `build:app` 绿（含 spawn/voice 空状态） | 源码 + bundle | — |
| 会话离线条 | 恢复会话无 client 且无 error 时聊天区横幅 + 重连；Fork 禁用时 title 说明需重连 | 源码 | — |
| 任务信息空状态 | 顶栏/⇧⌘I 无会话也打开面板；空卡片说明 + 账户入口；`build:app` 再绿 | 源码 + bundle | 非真 session/info 点按 |
| 执行方案文档 | `NEXT_EXECUTION_PLAN.md` 基线刷新为 2026-08-01 真实进度 | 文档 | 阶段 1 仍未达成 |

### 诚实结论

- P1 代码侧：**Hooks 失败提示、Computer 急停可用性、GitHub 验证往返文案**已落地。  
- P0 子任务：**桌面树/轮询/Inspect 代码闭环加固**；真 spawn 仍需 Build 权限 + 人工点按。  
- **不得**写成 H1–H3 或 B1 真对话已通过；不 tag / 不 Release / 不 DMG。  
- 真人：设置 → Computer 急停一次；设置 → Git → 验证连接（有 token 时）；App 内 A1–A5 与委派子任务点按。

## 2026-08-01 · 桌面委派子任务（`x.ai/subagent/spawn`）阶段 0 收口

| 范围 | 命令或步骤 | 结果 | 边界 |
|---|---|---|---|
| 内核补丁 | `scripts/verify-grok-kernel-patches.sh vendor/grok-build` | 通过：锁定提交 `dd04f397b1d02f2272b092555669dfba1f01bc85`，0001–0007 均可在干净 worktree 顺序应用；`vendor/grok-build` 工作树无已跟踪脏改动 | 未记录的 nested untracked `vendor/grok-build/vendor/` 不参与补丁 apply；构建仍在临时 worktree 中进行 |
| 内核重建 | `scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok`；`resources/grok --version` | 通过：包内资源为 `grok 0.2.116 (dd04f39)`，含 `0007-acp-desktop-subagent-spawn.patch` | 版本号不变；不构成 GitHub Release 或 DMG 发布 |
| ACP spawn 路由（无认证隔离 HOME） | 隔离 `HOME`/`GROK_HOME` 下对包内内核发送 `initialize`，再调用 `x.ai/subagent/spawn` 与 `_x.ai/subagent/spawn`，父会话 ID 故意不存在 | 通过：标准拼写 `x.ai/subagent/spawn` 为 method not found；运行时兼容拼写 `_x.ai/subagent/spawn` 返回 `Invalid params` / `data: "parent session not found"`，未返回 `subagentId`，未排队真实子任务 | 桌面客户端调用 `_x.ai/subagent/spawn`。本探针不创建真实父会话、不发起模型请求；**真实只读/可写子任务执行、审批、完成与 App 重开恢复仍缺认证账号 + 可丢弃项目人工证据** |
| 脚本门禁 | `scripts/verify-grok-acp.mjs … --authenticated --subagent-controls` | 部分：`--subagent-controls` 仍要求 `--authenticated` 与可丢弃目录；空临时认证目录下 `authenticate(cached_token)` 可能超时 | 不得把“路由可达”写成“子任务已跑完”；完整 `--subagent-controls` 绿跑需带有效隔离认证目录 |
| 桌面门禁 | `cd apps/desktop && npx tsc --noEmit && npm run test:stages && npm run build && npm run build:app`；`cd src-tauri && cargo test && cargo check`；`scripts/verify-macos-app-bundle.sh …/gorkX.app` | 通过：TypeScript 无报错；stage 测试全绿；前端生产构建成功；Rust **87** 项单元测试通过；`cargo check` 通过；arm64 App-only bundle 含 `grok 0.2.116 (dd04f39)`、许可证与隔离 `GROK_HOME` | 未签名/公证；未生成 DMG；未打 tag；未发 Release |
| UI / 文档诚实边界 | `+ → Delegate a subtask` / `+ → 委派子任务`；`FEATURES.md` 标为 **Kernel-wired** | 默认只读；共享工作区写/执行需 `window.confirm`；生命周期仍由内核协调器拥有 | 不得宣称 Real 端到端；阶段 2 才做真实闭环 |

### 阶段 0 结论

- 已收口：源码、0007 补丁、内核重建、无认证 spawn 拒绝探针、前端/Rust/App bundle 门禁。
- **未完成（不得写成已验收）**：登录态下真实子任务启动、角色/权限/worktree 实跑、取消与完成恢复。
- 发布动作：本阶段明确不做 tag / Release / DMG。

## 2026-08-01 · 阶段 1 阻断项与阶段 2.1 子任务部分证据

### 阶段 1（H1 / H2 / H3）状态

| 项 | 状态 | 本机证据 | 仍缺 |
|---|---|---|---|
| **H1** 干净 macOS 独立安装 | **未验收（干净机）**；开发机有部分旁证 | App `GROK_HOME` = `~/Library/Application Support/gorkX/grok-home`，与用户 CLI `~/.grok` 路径可区分；App home 含 `auth.json`（mode 600）；正式包 `verify-macos-app-bundle.sh` 确认隔离 `GROK_HOME`；包内内核 `0.2.116 (dd04f39)` | 在无既有 Grok CLI 数据的环境：安装 App → 登录 → 真实项目首任务 → 退出 → 重开恢复同一任务的步骤记录 |
| **H2** 第三方 API / 兼容模型 | **未验收** | 无用户提供的可授权 endpoint/密钥；不得把 `session/set_model` 接受写成真实推理 | 用户明确提供 endpoint + key 后：连接测试 → 模型目录/ID → Keychain 保存 → 任务选中 → 真实回复 → 切回 Grok |
| **H3** macOS 语音 | **未验收（听写）**；路由门禁通过 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --voice-controls`：`_x.ai/voice/start|stop|shutdown` 抵达原生会话守卫，无采集 | 用户允许麦克风后：按钮 → TCC → 流式转写 → 可编辑草稿 → **手动**发送；停止/关窗/拒绝权限 |

**阶段 1 出口：未达成。** 不可形成 Beta 发布候选；不打 tag / 不发 Release / 不做 DMG。

### 认证态 spawn 路由（App 登录副本，非 CLI home）

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 认证 + 子代理控制 | 复制 App `GROK_HOME` 到一次性目录（不使用 `~/.grok`），可丢弃 Git 项目；`GORKX_ACP_TEST_AUTH_DIR` + `GORKX_ACP_TEST_PROJECT_DIR` + `verify-grok-acp.mjs … --authenticated --subagent-controls --session-info` | 通过：`authenticate(cached_token)`、`session/new|load`、`_x.ai/session/info`、`list_running` / `get` / `cancel`、**`_x.ai/subagent/spawn` 对缺失父会话按预期拒绝** | 临时认证副本与项目已删除；不读取 CLI home；不发送主会话模型提示词 |

### 阶段 2.1 部分：真实只读子任务 start / list / cancel

| 范围 | 步骤 | 结果 | 边界 |
|---|---|---|---|
| 真实 spawn | 同上一次性 App 登录副本 + 可丢弃项目；`session/new` 后调用 `_x.ai/subagent/spawn`：`explore` + `capabilityMode=read-only` + `isolation=none`，prompt 仅要求阅读 `README.md` | **通过启动**：返回 `subagentId=019fbb7c-4e5f-7300-b361-d8f932af425e`，`status=started`，`capabilityMode=read-only`，`isolation=none` | 这是内核 ACP 层证据，**不是**桌面 `+ → 委派子任务` UI 点按验收 |
| 运行中可见 | `_x.ai/subagent/list_running` 轮询 | **通过**：约 1s 内观察到 1 个运行中子任务（含上述 id） | 未验证 worktree 隔离路径、未验证写权限确认框 |
| 快照 / 取消 | `_x.ai/subagent/get`（block=false）；`_x.ai/subagent/cancel` | get 返回含 `snapshot`；cancel 返回 `cancelled=true`，`outcome.kind=cancelled` | **未等待模型完成结果**；未做 App 重开恢复；未验证父子任务树 UI；临时目录已删除 |

**诚实结论：** 原生子任务协调器可从桌面 ACP 路由真实启动只读子任务并取消；FEATURES 仍保持 **Kernel-wired**，不得升为 Real，直到 App UI、完成结果、审批与重开恢复有完整证据。

## 2026-08-01 · 阶段 2 深化：worktree 子任务 + Hooks 控制与执行

### 2.1 worktree 隔离子任务（可丢弃项目，App 登录副本）

| 步骤 | 结果 | 边界 |
|---|---|---|
| `_x.ai/subagent/spawn`：`explore` + `read-only` + `isolation=worktree` | 返回 `subagentId=019fbb88-0e7b-7bb1-904b-61b97679b501`，`isolation=worktree` | 非 App UI 点按 |
| `list_running` | 约 1s 内看到子任务；含 `parentSessionId` / `childSessionId` / `subagentType` / 用量字段 | 列表项本身未直接暴露 cwd 字段 |
| `worktree/list` | 出现真实路径：`…/gorkx-p2-auth…/worktrees/…/subagent-019fbb88-…`（位于 App 登录副本 home 下，不在用户项目根） | 证明协调器创建了隔离 worktree |
| `subagent/get` | `status=running` | 未等模型完成 |
| `subagent/cancel` | `cancelled=true` | 临时目录已删 |

### 2.2 Hooks 配置、信任、执行与启停

| 步骤 | 结果 | 边界 |
|---|---|---|
| 项目写入最小 `SessionStart` command Hook（`.grok/hooks/*.json`） | 内核 `hooks/list` 发现：`handlerType=command`，`projectTrusted` 可变为 true | App 只写定义，不执行 |
| `hooks/action` reload / trust | success | — |
| **真实执行** | SessionStart 在会话内写出 marker：`hook-ran-<epoch>` 文件存在 | 证明 **Grok Build 执行** Hook，不是桌面假跑 |
| `hooks/action` remove by path | success | — |
| enable / disable | 内核要求字段 **`hook_name`（snake_case）**；`hookName` camelCase 被拒绝（`missing field hook_name`） | 桌面曾错误发送 camelCase |

**修复：** `AcpClient.manageHooks` 对 enable/disable 编码为 `{ type, hook_name }`，TypeScript API 仍用 `hookName`。复验：disable → `disabled=true`，enable → `disabled=false`，`status=success`。

| 仍缺（不得写成完整闭环） |
|---|
| App 设置页点按信任/启停的人工走查 |
| 失败 Hook 的错误提示 UX |
| 子任务模型完成结果、审批流、App 重开后的父子树恢复 |
| 阶段 1 H1/H2/H3 |

## 2026-08-01 · 阶段 2.3 GitHub 安全收口 + 2.4 Computer 边界

### 2.3 GitHub

| 项 | 证据 | 边界 |
|---|---|---|
| 凭据只在 Keychain | `com.gorkx.github` / `read-token`；不读 `gh` CLI | 本机 Keychain 中存在条目（不打印 secret） |
| 身份实时验证 | `GET /user` 使用 Keychain token → HTTP 200，`login=linkyang01` | 不代表干净机安装 |
| 写前确认 | Settings / Review：`window.confirm` + `githubWriteConfirmSummary` 后才 `create_pull_request` / `create_pr_comment` | 未在本轮创建真实 PR/评论 |
| 断开清理 | `github_disconnect` → `token_delete` + 清除 `github-connector.json` 元数据 | 本轮未故意断开用户现有连接 |
| **新增：权限范围与最后验证时间** | `GithubStatus.scopes` + `lastVerifiedAt`；OAuth 为 `read:user` / `public_repo`；PAT 为 fine-grained 说明；成功 whoami 写入 App Support 元数据；401/403 清除 lastVerified 并提示可能已撤销 | 设置页展示 scopes 与 last verified；**未**做用户在 GitHub 网页主动撤销后的完整人工往返 |
| 单元测试 | `cargo test github`：**7** 通过（含 OAuth scope 列表） | — |

### 2.4 Browser / Computer

| 项 | 证据 | 边界 |
|---|---|---|
| Computer 工具白名单 | MCP 仅：`status` / `screenshot` / `click` / `key` / `type` / `stop`；无 shell/script | `cargo test computer`：**4** 通过 |
| 固定键位 / 坐标 / 文本边界 | unit tests：key map 固定；坐标有界；文本有界并转义 | 本机未授予 Accessibility 时不宣称真实点击结果 |
| 急停租约 | 设计：桌面 emergency stop 取消 lease，MCP 子进程拒绝后续动作 | 需已启用控制时的人工急停验收 |
| 非原生 ACP | FEATURES 诚实：App-owned MCP 桥 ≠ Grok Build 原生 Computer ACP | 0.2.116 无原生 Computer ACP |
| Playwright Browser | 包版本钉死 `@playwright/mcp@0.0.78`；允许源 origin 校验 unit 测试 | 未做完整浏览器任务内动作日志/截图流人工验收 |

**阶段 2 仍缺：** GitHub 网页撤销完整往返；Computer 授权下真实点击/截图；Browser 任务内可复盘日志。阶段 1 出口仍未达成。

## 2026-08-01 · 子任务完成闭环 + 任务树 Inspect 修复 + Computer 权限旁证

### 只读 worktree 子任务跑到 completed

| 步骤 | 结果 | 边界 |
|---|---|---|
| App 登录副本 + 可丢弃 Git 项目 | `authenticate` / `session/new` 成功 | 非干净机 H1 |
| spawn explore + read-only + worktree | `subagentId=019fbb9f-d509-7fd3-a482-512680d7b54a` | ACP 层，非 App UI 点按 |
| 轮询 `subagent/get` | 先 `status=running`（turnCount=1, tokensUsed≈883），约数秒后 **`status=completed`** | 真实模型回合，消耗额度 |
| 完成快照字段 | 含 `output`（string，长度 72）、`toolCalls`、`turns`、**`worktreePath`**、`parentSessionId`/`childSessionId` | 未在证据中粘贴完整模型输出正文 |
| `list_running` | 完成后 **不再**包含该 id | — |
| 通知 | 过程中有 `session/update`、`_x.ai/session_notification` | 未把通知解析写成 UI 验收 |

### 任务树 UI bugfix

内核状态为 **`completed` / `cancelled` / `failed`**（带 -ed）时，旧正则 `^(complete\|…)\b` 把 Inspect 按钮判为不可用。

- 修复：`SubagentTree` 使用 stem 匹配 `complet|cancel|fail|…`，`completed`/`cancelled`/`failed` 可 Inspect；`running` 仍可 Stop。
- 验证：本地布尔表对上述状态组合通过；未做 App 内人工点按。

### Computer Accessibility 旁证（本机）

| 探测 | 结果 | 边界 |
|---|---|---|
| `System Events` → `UI elements enabled` | **true** | 与 gorkX `check_accessibility()` 同源 osascript；**不等于**已启用 Computer 租约或完成真实点击 |
| 控制租约 | 未在本轮写入 lease / 未调用 click/type | 急停与真实截图仍待人工 |

**阶段 1 出口仍未达成。** 不打 tag / 不发 Release / 不做 DMG。

## 2026-08-01 · 验收清单 A+B 执行（按建议）

| 范围 | 结果 | 边界 |
|---|---|---|
| A1–A5 入口 | **源码接线 19/19 检查通过**；`tsc` + `test:stages` 通过 | 未启动 GUI 真人点按 |
| 语音路由 | `--voice-controls`：start/stop/shutdown 守卫通过 | 无麦克风采集 |
| 桌面 ACP | `--desktop-controls` 全绿 | 无模型请求 |
| B 认证 | App 登录副本：`authenticate`、`session/info`（无 token 字段）、subagent list/get/cancel/spawn（缺父拒） | 副本已删 |
| B1 真对话 | **未做** | 需 App 人工 |
| B2–B3 App UI | **未做点按**；ACP 与源码支持已有 | 见 `DESKTOP_ACCEPTANCE_CHECKLIST.md` 记录 |
| 发布 | 不构成 H1–H3 通过；不 tag/Release/DMG | — |

详见 `docs/DESKTOP_ACCEPTANCE_CHECKLIST.md` 文末「2026-08-01 执行记录」。

## 2026-08-01 · 进程/记忆/Worktree 空状态可操作

| 面板 | 变更 | 边界 |
|---|---|---|
| Process 空 | 说明 + **委派子任务**按钮（会话可用时） | 需活动会话 |
| Memory 空 | **保存本地笔记** / 可选 Flush | — |
| Worktree 空 | **创建永久 worktree** + 刷新 | 需项目路径 |
| tsc | 通过 | — |

## 2026-08-01 · 快捷键同步桌面入口

| 区域 | 变更 | 边界 |
|---|---|---|
| 全局快捷键 | ⇧⌘M 记忆、⇧⌘A 待处理、⇧⌘S 计划、⇧⌘B 委派、**⇧⌘P 进程**、**⇧⌘I 任务信息** | 与顶栏/Composer 按钮同一入口 |
| ShortcutsHelp | 中英文说明；标明 slash 非主路径 | `⌘/` 打开 |
| 人工清单 | `docs/DESKTOP_ACCEPTANCE_CHECKLIST.md` | 须真人点按后写 VALIDATION 结果 |
| tsc | 通过 | 未做人工快捷键录像 |

## 2026-08-01 · 待处理决策顶栏 + 计划任务空状态

| 区域 | 变更 | 边界 |
|---|---|---|
| 顶栏 | **待处理**（!）按钮常驻；有队列时 badge + attention 样式 | 真实 ACP 队列，不造假 |
| 跨任务 | 非当前任务的审批入队时自动打开收件箱 | 当前任务仍可用内联决策卡 |
| 顶栏 | **计划任务**图标 | 与侧栏同源 |
| 计划任务空状态 | 新建 + 使用第一条建议按钮 | — |
| 收件箱空状态 | 说明「按钮处理，不用命令」 | — |
| tsc | 通过 | 未做人工点按录像 |

## 2026-08-01 · 顶栏扩展/记忆 + Composer 委派快捷钮

| 区域 | 变更 | 边界 |
|---|---|---|
| 顶栏 | 扩展、记忆图标按钮（侧栏折叠时仍可进） | 与侧栏同一打开逻辑 |
| 侧栏 | 「插件」文案改为「扩展」；tooltip 说明全是按钮 | — |
| Composer（活动会话） | **委派子任务** 快捷钮 → 打开引导面板 | 需已连接任务且非 busy |
| tsc | 通过 | 未做人工点按录像 |

## 2026-08-01 · 扩展空状态与任务信息一键入口

| 区域 | 变更 | 边界 |
|---|---|---|
| Skills 空状态 | 引导打开 Skills 目录 + 刷新；文案改为 App GROK_HOME，不提 CLI `~/.grok` | 不扫描用户 CLI home |
| Skills 列表 | 标题用技能名，不主推 `/name`；**运行**按钮为主 | slash 仍专家兼容 |
| MCP 空状态 | 一键连接 Chrome MCP + 刷新 | 需 Chrome/运行时 |
| Plugins 空状态 | 跳转市场页签 | — |
| 市场空状态 | 添加来源提示 | — |
| Chrome 栏 | 活动会话可点 **任务信息** 按钮 | 无会话时禁用 |
| tsc | 通过 | 未做人工点按录像 |

## 2026-08-01 · 语音 / Hooks / Computer 操作引导

| 区域 | 变更 | 边界 |
|---|---|---|
| 语音 | 错误映射为短文案（拒绝/无麦/无会话/不支持）；无任务时提示；按钮 title 说明「只写草稿不自动发送」 | **H3 听写仍待麦克风人工验收** |
| Hooks | 信任/重载/启停/增删成功短提示；loadErrors 全文展示；接线错误友好说明 | 非替代真实 Hook 执行验收 |
| Computer | 进入设置节自动检查权限；四步按钮清单（权限→启用→动作→急停） | **未在本轮做真实点击** |
| tsc | 通过 | — |

## 2026-08-01 · 委派子任务桌面闭环增强

| 变更 | 结果 | 边界 |
|---|---|---|
| 启动后 Process 树 | `onStarted` 立即 `appendOrMerge` 为 `toolKind=subagent` / `running`，并打开进程面板 | 不依赖 lifecycle 事件才显示 Stop |
| 进度 | 有界轮询 `getSubagent`（2.5s × 最多 120 次）更新 completed/cancelled/failed | 非第二套 Agent 循环；内核仍拥有执行 |
| Inspect | 打开进程面板；展示 status、output、worktreePath；同步树状态 | 需活动会话 |
| Stop | cancel 成功后立即标 `cancelled` | 真取消仍由内核执行 |
| tsc | 通过 | 未做本机 App 人工点按录像 |

## 2026-08-01 · Slash 选择全面路由到桌面控件

| 变更 | 结果 | 边界 |
|---|---|---|
| `applySlashPick` | 已知 Grok 能力（compact、review、memory、goal、loop、imagine、fork/rewind、task info、worktree、模型设置、任务搜索等）**打开对应面板/表单/动作**，清空输入框 | 不把 `/command` 留在 composer 当主路径 |
| 广告中的未知引擎命令 | 走 `openEngineAction` 引导表单 + `_x.ai/desktop/command` | 仍非专用 UI，但是按键表单而非手写 slash |
| 完全未知 token | 才 `insertSlash` 专家兼容 | 不宣称这些是产品主路径 |
| 文档 | 新增 `docs/DESKTOP_ALIGNMENT_PLAN.md` 对齐清单 | 阶段 1 H1/H2/H3 仍未验收 |

`npx tsc --noEmit` 通过。未做全量 UI 人工点按。

## 2026-08-01 · 子任务重连恢复加固 + H1 包隔离复验 + 阶段 3 边界

### 重连恢复（代码）

`reconcileRunningSubagents` 在 `list_running` 之外，对本地仍显示 `running` 但引擎列表已不存在的子任务，额外调用 `getSubagent`：

| 引擎快照 | 桌面结果 |
|---|---|
| `completed` / done / success | 行状态 → `completed`（可 Inspect） |
| cancel* | → `cancelled` |
| fail / error | → `failed` |
| 仍 running / get 失败 | → `unverified after reconnect` |
| 列表中仍有 | 保持 live `running · …` 并补行 |

TypeScript / stage 测试通过。**未**做真实「App 退出 → 子任务跑完 → 重开」人工往返（需登录 UI）。

### H1 旁证（非干净机）

`scripts/verify-macos-app-bundle.sh …/gorkX.app` 复验通过：arm64、包内 `grok 0.2.116 (dd04f39)`、隔离 `GROK_HOME`、许可证。  
**不等于**干净 Mac 安装→登录→首任务→退出重开。

### 阶段 3 连接器边界（审计，不扩假能力）

| 连接器 | 目录状态 | 本轮 |
|---|---|---|
| GitHub | `real`：OAuth Device Flow、Keychain、scopes/lastVerified、写前 confirm | 已有证据；网页撤销往返仍缺 |
| Calendar / Slack / 飞书 / Notion / Drive | `soon`：目录声明 scopes，**无**官方授权闭环 | 保持 Soon，不伪装已连接 |
| 第三方 API 模型 | 设置可配；真推理需用户 endpoint | **H2 未验收** |

原则：无官方授权链的服务不得显示已连接；API Key/PAT 仅高级入口。

## 2026-07-31 · Grok Build v0.2.116 最新锁定提交复核

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 上游源码与补丁 | `scripts/verify-grok-kernel-source.sh vendor/grok-build`；`scripts/verify-grok-kernel-patches.sh vendor/grok-build` | 通过：锁定提交 `dd04f397b1d02f2272b092555669dfba1f01bc85`（Grok Build 0.2.116），0001–0006 均可在干净 worktree 顺序应用 | `vendor/grok-build` 为本地忽略的构建输入；不把上游源码复制进 gorkX 仓库 |
| 最新内核编译 | `scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok` | 通过：完整补丁组合可编译，包内资源为 `grok 0.2.116 (dd04f39)`；许可证与第三方声明哈希与锁文件一致 | 未替代 macOS 签名、公证和全新机器安装验收 |
| ACP 运行时 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --desktop-controls --billing-controls --session-search --prompt-history --prompt-suggestion --session-bundle` | 通过：包内 `grok 0.2.116 (dd04f39)` 完成 ACP initialize、桌面动作、账单、会话搜索、提示历史、建议和任务包守卫探针 | 这是无认证能力门禁；真实登录、额度、模型回复和麦克风听写仍需人工验收 |
| 账单周期字段 | Rust `store` 账单解析测试；前端 `billing.test.ts` | 通过：保留服务端 `currentPeriod.type`（周/月）及 `start/end`；百分比 `0` 仍按真实 `0%` 展示，缺失字段不做本地估算 | 当前账户若未返回 `creditUsagePercent`，仍需打开官方已登录使用量页查看订阅额度 |
| 三方模型连接 UX | `Settings → Models & providers → Verify and add`；`npx tsc --noEmit`；`npm run test:stages`；`npm run build` | 通过代码与前端门禁：先发送一次真实协议响应，只有成功才写入 App 引擎配置；失败只保留非秘密验证记录，不保存为已连接 | 本机当前没有第三方凭据或 Ollama，真实 provider 回复仍是发布阻断门槛，不能用 UI 测试替代 |
| 计划审批桌面化 | `Plan approval → Copy plan`；`npx tsc --noEmit`；`npm run test:stages`；`npm run build` | 通过：计划审批卡复制完整引擎 Markdown 到本地剪贴板，不改变批准/修改/退出状态，也不发送模型请求 | 真实计划审批仍需登录任务触发；本门禁只验证前端编译和无副作用代码路径 |
| App-only 包 | `cd apps/desktop && npm run build:app`；`scripts/verify-macos-app-bundle.sh …/gorkX.app` | 通过：arm64 App-only 包已包含 `grok 0.2.116 (dd04f39)`、许可证、NOTICE 与隔离 `GROK_HOME` | 未生成 DMG、未签名/公证，也不替代干净 Mac 安装验收 |
| 内核更新检查 | Settings → Updates → Check for updates；后端固定白名单 `grok update --check --json` | 通过源码审阅与 Rust 白名单测试：桌面现在读取 Grok Build 原生 JSON 的当前/最新版本、频道和更新状态，能够区分网络失败；仅报告，不允许运行时替换 App 自带的源码锁定内核 | 当前网络/账户能否取得上游频道结果由 Grok Build 更新服务决定；在服务返回新版本时仍需开发者重新锁源、补丁、构建和 ACP 回归后更新 gorkX |
| 原生语音适配 | ACP `_x.ai/voice/start|stop|shutdown` 路由编译并保留，沿用 Grok Build 自带低内存 macOS voice pipeline | 通过：语音适配在 0.2.116 上编译并进入包内资源；桌面快捷键设置继续控制 gorkX 窗口内的原生语音入口 | 本次不触发麦克风 TCC、不采集或上传音频；真实转写仍需用户授权后的 macOS 验收 |

| 会话时间线 | `+ → 会话时间线`；`npx tsc --noEmit`；`npm run test:stages`；`npm run build` | 通过：面板索引当前已挂载的用户消息、Grok 回复、计划、工作流和计划任务；点击后只滚动到对应本地 DOM 位置，不发送模型请求、不改写会话 | 只导航当前已加载的会话；跨任务搜索仍使用任务搜索面板，内核历史不会被伪装成本地时间线 |

### v0.2.116 桌面化审计

官方 changelog 的 `/undo` 是 `/rewind` 的内核别名，gorkX 已将它加入 `+` 菜单和会话 slash 选择；两条路径都进入同一套“选择检查点 → 非写入预览 → 冲突时二次确认 → 提交”的安全流程。串流 JSON 输出和最小/全屏 slash 隐藏属于 Grok Build CLI/TUI 行为；gorkX 的 ACP 会话已经持续接收结构化工具、状态和用量更新，因此不重复做终端专属开关。

## 2026-07-31 · 原生提示历史与下一步建议复核

| 范围 | 路由/步骤 | 结果 | 边界 |
|---|---|---|---|
| 持久提示历史 | `+ → 最近提问`；`_x.ai/prompt_history { cwd }` | 通过：桌面合并当前任务与当前项目的 Grok Build 历史，边界化、去重后只回填输入框；隔离 ACP 返回合法空列表 | 不导入原始 transcript，也不把历史当作额度 |
| 下一步建议 | Composer → `建议下一步`；`_x.ai/suggestPrompt { sessionId, generation }` | 通过：按钮仅在用户点击时调用；隔离 ACP 的缺失会话守卫返回 `suggestion: null`，纯解析测试通过 | 真实建议是模型调用，可能消耗额度；建议永不自动发送，需用户插入/编辑/发送 |

## 2026-07-31 · 原生可恢复任务包复核

| 范围 | 路由/步骤 | 结果 | 边界 |
|---|---|---|---|
| 任务包格式 | `sessionBundle.test.ts`；`createSessionBundle` / `parseSessionBundleText` / `serializeSessionBundle` | 通过：版本、会话 ID、项目路径、summary 列、更新数量、单条更新大小和总文件大小均有边界；序列化往返、版本错误和超大更新均有纯测试 | 本地文件仍可能包含完整任务内容，导出和导入均必须经过隐私提示与用户选择 |
| 原生会话读取 | `_x.ai/session/state`、`_x.ai/session/updates { offset, limit }`；`verify-grok-acp.mjs --session-bundle` | 通过：锁定 Grok Build 0.2.112 对缺失会话返回合法 state 守卫，updates 返回分页空结果；桌面分页最多 100,000 条更新 | 未用用户主目录读取真实任务；真实已认证导出需人工确认内容边界 |
| 原生会话恢复 | `_x.ai/session/import`；`verify-grok-acp.mjs --session-bundle` | 通过：缺少 summary 的无效包在内核原生校验处被拒绝；桌面导入要求 JSON 文件、目标项目和二次确认，成功后用正常 `session/load` 重连 | 探针不写入会话；跨设备真实导出→导入仍需用户登录后手动验收，不把路由守卫写成完整恢复成功 |

## 2026-07-31 · 原生提示队列复核

| 范围 | 命令或证据 | 结果 | 边界 |
|---|---|---|---|
| 队列状态解析 | `cd apps/desktop && npm run test:stage-a`；`promptQueue.test.ts` | 通过：`x.ai/queue/changed` 的多项条目、位置排序、版本、运行中提示和组合文本均做有界解析；重复 ID、畸形条目和超限输入被拒绝或丢弃 | 纯解析门禁不证明用户账号已排队或模型已执行；真实队列需要登录后的运行中任务 |
| 桌面队列接线 | `AcpClient` 的 `x.ai/queue/changed` 监听与 `x.ai/queue/edit|remove|reorder|clear|interject` 通知；运行中 composer 原生队列卡片 | 通过源码与 TypeScript 门禁：普通文本排队走 `session/prompt`，队列卡片的编辑、删除、重排、清空、立即插入均发送真实 Grok Build 路由；状态按 sessionId 隔离 | 当前不把附件伪装成原生队列内容；附件仍走下一轮本地回退。真实账号下的多项排队、版本冲突和立即插入仍需人工点按验收 |

## 2026-07-31 · 桌面动作原生 ACP 化复核

| 范围 | 路由/步骤 | 结果 | 边界 |
|---|---|---|---|
| 运行中旁问、插入与记忆提炼 | 锁定 Grok Build 0.2.112；`_x.ai/btw`、`_x.ai/interject`、`_x.ai/memory/flush` | 通过：桌面按钮分别调用真实侧问、运行中插入和内核记忆 flush 路由；`scripts/verify-grok-acp.mjs --desktop-controls` 对所有路由完成无模型请求的原生 session guard 探测。 | 真实模型侧问与运行中安全点注入仍需登录后人工点按验收；带附件的插入暂回退到下一轮队列。 |
| 工作流、Goal 与通用桌面动作 | 锁定 Grok Build 0.2.116 + `0005-acp-desktop-actions.patch`；`_x.ai/desktop/workflow/launch`、`_x.ai/desktop/workflow/manage`、`_x.ai/desktop/goal`、`_x.ai/desktop/command` | 通过编译级验证：工作流入口复用现有 WorkflowManager，桌面工作流卡片已提供真实运行、暂停/继续、停止、保存按钮；停止/保存由 UI 明确确认后调用原生 manage 路由。Goal 入口复用现有 prompt/Goal orchestrator，通用入口仅把已存在的 Grok Build 命令解析包在结构化 ACP 请求内；桌面动作的 synthetic prompt 回显隐藏，用户会话显示由 gorkX 负责。 | 本轮已通过 `cargo check -p xai-grok-shell`、补丁 series apply-check；真实已认证账户下的工作流执行时间、停止取消结果和项目保存结果仍需人工点按验收，不把“路由可达”写成“任务已完成”。 |
| 损坏会话修复 | 认证态 `--session-controls` 追加 `_x.ai/session/repair {dryRun:true}`；错误面板的预览/确认/修复入口 | 通过：当前 0.2.112 真实路由返回结构化 dry-run 报告；桌面只在工具配对/历史损坏错误上显示修复按钮，并在写入前展示修复计数、要求明确确认。 | 本次探针使用干净会话，不修改任何历史；真实损坏会话的恢复仍需在用户确认后人工验收。 |

| 范围 | 命令或步骤 | 结果 | 边界 |
|---|---|---|---|
| Feedback 桌面入口 | `+` 菜单 → “发送反馈”；`AcpClient.sendFeedback()` → `_x.ai/feedback` | 通过：按钮不再把 `/feedback ...` 当作会话提示发送，改为 Grok Build 原生反馈扩展；提交成功后只在本地会话显示确认，不污染模型对话 | 反馈是否上报到远端由 Grok Build 账户/反馈配置决定；本次未伪造反馈内容或远端统计 |
| Recap 桌面入口 | `+` 菜单 → “总结本次会话”；`AcpClient.requestRecap()` → `_x.ai/recap`；实际包内二进制缺失会话探针 | 通过：参数按 0.2.112 的 `sessionId` 契约发送，路由抵达真实会话守卫；异步 `session_recap` / `session_recap_unavailable` 被桌面解析并显示在当前会话 | 回顾是内核异步模型调用；未认证/无真实会话探针不发送模型请求，真实摘要质量仍属于账号和模型行为 |
| 桌面回归 | `cd apps/desktop && npx tsc --noEmit && npm run test:stages && npm run build`；`cd apps/desktop/src-tauri && cargo test && cargo check`；`scripts/verify-grok-kernel-patches.sh`；无认证 ACP initialize | 通过：前端、80 项 Rust 测试、内核补丁 series、包内 ACP initialize 均通过 | 未生成新 DMG、未打 tag、未发布；仅更新源码与证据台账 |

## 2026-07-31 · Review 代理变更审阅复核

| 范围 | 路由/步骤 | 结果 | 边界 |
|---|---|---|---|
| Hunk Tracker 能力声明 | ACP initialize 的 clientCapabilities.meta.x.ai/hunkTracker = { mode: agent_only } | 通过源码与包内内核 0.2.112 扩展复核；gorkX 不从 Git 时间戳推断代理归属 | 只跟踪内核登记的 agent hunks；外部修改不会被误标成代理变更 |
| Review 文件摘要 | Review → Agent changes → x.ai/hunk-tracker/get-files（首选 _x.ai 兼容路由） | 已接入真实 ACP 调用，展示路径、变更块数、增删行数和暂存状态；无能力或旧内核时隐藏页签 | 认证态一次性 --hunk-controls 探针需使用明确的隔离 GROK_HOME 与项目目录；本次未用用户主目录做破坏性测试 |
| 接受/撤销 | Review → Agent changes → “全部接受/全部撤销” → 明确确认 → x.ai/hunk-tracker/all-action | 已接入原生内核动作；接受写入新的 tracker baseline，撤销由内核恢复旧内容；运行中任务禁用按钮 | 真实文件写入仍需用户在登录后的临时项目人工点按验收；gorkX 不提供假装可恢复的本地回滚 |

## 2026-07-26 · 受控内核 0.2.112 与成果中心回归

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 当前受控内核 | `apps/desktop/src-tauri/resources/grok --version` | 通过：当前应用资源为 `grok 0.2.112 (47348d1)` | 版本号不替代登录、实际模型回复或 macOS 安装验收 |
| 正式安装的数据隔离 | `paths::grok_home` 仅在 debug 构建接受 `GROK_HOME` / `GORKX_GROK_HOME` / 系统 CLI home 覆盖；`cargo test && cargo check --release`；`npm run build:app` 后运行 `verify-macos-app-bundle.sh` | 通过：正式构建始终将 Grok 认证、会话与配置置于 `~/Library/Application Support/gorkX/grok-home`，不会继承用户 CLI 的 `~/.grok` 或启动环境指定的外部数据目录；重建 App 的包内内核、许可证和隔离 `GROK_HOME` 也通过，版本 `0.2.112 (47348d1)`。 | 证明发行包的数据归属与包结构，不替代全新 macOS 的网页登录、真实对话和退出重开人工闭环。 |
| 内核 HOME 发现隔离 | 先以仅隔离 `GROK_HOME` 运行包内 `grok inspect --json`，再以一次性 `HOME` + `GROK_HOME` 运行同一命令；`paths::tests::engine_child_uses_only_app_owned_home_locations` | 通过：前者实际发现用户 `~/.agents/skills`，证明仅设置 `GROK_HOME` 不足；后者 `skills` 为空。gorkX 现为每个 Grok Build 子进程设置 App-owned `HOME`，并由第 65 项 Rust 测试锁定该环境。 | 子进程仍可通过受控 PATH 调用系统开发工具；这不是读取用户的 Grok/Agent 配置。 |
| Computer Hub 桌面入口 | 包内 `grok workspace --help`、`start/status/pause --help`；在隔离未登录 HOME 中运行 `workspace status --json`；gorkX 固定命令白名单测试 | 通过：0.2.112 实际提供 workspace start / pause / resume / stop / restart / status，且命令受本地 `GROK_WORKSPACE_COMMAND=1` 与服务端账户开关双重控制。gorkX 仅提供状态读取和当前选中项目的固定动作；开始、恢复、暂停、断开均先要求本地确认。 | 隔离未登录状态返回“无法加载设置”，故本轮不宣称已有可用 Hub 或远端电脑控制；真实账号是否获服务端开启及 Hub 的实际操作仍待人工验收。 |
| 前台 Computer 控制与 MCP 桥接 | Rust `computer` / `computer_mcp` 单元测试；MCP `initialize`、`tools/list`、`tools/call` 协议实测；`computer_accessibility_status` / `computer_control_set_enabled` / `computer_control_emergency_stop`；设置页注册与固定动作 | 通过：动作只经 `/usr/bin/osascript` 的固定脚本模板执行，启用前必须获得 macOS Accessibility 权限并确认；App 自带 MCP 只注册固定的截图、点击、按键、文字和急停工具；跨进程租约让急停后续调用失败；不接受模型或任务传入的 AppleScript。 | 当前环境未授予 gorkX 辅助功能权限，因此未宣称一次真实点击/按键结果；仍需在已授权 Mac 上人工验收 MCP 工具发现、截图和前台动作。Grok Build 0.2.116 的原生 `grok-computer` 仍是文件/终端工具集，MCP 桥接不等同于原生 Computer ACP。 |
| 托管配置预览与受控安装 | 包内 `grok setup --help`；`grok_admin` 固定白名单与前端环境面板 | 通过：0.2.112 的 `setup --json` 明确声明只打印获取的配置、不写入内核 home。gorkX 必须先成功预览才启用安装按钮，安装前有第二次本地确认，且后端只接受精确的 `setup` 或 `setup --json`；没有任意参数入口。 | 未使用真实账户发起配置拉取或安装；远端服务的可用性、返回内容和安装后的实际效果仍需要登录后的人工阅读。 |
| GitHub 浏览器授权与连接测试 | 设置 → Git → “连接 GitHub” → GitHub 官方 Device Flow → “验证连接” | 通过：用户在 GitHub 网页确认后，gorkX 自动完成 Device Flow、将授权保存到 macOS Keychain，并以账号 `linkyang01` 成功完成 GitHub API 连接验证。 | 未读取或写入任何仓库；公开仓库的 PR / Checks / 评论读取、远端写入逐次确认、断开和 GitHub 侧撤销仍是独立验收项。 |
| GitHub 当前仓库 PR 只读 | 选择 `/Users/link/projects/gorkX` → Review → 远端 → “读取开放 PR” | 通过：gorkX 从当前 `origin` 解析 GitHub 仓库并实际读取开放 PR，返回“没有开放的 PR”。未发起任何远端写操作。 | 当前仓库没有 PR，故 Checks 与评论详情未被调用；需在有开放 PR 的公开测试仓库继续验证详情读取和逐次确认的写操作。 |
| GitHub 公开 PR 详情只读 | 一次性 Git fixture 的 `origin=https://github.com/microsoft/vscode.git` → Review → 远端 → “读取开放 PR” → 对同一开放 PR 分别点“读取检查”和“读取评论” | 通过：实际读取到开放 PR 列表；Checks 返回具体 CI 状态（含 success、in_progress 与 failure）；评论读取成功并如实显示该 PR“没有返回讨论或审阅评论”。未创建评论、PR 或远端分支。fixture 已删除。 | 证明公开仓库 PR、Checks 与评论详情的按需只读链路；断开本地 Keychain 凭据、GitHub 侧撤销和每次远端写入的确认闭环仍未验收。 |
| 真实 ACP 对话与两步回退 | 在隔离的 App 登录副本和公开 Git 项目副本中运行：`verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --resource --rewind-execute` | 通过：包内 `grok 0.2.112 (47348d1)` 完成 cached-token 认证、session new/load、真实本地资源附件请求、第二轮模型请求；`conversation_only` 的 `force=false` 预览无冲突，随后经显式 `force=true` 成功提交并可重载同一会话；Hooks、Worktree list、子代理 list_running 控制路由也通过 | 仅使用一次性认证副本和临时公开项目；不等同于干净 Mac 安装、真实麦克风听写、真实子代理委派或第三方 Provider 回答。认证副本与项目副本在验收后删除。 |
| 原生会话重命名 | 在一次性 App 登录副本和公开 Git 项目副本中运行：`verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --session-controls` | 通过：包内内核接受 `_x.ai/session/rename`，为一次性 session 写入标题并返回成功；同次验证 durable fork、检查点列表、Hooks、Worktree list、子代理 list_running。桌面侧优先标准路由，只在 `Method not found` 时兼容该运行时路由。 | 临时认证与项目副本均在测试后删除；离线任务的本地标题仍是明确的持久化回退，不把兼容路由扩大为远端协作验收。 |
| 桌面回退确认语义 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle && npm run build:app`；`verify-macos-app-bundle.sh …/gorkX.app` | 通过：桌面端把内核 `force=false` 正确解释为无写入预览；无冲突时由已确认的恢复动作提交 `force=true`，冲突时列出文件并要求第二次勾选确认。前端生产包、App-only bundle 和包内内核/许可证检查均通过 | 本项验证桌面协议调用和打包，不替代真实项目中“外部修改冲突”的人工交互验收。 |
| 无认证 ACP / 安全启动选项 / 原生语音路由 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --voice-controls --client-fs-write --disable-web-search` | 通过：ACP initialize 接受 Full 任务才会声明的客户端受限文件写能力和关闭网页研究标志；`_x.ai/voice/start`、`stop`、`shutdown` 都抵达原生会话守卫 | 使用保证不存在的会话，因此不申请麦克风权限、不采集/上传音频、不发送模型提示词，也不验证真实听写 |
| 认证态会话与扩展控制 | 使用 App 登录副本创建一次性 `GROK_HOME` 与项目：`verify-grok-acp.mjs … --authenticated --session-info --session-controls --runtime-controls --subagent-controls --hooks-controls --voice-controls --client-fs-write --disable-web-search` | 通过：cached-token 认证、session new/load/Plan mode、token-free session info、持久化分叉、检查点读取、会话列表/删除、模型重载、Hooks reload/list、子代理 list/get/cancel，以及原生语音控制路由均通过 | 不发送模型提示词；测试只对缺失子代理和无 Hook fixture 做路由控制验证，不证明实际模型委派、Hook 执行或语音转写 |
| 隔离 Worktree / 自定义模型 | 在一次性单文件 Git fixture 与 App 登录副本中执行：`verify-grok-acp.mjs … --authenticated --custom-model --worktree` | 通过：临时 `[model.*]` 配置被 session/new 公告并经 `session/set_model` 选中；`_x.ai/git/worktree/create` 返回位于临时 home 的实际 Worktree 路径 | 不请求该自定义模型；Worktree 前置条件是有效 Git 仓库与至少一个提交，全部 fixture 和认证副本均在测试后删除 |
| 0.2.112 自定义模型 ACP 复验 | 临时复制 App 登录凭据至一次性目录，并运行：`verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --custom-model` | 通过：`grok 0.2.112 (47348d1)` 在新建 ACP 会话中实际公告临时 `[model.gorkx-acp-custom-smoke]`，随后成功执行 `session/set_model(gorkx-acp-custom-smoke)`，并可重载会话。临时模型端点固定为不可达的 `127.0.0.1:9`，未发送任何推理请求。 | 证明 gorkX 的 App-owned 模型配置会被该内核识别并可切换；不证明用户自己的第三方端点、密钥、余额或生成结果。真实第三方回答仍需在设置中安全配置后单独验收。 |
| 诊断包远端发送门禁 | 包内 `grok trace --help`；`grok_admin` 精确参数白名单和 `+` 菜单确认流 | 通过：0.2.112 支持不带 `--local` 的诊断上传；gorkX 只允许精确 `trace <UUID> --json`，并在实际调用前显示任务诊断可能被发送的明确说明。导出本地包与发送支持端是两个独立动作。 | 未上传任何真实任务诊断；服务端响应、支持链接和具体数据处理以用户确认后的 Grok Build 服务为准。 |
| 本次成果中心 | `cd apps/desktop && ./node_modules/.bin/tsc --noEmit && npm run verify:web-bundle`；`cd src-tauri && cargo check && cargo test` | 通过：任务明确回传且经工作区校验的成果按文档、图片、音视频和其他文件分组为可打开卡片；前端生产包通过，Rust 56 项测试通过 | 不扫描项目推测成果；不证明模型必然回传附件，且不替代实际任务的人工验收 |
| 会话丰富结果展示 | `cd apps/desktop && npx tsc --noEmit && npm run test:stages && npm run build`；`conversationPresentation.test.ts` | 2026-07-29 通过：普通用户回合自动携带非命令式展示偏好；保留原始 Markdown 表格并对小型两列数值比较自动附图；安全的 `chart`、`mermaid` 与 `diff` fenced block 分别进入本地受限 SVG/HTML 渲染；`choices` / `options` block 只在模型明确输出时成为点击后才发送的选择按钮。 | 未发送模型提示词制造样本；渲染不执行 HTML、脚本、远程资源或任意 Mermaid 指令。模型仍决定何时使用表、图或选择，不保证每条回复都可视化。 |
| 账户状态与额度真实窗口 | `cd apps/desktop && npm run build:app`；打开本地 `.app` 并查看账户菜单 | 已纠正：CLI 账单响应中的 `used/monthlyLimit` 是另一类月度/额外额度，不能映射为 SuperGrok 网页的每周限额。gorkX 仅接受 API 明确提供的 `creditUsagePercent` 或 Grok Build 产品百分比；缺失时不保存、换算或显示网页截图值，而是提供一键打开已登录 Grok 官方使用量页的入口 | 官方网页的 SuperGrok 周额度是当前权威来源；当前 CLI/ACP 没有提供该字段。桌面端只有在未来收到对应实时字段时才显示百分比。 |
| 每日 Token 本地记录 | `cd apps/desktop && npx tsc --noEmit && npm run test:stages`；`cd src-tauri && cargo check && cargo test`；本机新构建 App 打开“设置 → 使用情况和计费” | 通过：界面显示今日累计、输入/输出拆分和近 7 天趋势；缺失日期显示为零。0.2.116 的 ACP 回合响应含 `usage` 时，gorkX 仅在完成响应出现时按消息 ID 去重写入本机 SQLite，快照只更新当前上下文显示。前端阶段测试通过，Rust 81 项测试通过 | 未发起模型提示以制造计数；首次真实任务收到 PromptResponse usage 后才会形成今日累计。该数不是订阅额度、账单金额或估算值 |
| 项目 Hook 创作 | `cd apps/desktop && npx tsc --noEmit && npm run test:stage-a`；`cd src-tauri && cargo check && cargo test` | 通过：设置中的引导表单只允许固定事件、`command`/HTTPS handler、受限超时和安全文件名；Tauri 后端只在当前项目 `.grok/hooks` 下原子写入并拒绝 symlink，Rust/TS 测试覆盖 JSON、HTTPS、路径和文件名边界。保存不会授信或执行 Hook | 仍需在一个真实已授信项目中运行一次 Hook，验证由 Grok Build 执行而不是 App 自行执行 |

## 2026-07-23 · 桌面端本地构建与浏览器链路

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| TypeScript / 前端生产包 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle` | 2026-07-23 通过；首屏 JS gzip 91,803 / 512,000 bytes | 不代表运行中的 Grok 真实对话 |
| Rust | `cd apps/desktop/src-tauri && cargo test && cargo check` | 2026-07-23 通过；45 项单元测试与 `cargo check` 均通过 | 不代表 macOS TCC 或用户登录 |
| 浏览器动作 | `node scripts/verify-playwright-mcp.mjs --origin https://example.com` | 通过；隔离 Playwright MCP 发现 24 个工具，并成功 `browser_navigate` 到 `https://example.com` | 不发送模型提示词、不使用用户 Chrome profile；不代表 Grok 模型已在真实任务中调用浏览器 |
| App-only 包 | `cd apps/desktop && npm run build:app` | 2026-07-24 通过；只构建 `.app`，未生成 DMG | 不代表签名、公证或发行 |
| 包内内核 | `scripts/verify-macos-app-bundle.sh apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app` | 2026-07-24 通过；包内 `grok`、许可证与 NOTICE、隔离 `GROK_HOME` 完整，版本为 `grok 0.2.111 (69f0ba8)` | 不是干净 Mac 安装、App 内登录、真实项目首轮与重开续聊的人工闭环 |
| 无认证 ACP | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok` | 2026-07-24 通过 ACP initialize，受控资源内核为 `grok 0.2.111 (69f0ba8) [alpha]` | 认证、会话与扩展需要使用显式临时 home 的独立门禁 |
| 隔离 Worktree / 自定义模型 ACP | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --worktree --custom-model` | 2026-07-23 通过：cached-token 认证、session/new/load、临时自定义模型公告与 `session/set_model`、Plan mode、Worktree list 与 create；实际创建于临时 home 的 worktrees 目录 | 不发送模型提示，也不构成真实 provider 回复验收；Hooks 与子代理控制由后续独立 `_x.ai/*` 门禁覆盖 |
| 会话控制 ACP 探测 | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --session-controls` | 2026-07-23 通过：`_x.ai/session/fork` 创建并加载 durable 子会话、原会话保持可加载；`_x.ai/rewind/points` 返回原生检查点列表。标准 `x.ai/*` 拼写返回 `Method not found`，客户端已改为运行时实际暴露的兼容路由 | 不发送模型提示；完整回退执行需要至少两个已持久化的真实回合，受当前账号余额阻断 |
| 真实回退执行 | 同上追加 `--resource --rewind-execute` | 2026-07-23 未通过：隔离请求收到 Grok Build `402 Payment Required`（余额耗尽）；在此之前已证明路由可达和检查点读取 | 不把该失败写成回退成功；恢复可用余额后，需用隔离两轮会话复跑，验证 `conversation_only`、`force: false` 与 session reload |
| 运行中旁问 `/btw`（历史结果，已被新锁定提交覆盖） | `GROK_HOME=<临时认证 home> node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --btw` | 2026-07-29 的 `0.2.112 (47348d1)` 资源返回 `Method not found`；2026-07-31 以当前锁定提交 `5da6962…` 重建资源后，`--desktop-controls` 已确认 `_x.ai/btw` 路由可达 | 旧二进制结论不再代表当前包；真实模型侧问仍需登录后人工点按验收。 |
| Agent Profile ACP 创建 | 临时复制 App 登录凭据至一次性认证目录，并运行：`GORKX_ACP_TEST_AUTH_DIR=<temp> GORKX_ACP_TEST_PROJECT_DIR=<temp> node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --agent-profile`，以及 `--agent-profile-name explore` | 2026-07-29：包内 `grok 0.2.112 (47348d1)` 完成 cached-token 认证，接受 `session/new` 的 `_meta.agentProfile` 便携定义和内置 `explore` 名称，随后均可正常 `session/load` 与 `session/set_mode(plan)`。桌面端新建规划任务使用前者；“探索项目”使用后者。 | 未发送模型提示词；只证明会话创建契约和桌面接线，不把 Profile 提示词质量或任意自定义 Profile 文件解析宣传为已验收能力。临时认证副本与项目目录已删除。 |
| 子代理控制 ACP 探测 | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --subagent-controls` | 2026-07-23 通过：`_x.ai/subagent/list_running`、`get`、`cancel` 路由均可达；标准 `x.ai/*` 拼写不被当前 stdio 接受，客户端已改为兼容路由 | 探测只使用不存在的子代理 ID，不会启动或取消真实工作；真实委派/取消闭环仍需要有效账户余额验收 |
| Hooks 控制 ACP 探测 | `GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-02110-home GORKX_ACP_TEST_CWD=/private/tmp/gorkx-worktree-acp-project node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated --hooks-controls` | 2026-07-23 通过：`_x.ai/hooks/list` 返回 Hook 快照，`_x.ai/hooks/action` 的显式 reload 返回 success | 探测项目没有 Hooks；真实 Hook 配置、信任和启停仍需要真实项目验收，但设置页不再以 Soon 伪装可用性 |

## 2026-07-24 · 锁定源码内核可构建性

| 范围 | 命令 | 结果 | 边界 |
|---|---|---|---|
| 源码与补丁来源 | `scripts/sync-grok-kernel-source.sh && scripts/verify-grok-kernel-source.sh && scripts/verify-grok-kernel-patches.sh` | 2026-07-24 通过：上游 `xai-org/grok-build` 的锁定提交 `69f0ba880aa98f55e3ac1dcc570e2f332f825fe2` 干净；记录的补丁可干净应用 | `vendor/grok-build` 是本地忽略的构建输入，不作为 gorkX 仓库副本发布 |
| 源码构建与 ACP | `scripts/verify-grok-kernel-build.sh` 与 `scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok` | 2026-07-24 通过：干净临时 worktree 的完整构建与资源构建均报告 `grok 0.2.111 (69f0ba8) [alpha]`，并分别通过无认证 ACP initialize；源码生成的 LICENSE 与 THIRD-PARTY-NOTICES 分别和 App 资源一致 | 构建二进制 SHA-256 与旧包内二进制不同，故不声称字节级可复现；此门禁不包含登录、真实模型请求或 macOS 安装验收 |
| 一键复跑入口 | `scripts/verify-grok-kernel-build.sh [output-path]` | 已加入：依次验证锁定源码、补丁、源码构建、版本和无认证 ACP | 首次运行需要 Rust、Cargo、dotslash，且会编译上游内核；不会替换 App 资源或生成发行物 |
| 桌面沙箱配置 | `cd apps/desktop && npx tsc --noEmit && cd src-tauri && cargo test && cargo check` | 2026-07-24 通过：新增 App-owned `[sandbox].profile` 的内置 profile 选择器；Rust 测试确认只替换 sandbox 段并保留模型/子代理配置，且 ACP 启动时会规范化项目 cwd，49 项测试全部通过 | 此编译级证据证明配置与 ACP 启动 cwd 已接线；每个 macOS profile 的实际文件/网络阻断行为仍属于干净 macOS 真实项目验收 |
| Grok Build 诊断与修复 | 设置 → 环境 → 运行诊断；`apps/desktop/src-tauri/resources/grok doctor --json` | 2026-07-24 通过：桌面端合并 app-owned 预检与 0.2.111 内核 JSON findings；自动修复按钮仅接受内核当次广告的 fix ID，后端再次核验；50 项 Rust 测试、前端构建与 app-only bundle 均通过 | 本机本次诊断没有自动修复项，故不执行会修改终端/配置的 `doctor fix`；实际修复需在出现内核广告的项目上由用户明确点击确认 |
| 原生语音 ACP 控制面 | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --voice-controls` | 2026-07-24 通过：实际应用资源 `grok 0.2.111 (69f0ba8)` 完成 ACP initialize，并令 `_x.ai/voice/start`、`stop`、`shutdown` 分别抵达新内核的原生语音会话守卫 | 该门禁使用不存在的会话 ID，因此不会触发 macOS 麦克风授权、不会启动采集、不会上传音频或发送模型请求；仍需在有授权的 macOS 上人工验证一次真实转写、草稿写入与用户自行发送 |
| 原生语音 ACP 控制面（锁定内核复核） | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --voice-controls` | 2026-07-29 通过：应用资源 `grok 0.2.112 (47348d1)` 完成 ACP initialize；`_x.ai/voice/start`、`stop`、`shutdown` 均抵达原生会话守卫 | 仍使用保证不存在的会话 ID：不触发 macOS 麦克风授权、不采集或上传音频、不发送模型提示词。真实听写、编辑草稿和用户手动发送仍保留为 macOS 人工验收门槛。 |
| v0.4.3 DMG 安装包 | `npm run tauri build`；只读挂载 DMG 后执行 `verify-macos-app-bundle.sh` 和 `verify-grok-acp.mjs --voice-controls` | 2026-07-24 通过：`gorkX_0.4.3_aarch64.dmg` 可只读挂载，包内 `grok 0.2.111 (69f0ba8)`、LICENSE 与 NOTICE 完整；原生语音 start/stop/shutdown 路由通过。SHA-256：`12ed907987898890659f0de8f22fcbbf0f110bc185ab76d2e16ebb3725593047` | 不替代真实登录、真实语音转写和真实 provider 回复的人工走查 |
| 首页办公工作流 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle` | 2026-07-24 通过：中英文首页的阅读总结、报告、调研、项目计划和开发卡片均将本地化自然语言 brief 填入可编辑输入框；用户可增补材料后显式发送，生产包首屏 JS gzip 97,731 / 512,000 bytes，懒加载边界保持 | 不发送模型提示词；实际内容质量属于用户任务使用时的内核/模型行为 |
| 独立网页资料预览 | `cd apps/desktop && npx tsc --noEmit && npm run build:app`；本机新构建 App 的设置 → 浏览器 → 打开预览 | 2026-07-24 通过：设置页仅接受带 hostname 的 HTTP(S) 链接；补齐 Tauri `core:webview:allow-create-webview-window` ACL 后，`https://example.com` 实际打开独立 `gorkX · Web preview` 原生窗口并加载页面。网页资料与 Agent 的 MCP Chrome profile、gorkX 凭据桥均隔离 | 此门禁不代表网页可被 Agent 读取或控制；Agent 浏览能力仍经 Playwright MCP 与其自身诊断验证 |
| 账户状态桌面引导 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle && npm run build:app`；本机新构建 App 打开账户菜单 | 2026-07-24 通过：账户菜单在额度不可用时显示“请在「设置 → 账户」中登录后查看账户信息。”，未出现 `grok login` 或其它终端命令；未点击登录，也未发送模型请求 | 未覆盖浏览器登录/重新认证本身；该验证只覆盖账户状态的桌面提示与安全导航 |
| ACP 客户端文本写入 | `cd apps/desktop/src-tauri && cargo test && cargo check`；`node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --client-fs-write` | 2026-07-24 通过：52 项 Rust 测试包含项目内原子替换、`..` 越界拒绝与符号链接拒绝；锁定内核在无认证 initialize 中接受 Full 任务才会声明的 `writeTextFile` 能力 | 门禁不创建会话或写项目文件；真实模型回合仍需有额度账号。Default/Auto 任务不宣告客户端写入能力 |
| 本地任务与会话搜索 | `cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle && npm run build:app`；`cd src-tauri && cargo test && cargo check`；本机新构建 App 点击侧栏“搜索全部任务” | 2026-07-25 通过：第 53 项 Rust 测试覆盖标题、中文对话、跨项目和归档任务检索；实际 UI 以“读取”命中任务标题与已保存对话内容，点击后恢复原项目及完整本地快照 | 不扫描项目文件、附件、用户 CLI home，也不发送模型提示词；只检索 gorkX SQLite 中的自有任务与最近快照 |

## 正式版 v1.0.0 证据索引 · 2026-07-31

> 执行方案：[`FORMAL_RELEASE_PLAN.md`](FORMAL_RELEASE_PLAN.md)。  
> 本会话触发语：`按方案做`；随后用户批准「推送远端，打包发布」。  
> **已发布：** tag `v1.0.0` · [Release](https://github.com/linkyang01/gorkX/releases/tag/v1.0.0) ·  
> 资产 `gorkX_1.0.0_aarch64.dmg` · SHA-256 `b24bd3c16a9447a36b17ecb77b5bebc320fec343a2586131a14d9df065f6f88c` · 签名 ad-hoc。

| ID | 结果 | 命令或步骤 | 边界 |
|---|---|---|---|
| R1 | 部分 | 既有包内内核隔离证据 + 本会话 `verify-grok-kernel-*` / ACP initialize | 干净机安装→登录→首任务→重开仍待 **[USER] H1** |
| R2 | 历史通过 | 见上文真实 ACP / Review / 任务链路条目 | 本会话未重复完整人工编码循环 |
| R3 | 历史通过 | fork / rewind 预览与确认条目 | 同上 |
| R4 | 未通过（诚实） | 用户未提供第三方 endpoint | 宣传不得写「多 Provider 已验收」 |
| R5 | 通过 | `cargo test`（含 Keychain/隔离）；`store` schema 仅有 ACP **用量** token 计数，无 API 密钥列；connector audit 脱敏测试 | — |
| R6 | 通过 | `FEATURES.md` / `DESKTOP_CAPABILITY_MAP.md` 写入任务工具 denylist 与 allow/deny；+ 菜单入口为真链路 | Soon 连接器仍不可执行连接 |
| R7 | 通过 | 见下表「本会话门禁」 | — |
| R8 | 通过 | `package.json` / `package-lock` / `Cargo.toml` / `Cargo.lock` gorkx / `tauri.conf.json` / `appMeta.ts` = `1.0.0`；`releaseGates.test.ts` 锁定一致性 | 候选包构建后需再验 bundle 版本字符串 |
| R9 | 通过 | `docs/RELEASE_NOTES_v1.0.0.md`；README 中英下载链与签名边界 | 下载 URL 在 tag 后才真实可点 |
| F1 | 通过 | `kernel/patches/0004-acp-agent-stdio-cli-overrides.patch` 在 series；`verify-grok-kernel-patches.sh` PASS | 资源二进制若需强制刷新：`build-grok-kernel.sh` |
| F2 | 通过 | `taskToolLimits.ts` + UI + SQLite `disallowed_tools` + reconnect 路径 | 单元测试覆盖 sanitize |
| F3 | 通过 | `taskPermissionRules.ts` + UI + SQLite `permission_rules`；拒绝 `*`/`**` 与注入字符 | Rust + TS 测试 |
| F4 | 历史通过 | 过期登录恢复既有修复与证据 | 正式版可再人工点一次 |
| F5 | 通过 | `github_disconnect` 删 Keychain；写确认含目标仓库；scope 展示；审计 connect/disconnect/write | 本会话未持用户 token 做 live 写 |
| F6 | 通过 | FEATURES / README / 发布说明边界一致 | — |
| H1 | 阻塞 | **[USER]** 干净 macOS 或书面接受开发机等价验收 | 未伪造 |
| H2 | 阻塞/放弃可选 | **[USER]** 提供 endpoint 或书面降级 | 默认 R4 未通过 |
| H3 | 阻塞 | **[USER]** 麦克风 TCC 听写 | 未伪造 |
| H4 | 可选 | **[USER]** Developer ID + 公证 | 无则 ad-hoc + README Gatekeeper 说明 |

### 本会话门禁（R7）

| 范围 | 命令 | 结果 |
|---|---|---|
| 内核源码 | `scripts/verify-grok-kernel-source.sh` | PASS · `47348d13…` |
| 补丁 series | `scripts/verify-grok-kernel-patches.sh` | PASS · 当前 series 含 0001–0005 |
| ACP | `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok` | PASS initialize |
| TS | `cd apps/desktop && npx tsc --noEmit` | PASS |
| Stage 测试 | `npm run test:stages` | PASS（含 taskToolLimits / taskPermissionRules / connectors） |
| Web bundle | `npm run verify:web-bundle` | PASS |
| Rust | `cd src-tauri && cargo test && cargo check` | PASS · 80 tests |
| App-only 包 | `cd apps/desktop && npm run build:app` | PASS · `gorkX.app` @ `src-tauri/target/release/bundle/macos/` · 版本 crate `gorkx v1.0.0` |
| Bundle 结构 | `scripts/verify-macos-app-bundle.sh …/gorkX.app` | PASS · arm64 · 包内 `grok 0.2.112 (47348d1)` · 隔离 `GROK_HOME` |
| 发布就绪 | `scripts/verify-release-readiness.sh` | 发版前：`releaseCandidateReady: true`；用户批准后已 ship |
| 公开发版 | `git push` · `git tag v1.0.0` · `gh release create` · DMG | 2026-07-31：main@`8471d83` · [v1.0.0](https://github.com/linkyang01/gorkX/releases/tag/v1.0.0) · DMG 挂载后 `verify-macos-app-bundle.sh` PASS · 内核 `0.2.112 (47348d1)` · **ad-hoc 非公证** |

## 发布后的真实体验验收项

1. 一台没有既有 Grok 数据的 macOS：只安装 gorkX → App 内登录 → 真实项目首轮 → 退出重开恢复。
2. 两条用户授权的真实 Provider：连接测试 → 会话选中 → 真实回复，并保留脱敏记录。
3. 上述真实项目会话中的分叉、三种回退范围、冲突拒绝、计划批准和工具审批人工走查。

以上项目不以构建或路由门禁替代；它们是后续版本体验完善与回归验收的依据。v0.4.3 已发布时，只对本文件列出的构建、包结构和 ACP 路由证据作出声明，不将其扩大为全功能端到端验收。
