# gorkX 8 分质量提升计划

> 目标：把 gorkX 从“功能面很完整的开发者预览”提升为“核心链路、边界安全、可维护性和验证证据都达到 8 分门槛的桌面产品”。
>
> 本计划不把“页面存在”“脚本退出 0”或“构建成功”当成真实产品能力。内核真实回复、登录、Hook、麦克风、签名和干净机器安装仍是独立验收项。

## 1. 评分口径与完成定义

| 维度 | 8 分门槛 | 证据 |
|---|---|---|
| 核心任务链路 | 新建/恢复任务、流式回复、权限、取消、队列、Hook 拒绝都能给出可理解且可恢复的状态 | 前端单测、ACP 契约探针、真实账号回合 |
| 安全边界 | 密钥不落盘明文；模型配置按标准 TOML 解析；ACP 文件读写受项目和符号链接边界约束；依赖有漏洞/许可证门禁 | Rust 单测、`deny.toml`、OSV/RustSec 扫描 |
| 可维护性 | 大型入口不再继续扩张；解析/持久化/边界逻辑有单一责任；升级依赖由自动化提案维护 | 代码审查、锁文件、Dependabot、质量脚本 |
| 发布可信度 | 构建、版本、内核锁定源、补丁序列、许可证/第三方声明和 App 包检查可复现 | `docs/VALIDATION_EVIDENCE.md` 及脚本输出 |
| 体验完成度 | 失败状态能解释下一步；不把上游 Hook 拒绝伪装成普通取消；队列/审批跨任务可见 | UI 文案回归、Playwright/人工走查、Hook 真实验收 |

8 分不是“所有平台都完成”。当前产品范围仍是 macOS Apple Silicon；Intel、Developer ID/notarization、Windows/Linux 和第三方真实模型属于单独的发布/平台门槛。

## 2. 依赖选择原则

### 已采用

| 能力 | 采用 | 原因与边界 |
|---|---|---|
| ACP 协议 | `@agentclientprotocol/sdk`（现有） | 协议层不自研；gorkX 只做桌面适配和用户状态呈现 |
| TOML 解析与保留格式改写 | `toml_edit` 0.22.27 | 替换按行解析；保留未知字段、注释和合法引号/逗号；仍由 gorkX 做业务字段白名单和秘密校验 |
| Rust 秘密容器 | `secrecy` 0.10.3 | Keychain 读回值和请求传输值使用不易误打印的容器；不把前端 IPC 中的输入说成“永远不会存在字符串” |
| 桌面文件/进程/终端 | Tauri 官方插件、Rust `std`、`portable-pty`、xterm.js（现有） | 复用成熟边界；命令参数仍按产品场景白名单，不开放任意 shell 形状的 ACP 工具 |
| 供应链审计 | `cargo-deny`、OSV-Scanner、可选 RustSec `cargo-audit` | 锁文件、许可证、来源和已知漏洞分开检查；工具缺失时门禁失败，不降级为“安全通过” |

### 暂不引入

| 候选 | 决定 | 理由 |
|---|---|---|
| XState | 暂缓 | 当前 Run Center 是无副作用的状态派生函数；在没有把整条任务事件流迁移进去前，引入状态机只会增加并行状态源 |
| `tauri-plugin-updater` | 暂缓到签名发布阶段 | 官方更新插件值得采用，但它要求签名公钥/私钥和签名更新产物；当前已有的 arm64 adhoc 包不能伪装成可安全自动更新 |
| 自建向量记忆/浏览器/CDP 层 | 不做 | 继续使用 Grok Build、`@playwright/mcp` 和现有 Tauri/SQLite 边界；产品域逻辑以外不重复造轮子 |

