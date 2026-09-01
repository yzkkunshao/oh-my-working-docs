# ccswitch与Claude Code集成方案设计

**Session ID:** ses_fc9ac6d9effexOzVifwHjTteDt
**Created:** 2026/8/25 08:30:41
**Updated:** 2026/8/25 08:31:44

---

## User

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.


Base directory for this skill: C:\Users\余泽坤\.config\opencode\skills\grill-me
Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.

d:\project\oh-my-working-docs\docs\PRD.md 方案设计更新：技术选型：1. 集成ccswitch 2.集成 @anthropic-ai/claude-code npm包，通过cc Swtich 的命令行 ccs 搭配@anthropic-ai/claude-code 实现进程间隔离，和Claude Code 配置隔离，src/bridge就是我选择内嵌@anthropic-ai/claude-code的决策理由, 通过搭配ccs+Claude code cli 作为我的后端，整个方案只需要实现vscode webview,只改方案设计，其他不改

---

## Assistant

**Tool: skill**

---

## Assistant





**Tool: read**

**Tool: read**

---

## Assistant





**Tool: read**

**Tool: read**

---

## Assistant

**Tool: read**

**Tool: read**

**Tool: bash**

---

## Assistant

**Tool: bash**

**Tool: bash**

---

## Assistant





**Tool: websearch**

**Tool: websearch**

---

## Assistant

I've reviewed the current PRD (`docs/PRD.md`) and the git history. Before grilling you, let me pin down one factual ambiguity about the tooling ecosystem.

**Tool: websearch**

**Tool: websearch**

---

## Assistant

我已研究完当前 PRD（V0.3）和关键生态事实。开始逐个追问，先解决最底层的依赖项。

**第一个问题：你说的 "ccs" 到底是哪个工具？**

探索发现关键事实：

- PRD 里说的 **CC Switch**（farion1231/cc-switch）是一个 **桌面 GUI 应用**，数据存 `~/.cc-switch/cc-switch.db`（SQLite），切换时重写 `~/.claude/settings.json`。**它没有 `ccs` 命令行**。
- 带 `ccs` 命令的是另一批工具：
  - `MakFly/ccm-manager`：`ccs run <provider>` 可用指定 provider 启动 Claude 而不全局切换，`ccs sync` 可同步 skills/agents/CLAUDE.md
  - `@d3oxy/cc-switch`：`ccs switch <name>`，只管 OAuth 账号切换
  - `venkycs/cc-switch`：`ccs use`，侧重 OpenRouter
- `SaladDay/cc-switch-cli`（命令名是 `cc-switch` 而非 `ccs`）：有 `provider export <id>` 导出独立 settings 文件、`start claude <id>` 不全局切换直接启动——最贴合"每 tab 独立配置"诉求。

这直接影响模板模型、密钥存储、以及插件是"集成外部 CLI"还是"内嵌实现"。

我的推荐：**如果你说的"集成 ccswitch"是把它当作模板存储后端**（模板 = ccs 里的 provider 配置，插件调用其 CLI 导出/读取配置），那么推荐 `MakFly/ccm-manager`（因为它命令名就叫 `ccs`，且支持 `ccs run` 按 provider 启动、`ccs sync` 同步 skills）。

但请注意一个关键点：**无论选哪个 ccs，运行时真正实现"进程+配置双隔离"的机制是 `CLAUDE_CONFIG_DIR` 环境变量 + 每个 tab 独立的 `settings.json` env 块**（这是 Claude Code 官方机制，已被验证可实现多实例完全隔离）。ccs 只解决"模板配置从哪来"。

那么，你说的 ccs 具体指哪个工具？

---

