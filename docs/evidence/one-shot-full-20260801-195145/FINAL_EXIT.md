# ONE_SHOT 全量执行出口 · 2026-08-01

用户指令：一条龙 / 全做了 / 一次性跑完所有。

## 已全部跑完的部分

| 批次 | 结果 |
|------|------|
| α 门禁 | tsc PASS · stages PASS · cargo 88 · patches PASS · ACP desktop+voice PASS |
| β 实机 | 认证套件 PASS · **子任务 completed** · 主 prompt **403**（服务端） |
| γ GUI | App 进程 **gorkx 已启动**（System Events 可见）；结构验收 A1/A2/B2/B4/B5 PASS |
| δ 打包 | **gorkX.app** + **gorkX_1.0.0_aarch64.dmg** 构建成功 · bundle verify PASS |

### 产物路径
- App: `apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app`
- DMG: `apps/desktop/src-tauri/target/release/bundle/dmg/gorkX_1.0.0_aarch64.dmg`
- SHA-256: 见 dmg.sha256

## 物理上无法代你完成的部分（不是半截停工）

| 项 | 原因 |
|----|------|
| 主聊天流式 B1 | xAI **403 Build coming soon** — 账号无 Grok Build 主会话权限 |
| H1 干净机 | 需要另一台无 Grok 数据的 Mac 或你书面接受开发机等价 |
| H2 | 无第三方 endpoint/key |
| H3 | 需真人麦克风 TCC + 朗读 |
| App 内委派点按录像 | 无障碍自动化点 WebView 内部 React 按钮不可靠；ACP 层已实锤 completed |
| GitHub Release 上传 / 公证 | 需 Developer ID + 公证凭证 + 明确 tag 版本策略（当前已有 v1.0.0；重打同号会冲突） |

## 结论
**机器上能跑的门禁、实机子任务、DMG 候选包：已一次跑完。**  
**账号/真人/证书才能做的：仍堵在外部，代码无法替代。**
