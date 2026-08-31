# 供应链与依赖安全

gorkX 不把“锁文件存在”当成依赖安全通过。正式 macOS Apple Silicon 发布图由 cargo-deny 检查 Rust advisory、许可证、来源和重复版本；npm 锁文件由 OSV-Scanner 与 npm audit 覆盖。许可证与来源由 `deny.toml` 和 SPDX SBOM 记录。扫描工具或 advisory 数据不可用时，门禁保持失败。

## 本地命令

```bash
cd /Users/link/projects/gorkX
./scripts/verify-supply-chain.sh
cd apps/desktop
npm audit --omit=dev --audit-level=high
```

脚本默认使用 `aarch64-apple-darwin`，也可用 `GORKX_RELEASE_TARGET` 复核另一个明确目标；这不是把 Linux/Windows 实验平台宣称为正式发行平台：

```bash
GORKX_RELEASE_TARGET=aarch64-apple-darwin ./scripts/verify-supply-chain.sh
```

`verify-quality.sh` 会在前端、Rust、浏览器冒烟和 Web bundle 检查后调用供应链门禁。离线 Cargo 只影响依赖获取，不会跳过安全扫描：

```bash
GORKX_CARGO_OFFLINE=1 ./scripts/verify-quality.sh
```

## CI 路径

`.github/workflows/quality.yml` 在 Ubuntu runner 安装 cargo-deny 与官方 OSV-Scanner CLI，运行完整 `scripts/verify-quality.sh`；cargo-deny 明确检查正式 `aarch64-apple-darwin` 依赖图，OSV-Scanner 检查 npm 锁文件。同一 workflow 还在 Ubuntu、macOS 14 和 Windows 2025 执行前端阶段、TypeScript 和生产 Web 构建。`.github/workflows/osv-scanner.yml` 使用 Google 官方可复用工作流执行 npm PR 差异扫描和定期全量扫描。

SBOM job 使用 Anchore SBOM Action（Syft）生成 `gorkx.spdx.json`，再归档为 30 天的 `gorkx-spdx-sbom`。这份清单用于核对 Cargo/npm 锁文件、许可证和第三方声明；它不是漏洞扫描替代品。

CI Action 使用不可变 commit SHA，并保留人类可读的发布版本注释；Dependabot 每周检查 GitHub Actions、npm 和 Cargo 更新。依赖变更还通过 GitHub Dependency Review 在 pull request 上做增量审查。

## 当前事实边界

- 本地 2026-08-31 的 `npm audit --omit=dev --audit-level=high`：0 个生产依赖漏洞；全量 audit 修复了 `nanoid` 和 `postcss` 的开发链传递版本，复核为 0 个漏洞。
- 本地 Rust 正式目标图的 cargo-deny 检查以实际命令输出为准；npm OSV 扫描以 npm 锁文件为准。缺少二进制或 advisory 网络时不得写成 PASS。
- Tauri 2.11.5 的 Linux GTK3 传递图仍包含受 RustSec/OSV 标记的 `glib 0.18` 及已不维护 GTK3/Unicode 绑定；它不进入当前 macOS Apple Silicon 发布图，也不构成 Linux 正式支持证据。启用 Linux 发行前必须用 `GORKX_RELEASE_TARGET` 复核并等待/完成 Tauri 上游迁移，不能沿用本机 macOS PASS。
- SBOM、跨平台矩阵和依赖审查配置已提交，但本台 macOS 不代替 GitHub runner 的执行结果。
- `.cache/`、`target/`、`node_modules/`、浏览器缓存和扫描器数据库均不提交。

官方工具入口：[`cargo-deny`](https://github.com/EmbarkStudios/cargo-deny)、[`OSV-Scanner`](https://github.com/google/osv-scanner)、[`Anchore SBOM Action`](https://github.com/anchore/sbom-action)。