库选择记录参考了 Exa 对官方文档/仓库的检索，并以实际锁文件、许可证和本地构建结果为准：[`toml_edit`](https://github.com/toml-rs/toml)、[`secrecy`](https://github.com/iqlusioninc/crates/tree/main/secrecy)、[`cargo-deny`](https://github.com/EmbarkStudios/cargo-deny)、[`OSV-Scanner`](https://github.com/google/osv-scanner)、[Tauri capabilities](https://v2.tauri.app/security/capabilities/) 和 [Tauri updater signing](https://v2.tauri.app/plugin/updater/)。

## 3. 分阶段执行

### P0：锁定基线与安全底座（本轮）

- [x] 保留 Grok Build 1.0.12 锁定源、补丁序列、现有 HookDenied 处理和已有发布证据。
- [x] `models_config.rs` 使用 `toml_edit` 解析和编辑标准 TOML，拒绝超大/非法配置，保留未知字段与注释。
- [x] `secrecy::SecretString` 覆盖 Keychain 读写和模型请求的短生命周期秘密。
- [x] ACP `fs/read_text_file` 走项目根、常规文件、大小和符号链接校验。
- [x] 配置文件读写拒绝符号链接，使用私有权限和同步后的临时文件替换，避免半写配置。
- [x] 增加模型配置、秘密 Debug 脱敏、TOML 改写和 ACP 文件越界回归。
- [x] 增加 `deny.toml`、Dependabot 和 fail-closed `verify-supply-chain.sh`。

退出条件：前端阶段测试、TypeScript、Rustfmt、Clippy、check、单测、Web bundle 和新边界单测通过；供应链扫描必须有工具和网络后才能标记通过。

### P1：核心任务可靠性

- [ ] 把 `App.tsx` 的任务发送、恢复、队列、审批路由按边界抽成可独立测试的模块；每次只迁移一个行为单元。
- [ ] 为取消/重连/队列竞争加入基于真实事件顺序的 ACP fake-server 契约测试。
- [ ] 把“错误已显示但任务仍 busy”“审批已移除但原会话未回答”等状态列入回归。
- [ ] 以 Playwright 测试浏览器可运行的 Web UI 核心流；Tauri 原生权限和 Keychain 仍需原生/人工轨道。

退出条件：恢复、取消、权限、队列和 Hook 拒绝各有一个可重复的正向与反向测试，且不依赖真实账户。

### P2：发布和运维可信度

- [ ] 在 Developer ID/notarization 和签名更新密钥就绪后，迁移到 Tauri 官方 updater；保留下载校验和回滚证据。
- [ ] 在 CI 安装 `cargo-deny`、OSV-Scanner、Rustfmt/Clippy，并运行 `scripts/verify-quality.sh`。
- [ ] 增加 SBOM/许可证清单归档，按锁文件提交 SHA/工具版本。
- [ ] 设立 Intel/Windows/Linux 的独立验证矩阵，不把 arm64 adhoc 结果扩展为全平台 PASS。

退出条件：从干净 checkout 能重建相同内核版本和 App 资源，且所有剩余 waiver 明确写在验证证据中。

## 4. 已设计测试用例矩阵

### Q-UNIT：纯函数与格式

| ID | 用例 | 通过条件 |
|---|---|---|
| Q-UNIT-01 | HookDenied + `stopReason=cancelled` | 用户看到 Hook 阻止，而不是普通取消 |
| Q-UNIT-02 | 精确文本 `Turn blocked by a hook`、带时长、大小写变化 | 都归一化为 Hook 阻止 |
| Q-UNIT-03 | PermissionCancelled | 保留普通停止原因，不误报 Hook |
| Q-UNIT-04 | TOML 引号、逗号、注释、未知字段 | 解析正确，未知字段不会被 upsert 删除 |
| Q-UNIT-05 | 非法 TOML、超过 4 MB | 明确失败，不返回空模型列表 |
| Q-UNIT-06 | 明文 `api_key` 迁移/重写 | 配置不再保留明文；Keychain 失败时不写替换结果 |
| Q-UNIT-07 | Header/query/env 名称和值 | 秘密字段、控制字符、非法环境变量被拒绝 |
| Q-UNIT-08 | 秘密 Debug 输出 | 不包含原始 Key |
| Q-UNIT-09 | 项目外文件、符号链接、超大文件 | ACP 读请求 fail-closed |

### Q-STATE：任务生命周期

| ID | 事件序列 | 通过条件 |
|---|---|---|
| Q-STATE-01 | idle → prompt → running → end_turn | 只在真实 ACP 结束后回到 idle |
| Q-STATE-02 | running → approval → answer | approval 期间不显示 stalled，答案送回原会话 |
| Q-STATE-03 | running → cancel | busy、队列和审批状态最终一致 |
| Q-STATE-04 | running → process exit → reconnect | 不创建重复任务；失败原因可见 |
| Q-STATE-05 | running + follow-up | 首选内核队列；不支持时显示本地 fallback 且只发送一次 |

### Q-ACP：内核契约

| ID | 范围 | 通过条件 |
|---|---|---|
| Q-ACP-01 | initialize/session/new/prompt | 协议版本、客户端能力和版本字段符合锁定内核 |
| Q-ACP-02 | Hook/permission/question/plan/trust | 反向请求路由到原任务，禁止跨任务回答 |
| Q-ACP-03 | session/load/fork/rewind | 只调用内核原生路由，不在前端重建会话历史 |
| Q-ACP-04 | filesystem | 文件读写都经过项目边界；没有任意 renderer 路径读取 |
| Q-ACP-05 | 资源/第三方模型 | 非 2xx、过大响应、无生成文本都不能冒充成功 |

### Q-RUST：原生安全

| ID | 范围 | 通过条件 |
|---|---|---|
| Q-RUST-01 | Rustfmt、cargo check、Clippy、cargo test | 全量源码格式、编译、`clippy -D warnings` 和单测通过 |
| Q-RUST-02 | 路径/符号链接/原子写入 | 越界、链接替换和冲突写入被拒绝 |
| Q-RUST-03 | Keychain/env | 只向目标子进程注入；诊断和 renderer 不回显秘密 |
| Q-RUST-04 | cargo-deny/OSV/RustSec | 无未处理高危漏洞、来源和许可证政策通过 |

### Q-BUNDLE：构建与证据

| ID | 范围 | 通过条件 |
|---|---|---|
| Q-BUNDLE-01 | locked source + patch series | upstream remote/commit、补丁逐个可重放 |
| Q-BUNDLE-02 | bundled kernel | 版本、架构、ACP initialize、license/notices 匹配 |
| Q-BUNDLE-03 | Web bundle | 初始 JS gzip 上限、懒加载 chunk 和版本同步通过 |
| Q-BUNDLE-04 | App/DMG | bundle 内引擎、签名级别和 SHA 与记录一致 |

### Q-REAL：不能由本地单测替代

| ID | 需要的真实条件 | 当前规则 |
|---|---|---|
| Q-REAL-01 | 真实登录账号 + Grok Build 回复 | 记录真实回复和账号路径；fake ACP 不算通过 |
| Q-REAL-02 | 真实 Hook 执行 | 必须由内核启动任务并写入一次性 marker；仅 UI 点击不算执行 |
| Q-REAL-03 | 真实第三方模型 | 真实 provider 回复；HTTP 200 或模型目录不算生成成功 |
| Q-REAL-04 | 麦克风/语音 | macOS 权限和真实录音回合单独记录 |
| Q-REAL-05 | 干净机器安装/登录/重启 | 与开发机、缓存、既有 Keychain 分开 |

## 5. 可复现命令与证据规则

源代码质量门禁：

```bash
cd /Users/link/projects/gorkX
./scripts/verify-quality.sh
```

若本机已经缓存锁定依赖但当前网络不可用，可显式使用离线模式；这不绕过
供应链扫描，缺少 cargo-deny/OSV-Scanner 时脚本仍会失败：

```bash
GORKX_CARGO_OFFLINE=1 ./scripts/verify-quality.sh
```

供应链门禁也可单独运行：

```bash
cd /Users/link/projects/gorkX
./scripts/verify-supply-chain.sh
```

内核锁定源、补丁、构建和 ACP 轨道继续使用现有脚本：

```bash
./scripts/verify-grok-kernel-source.sh
./scripts/verify-grok-kernel-patches.sh
./scripts/verify-grok-kernel-build.sh
```

证据只记录真实输出：PASS 写命令、日期、版本和摘要；工具缺失、网络阻塞、无账号、未 notarize、非目标架构和未走人工 UI 的项目写成 BLOCKED/WAIVED，不折算为 PASS。`.cache/`、`target/`、`node_modules/` 和构建产物不进入提交。

## 6. 当前完成情况

本轮 P0 已完成：模型配置改用标准 TOML 解析、秘密生命周期和项目文件边界已加固，Rust 全量 104 项测试、Clippy、前端 Stage A–G、生产构建和锁定内核检查均有实跑结果。供应链扫描仍必须在安装 `cargo-deny` / OSV-Scanner 并可访问其 advisory 数据后单独完成，不能用本地编译替代。

本轮完成代码与门禁后，更新 [`VALIDATION_EVIDENCE.md`](./VALIDATION_EVIDENCE.md)；该文件只保留本次确实执行通过的项目。当前 arm64 adhoc 发布仍不等于 Developer ID/notarization 或跨架构发布完成。
