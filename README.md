# gorkX

**独立桌面 Agent** — 体验对齐 Codex 指挥台；**内核 = 开源 Grok Build**（App 自管 `GROK_HOME`，可捆绑引擎）。

**当前版本：0.4.0**

| | |
|--|--|
| **产品** | gorkX — 项目 · 任务 · 权限 · 审阅 · 记忆 · 已安排 · 扩展 |
| **引擎** | Grok Build（ACP stdio） |
| **许可** | Apache-2.0 |
| **平台** | macOS Apple Silicon first |

---

## 截图

<p align="center">
  <img src="docs/screenshots/00-icon.png" width="96" alt="gorkX icon" />
</p>

### 主界面 · 项目与对话

![主界面](docs/screenshots/02-main.jpg)

### 审阅面板

![审阅](docs/screenshots/03-review.jpg)

### 记忆管理

![记忆](docs/screenshots/01-memory.jpg)

---

## 0.4.0 要点

- **Hermes 式记忆（真链路）**：默认开启；`USER.md` / `AGENT.md` / 项目 `MEMORY.md`；**新任务首次提问注入**；**自动学习**写会话沉淀；「记一条」立即落盘  
- **界面**：浅色产品壳、侧栏线框图标、Grok+X 应用图标  
- **诚实能力表**：见 [`docs/FEATURES.md`](docs/FEATURES.md) — 不做假成品  
- Composer 发送/停止融合、模型·努力·权限紧凑控件、语音（环境支持时）

---

## 开发

```bash
cd apps/desktop
npm install
npm run tauri dev
```

可选引擎：

```bash
export GORKX_GROK_CMD=/path/to/grok
npm run tauri dev
```

数据目录（默认）：

`~/Library/Application Support/gorkX/`  
· `gorkx.db` — 任务索引  
· `grok-home/` — 引擎会话、登录、**memory/**

## 构建

```bash
./scripts/mac-build.sh
# 或
cd apps/desktop && npm run build:app
```

## 文档

- [`docs/INDEPENDENT_APP_PLAN.md`](docs/INDEPENDENT_APP_PLAN.md) — 产品主线  
- [`docs/FEATURES.md`](docs/FEATURES.md) — 真 / 半 / 规划  
- [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) — 路线图  

## License

Apache-2.0
