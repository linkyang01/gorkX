# Stage G — 发布可信度与覆盖

> 状态：门禁与验收清单已落地；**默认不打 tag、不发 Release、不做 DMG**（产品计划 §7.6）。  
> 公开分发 macOS 构建需要 **Developer ID + 公证** 凭证与人工批准。

## 1. macOS 签名与公证

| 级别 | 含义 | 下载即开（无需终端绕过） |
|------|------|--------------------------|
| `none` | 未签名 | 否 |
| `adhoc` | 本地/CI 默认 ad-hoc | 否（开发可用） |
| `developer_id` | Developer ID Application | 否（仍须公证） |
| `notarized` | Developer ID + 公证并 staple | **是** |

**推荐流程（需 Apple 开发者账号，本仓库不代持密钥）：**

1. `scripts/mac-build.sh` 产出 `gorkX.app`
2. `codesign --deep --force --options runtime --sign "Developer ID Application: …" gorkX.app`
3. 打 zip/dmg → `xcrun notarytool submit … --wait`
4. `xcrun stapler staple gorkX.app`
5. `scripts/verify-macos-signing.sh /path/to/gorkX.app` → `SIGNING_LEVEL=notarized`
6. `scripts/verify-macos-app-bundle.sh` 确认包内内核与隔离 `GROK_HOME`

**更新：** 应用内检查 GitHub Releases；**不自动安装**。  
**回滚：** 保留上一版 `.app` 或重装上一 DMG。  
**崩溃诊断：**

- `~/Library/Application Support/gorkX`
- `~/Library/Logs/DiagnosticReports`
- `log show --predicate 'process == "gorkx"' --last 1h`
- 应用内导出任务 trace（用户确认后）

## 2. Apple Silicon 与 Intel

| 架构 | 验收项 |
|------|--------|
| arm64 | 安装 → 登录 → 真实项目一轮 → `verify-macos-app-bundle`（包内内核） |
| x86_64 | 同上，在 Intel 机器或 x86_64 产物上分别完成 |

宿主机架构只作诊断，不自动计入验收。双架构「已验收」需要两套独立的安装、登录和
真实项目证据（或等价 CI matrix）；Apple Silicon 上的 x86_64 交叉构建与 Rosetta
运行只能作为产物预检，不可冒充原生 Intel 验收。`verify-release-readiness.sh` 仅在
明确提供有记录的 `GORKX_ARCH_VERIFIED` 时计算对应架构。

```bash
# 当前架构的包内内核
scripts/verify-macos-app-bundle.sh apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app
scripts/verify-macos-signing.sh   apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app
```

## 3. Windows 试验版（trial）

进入试验分发前，逐项真实验收（未完成则保持 trial，不宣传 GA）：

1. 隔离数据目录（不写用户无关全局配置）
2. 密钥存储（Credential Manager / 等价物），无明文进 SQLite/日志
3. 包内或受控路径内核可启动
4. 真实任务：登录 → 打开项目 → 一轮工具/回复
5. 安装与卸载干净

当前仓库 **未声明 Windows GA**；`releaseGates.platform.windows = trial`。

## 4. Linux 评估（eval）

仅当以下可控后再进 Beta：

- 密钥环/机密存储
- 沙箱与权限模型
- 桌面集成（图标、文件关联、通知）
- 支持成本（发行版矩阵）

`releaseGates.platform.linux = eval`，默认 **不批准** Beta。

## 5. 自动化门禁

| 命令 | 作用 |
|------|------|
| `cd apps/desktop && npm run test:stages` | 阶段 A–G 相关单测 |
| `npm run test:stage-g` | 发布门禁纯逻辑 |
| `scripts/verify-macos-app-bundle.sh <app>` | 包内内核 + 隔离 HOME |
| `scripts/verify-macos-signing.sh <app>` | 签名/公证/架构报告 |
| `scripts/verify-release-readiness.sh` | 编排测试 + 包 + 门禁 JSON |
| `scripts/doctor.sh` | 环境、诊断路径、回滚提示 |

**公开 ship 判定**（`evaluateReleaseGates`）：

- 必须：A–F 测试、bundle 引擎 OK、**notarized**、arm64+x86_64 证据、**用户明确批准**
- 未批准时 `canShipPublicArtifacts = false`（即使功能齐全）
- 发布所有者也可明确选择 `arm64_adhoc` 范围：仍必须通过自动测试、包内内核、
  真实 prompt、第三方模型、麦克风、arm64 证据、完整 App ad-hoc 签名和人工批准；
  另需独立设置 `GORKX_LIMITED_RELEASE_WAIVER=1`。脚本会把未进入该范围的完整分发
  条件写入 `waivers`，不会把它们记成通过。

```bash
# 仅检查；默认拒绝公开 ship
scripts/verify-release-readiness.sh

# 仅在用户明确说「可以打 tag/发 DMG」后：
# GORKX_USER_APPROVED_SHIP=1 scripts/verify-release-readiness.sh

# 仅在发布所有者明确批准 Apple Silicon 受限范围后：
# GORKX_RELEASE_SCOPE=arm64_adhoc GORKX_LIMITED_RELEASE_WAIVER=1 ...
```

## 6. 与 v0.5.0 Beta 门槛的关系

更细的「下一版能否发」见 `NEXT_RELEASE_GATES.md`。Stage G 补充的是 **签名/架构/跨平台诚实矩阵** 与 **禁止擅自发版** 的可执行门禁。
