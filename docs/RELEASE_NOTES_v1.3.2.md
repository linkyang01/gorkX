# gorkX 1.3.2

本版本对应锁定的 Grok Build `1.0.12`（`bc7f02eddd3d84085849dc19ed216f11c23b0571`，包内显示 `1.0.12 (bc7f02eddd3d)`）。

Apple Silicon 资产：`gorkX_1.3.2_aarch64.dmg`（70,278,947 bytes）
SHA-256：`7cf85c307a320ff9c578c1e3e5aa4117b8262eb7971838bee630939424fc1132`

## 本版变更

- 修复多项目侧栏过长时覆盖“运行中心”的布局问题：项目和任务列表在独立滚动区域内，运行中心保持可见。
- 恢复 macOS 原生麦克风捕获链：使用 App 的音频输入 entitlement 和 in-process capture，转写结果进入可编辑草稿，停止监听不会自动发送。
- 语音设置支持首选识别语言；中文选择走自动识别，不把语言偏好误当作 macOS TTS 或强制模型语言。
- Hook-verification 清理失败时 fail-closed，保留仍可能运行的临时项目句柄；真实认证任务验证了受限 `SessionStart` Hook、一次性 marker 和清理流程。

## 已验证范围

- 前端 Stage A–G、TypeScript、Web bundle、Rust fmt/check/test/clippy、锁定内核源码/补丁和 App bundle 校验通过。
- 真实认证 ACP prompt、真实 Hook marker/task、App 通过本机 Ollama endpoint 的真实回复，以及 macOS 麦克风到中文可编辑草稿的链路均有记录。
- 本版本公开分发范围为 Apple Silicon `arm64_adhoc`。签名为 ad-hoc，用户可能需要按 macOS Gatekeeper 提示手动允许打开。

## 未覆盖范围

本版本不宣称干净 Mac 安装/登录/重开、Developer ID/Apple 公证或原生 Intel（x86_64）验收通过；这些项目作为明确 waiver 保留在发布审计中。Windows 仍为 trial，Linux 仍为 eval。
