# 平台验证矩阵

平台矩阵只描述已执行的轨道，不把配置文件存在扩大为测试通过。

| 平台/轨道 | 自动化覆盖 | 当前结论 |
|---|---|---|
| macOS Apple Silicon | 本机 TypeScript、Rust、Web build、Playwright Chromium、arm64 bundled kernel/App 既有证据 | 代码与候选包证据通过；现有签名为 ad-hoc，未公证 |
| macOS Intel | CI 配置未使用 Intel runner；没有本机 Intel 产物 | BLOCKED，不能从 arm64 推断 |
| Windows | `quality.yml` 的前端阶段、TypeScript、Web build 矩阵 | 等 GitHub runner 首次执行；未宣称 Tauri 安装通过 |
| Linux | Ubuntu 源码/Rust/供应链/内核 job | 等 GitHub runner 首次执行；不宣称桌面发行包通过 |
| 干净 Mac 安装 | 不由 CI Web/Rust 代替 | Q-REAL-05，需真实机器 |
| 真实账号/Hook/第三方模型/麦克风 | ACP fixture 只覆盖协议，不替代真实回合 | Q-REAL-01..04，按用户账号和系统权限验收 |

CI workflow：`.github/workflows/quality.yml`。严格 macOS 发布签名：`scripts/verify-release-signing.sh`。完整质量命令见 [`SUPPLY_CHAIN.md`](SUPPLY_CHAIN.md) 与 [`VALIDATION_EVIDENCE.md`](VALIDATION_EVIDENCE.md)。
