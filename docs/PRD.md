# PRD：多 Tab Claude 克隆插件

> 版本：V0.3
> 状态：核心要点记录中，待后续逐节展开
> 生成方式：prd-writing skill + grill-me skill逐节审查

## 背景

- 不同模型之间差异巨大，程序员也同时拥有多个ai token套餐，往往会使用不同的模型处理不同场景的任务（如 GLM做设计、DeepSeek做开发编码、MiniMax做code review等等）
- CC Switch 搭配 Claude Code 去处理不同场景任务时存在一个弊端：**不能同时并行使用多个模型**处理多个场景的任务（CC Switch 为全局切换，同一时刻仅一套配置生效）
- 更好的应用形态：用户可以**同时启用多个对话，每个对话加载不同的配置**——独立使用不同的模型，以及加载不同的 Skills 和 CLAUDE.md
- 需要**把 CC Switch 内置到对话流ai agent工具当中**：构建多 Tab Claude 克隆插件，多 tab 对话、每 tab 独立 session 进程、每 tab 独立加载一套模板配置并行运行

- PRD template engineering 实现每一个template 的scope关联，每个template配置必须通过grill-me skill审查scope是否已经固定

## 需求

### 功能性需求

- 多 tab：用户可开多个对话 tab，每个 tab 是一个独立的 Claude 会话
- 每 tab 的 session 进程互相独立：**每个 tab 启动一个独立 CLI 进程**（进程隔离，互不影响）
- **实现 CC Switch 的功能**（并非完全内置 CC Switch 软件）：
  - 会话开始之前先选择模板，模板选定之前会话禁止开始
  - 会话开始之后，以只读形式展示所选模板与模型
  - 模板包含会话中使用的 Base URL、模型名称以及相关的 Skills 等
  - 模板包括所有 Claude Code 支持的配置，交互上参考 CC Switch
  - per-tab 配置：tab 创建时一次性拷贝模板配置（创建时快照），之后模板修改不影响已开的 tab
  - **模板固定 key**：一个模板绑定一个 API key（SecretStorage 引用）；在模板中修改 key 后，需重新创建会话才生效
- tab 关闭后可恢复：保留会话记录，可重新打开 resume 续传继续对话；恢复时**直接用创建时快照的配置**重建进程，无需重选模板
- 模板管理（V0.3 做完整配置编辑：增删改均为全量 Claude Code 配置编辑器；导入/导出为后续版本特性，届时导出不含 key）
- 与 Claude Code CLI **进程+配置双隔离**：插件不读写 `~/.claude/`（CLAUDE.md、settings.json、skills 均使用插件自有配置），Bridge 会话进程与 CLI 进程互不干扰、可同时运行
- API key 存 VS Code SecretStorage（加密存储，模板文件只存引用，不落明文）
- 所有 tab 的 agent 工作目录（cwd）默认为当前项目根目录

### 非功能性需求

- **安全**：API key 只存 VS Code SecretStorage，不在日志、UI、错误信息中明文输出（一律遮罩显示），不写入任何配置/日志文件
- **性能**：对同时存活的 Bridge 会话进程数设上限 + 空闲回收，避免多 tab 并行耗尽系统资源
- **UI 形态**：VS Code Webview + Vue，面板内自绘多 tab 栏（对话 UI、模板选择、模板管理界面均在面板内实现，交互参考 CC Switch）
- **会话存储**：会话记录（对话历史 + 配置快照）统一存 VS Code `globalStorageUri`

## 名词解释

- **Tab**：插件内的一个对话标签页，对应一个独立的 Claude session（Bridge 会话进程）
- **模板**：一组可复用的 Claude Code 配置集合（涵盖 Claude Code 支持的所有配置），创建 tab 时选择并整体拷贝

## 核心问题

- **多对话并行且各自使用不同配置**：如何让用户同时启用多个对话，每个对话独立使用不同的模型/Base URL/Skills，解决 CC Switch 全局切换"同一时刻仅一套配置生效"、无法并行使用多模型（DeepSeek、MiniMax、GLM 等）的问题
- **与 Claude Code CLI 并行不冲突**：插件内多个 tab 会话如何与正在运行的 Claude Code CLI 进程级隔离，互不干扰、互不读取对方配置与密钥
- **模板高效选择**：如何组织与管理模板配置，使用户在创建会话时能快速、准确地选中想要的模板
- **多 tab 多模板与用户 Claude Code 配置隔离**：多个 tab 各自加载一套模板（多 provider/多 key），如何与用户本机 `~/.claude/` 配置隔离，互不读取、互不覆盖（方案设计待解决）

## 方案设计

### 技术约束：基于 Claude Code Bridge 模式构建（不使用 Agent SDK）

- **决策**：不通过 Claude Agent SDK，而是基于 Claude Code 的 **Bridge（IDE 集成）子系统**构建 IDE 插件
- **Bridge 定义**：Bridge 是连接 Claude Code CLI 与 IDE 扩展（VS Code、JetBrains）的双向通信层，使 CLI 作为后端为 IDE 界面提供能力
- **架构形态**：

```
┌──────────────────┐         ┌──────────────────────┐
│   IDE Extension  │◄───────►│   Bridge Layer       │
│  (VS Code, JB)   │  JWT    │  (src/bridge/)       │
│                  │  Auth   │                      │
│  - UI rendering  │         │  - Session mgmt      │
│  - File watching │         │  - Message routing    │
│  - Diff display  │         │  - Permission proxy   │
└──────────────────┘         └──────────┬───────────┘
                                        │
                                        ▼
                              ┌──────────────────────┐
                              │   Claude Code Core   │
                              │  (QueryEngine, Tools) │
                              └──────────────────────┘
```

- **职责划分**：
  - IDE 扩展（本插件）：UI 渲染、文件监听、Diff 展示
  - Bridge 层：会话管理、消息路由、权限代理；与 IDE 之间通过 JWT 认证
  - Claude Code Core：QueryEngine、Tools（复用 Claude Code 原生能力）
- **决策理由**：Bridge 子系统已实现会话管理、消息路由、权限代理、JWT 认证等 IDE 集成所需的完整通信机制，直接复用可省去大量造轮子的时间
- **复用原则**：基于泄露源码改造，Claude Code 已有能力（resume、Bridge 会话管理、权限代理、MCP、Skills 等）全部原封不动照搬——包括使用方式与内部源码；**仅进程隔离相关功能**需要改造源码（每 tab 启动一个独立 CLI 进程），其余不改
- **Bridge 来源**：插件捆绑自带含 Bridge 的构建（fork 维护），不依赖用户本机 CLI
- **替代方案权衡**：使用 Agent SDK 需自行实现上述通信基础设施，且无法获得 Claude Code 内建的权限体系、Skills、MCP 集成，开发成本显著更高
- **约束条件**：依赖 `src/bridge/` 子系统（受 BRIDGE_MODE 特性开关控制）；CLI 以后端进程形式运行，插件为前端界面

## 模块

- （待审查填充）

## 数据流向

- （待审查填充）

## 业务规则

template 规则，template一个目录只允许一个，避免session冲突：
session 是跟目录绑定的，恢复时只看到该目录的会话。所以两个 session 放在同一个目录并行 → 它们会同时改同一份文件，最后互相覆盖、git 状态一团糟。想真并行就必须 git worktree 各占一个目录

- （待审查填充）
