# Development and release workflow

This repository defines distinct branch responsibilities across agent environments and release tracks. Treat them as a hard boundary.

## Branch responsibilities

- **`gemini` (Antigravity 开发分支)**:
  - Antigravity 环境的默认开发分支。
  - 在 Antigravity 中开启的所有新任务均从 `gemini` 开始，并在编辑前确认当前 checkout。
  - 在 `gemini` 上进行日常功能开发、缺陷修复、性能调优、单测编写及构建同步。
  - 变更验证通过后提交并推送到 `origin/gemini`。

- **`codex/sites-deploy` (Codex / Sites 专用分支)**:
  - 专供 OpenAI Codex 及 Codex Sites 预览部署使用的独立分支。
  - 保留 Codex Sites 专有构件（`.openai/hosting.json` 与 `dist/`），供 Codex 用于 Sites 预览发布。

- **`main` (Vercel 生产分支)**:
  - 唯一的 Vercel 生产发布分支。
  - 未经用户显式批准前，严禁更新本地 `main`、推送到 `origin/main` 或触发 Vercel 生产部署。
  - 经用户批准后，将验证后的源码变更合入 `main`（不包含 Sites 专有构件），执行 `npm run check:all` 验证后推送 `origin/main`。
  - 严禁对任何分支执行 force-push。

## Validation & Quality gates

- 完成开发任务后，必须执行 `npm run check:all`（涵盖语法检查、全套单元测试与 diff 格式检查）。
- 当源码修改影响部署产物时，确保同步更新 `dist/`。
- 保留不相关的本地工作区文件，默认排除 `.agents/`、`.firecrawl/` 和 `ORIGINAL_REQUEST.md`，除非用户明确要求包含。
