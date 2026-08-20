# PRD：Workflow Agent VS Code 插件

> 版本：V0.2（草稿，审查进行中）
> 状态：逐节审查中，已确认决策以 ✅ 标记
> 生成方式：prd-writing skill + grill-me 逐节审查

## 背景

- 开发者一般会根据任务难度使用不同的模型并行完成不同的任务
- 现有AI编程工具（Claude Code CLI及官方插件）采用单一API密钥配置，无法同时运行不同的 API key完成不同的任务。实际开发中，高频固定任务（如代码审查、文档核对）无需调用昂贵模型，且公司内部密钥与个人密钥各有适用场景，开发者既需要用特定的API key 完成常规任务（编码、对话、文档），也需要在允许的场景调用公司 key（如代码审查）
- 开发者每个开发阶段的存在对应的提示词，应该按照开发阶段去组织管理对应的skill，而不是混合在一起去调用。
- 开发阶段输出的文件文档决策有时不应该上传到对应codebase，应该用软链接（symlink）的方式集成在当前codebase中，同时经常需要回滚
- 因此有必要构建一个 **Workflow Agent VS Code 插件**，按开发阶段组织工作流，提供对话界面，提供更针对性更具效率的提示词管理。给每个阶段可独立配置不同的 API key，且与 Claude Code CLI / 官方插件**并行使用不冲突**



## 需求

### 功能性需求

- ✅ 按开发阶段组织 workflow，**默认四阶段：计划阶段、设计阶段、开发阶段、测试阶段**（与现有 `软件研发过程文档/` 目录结构对齐）
- ✅ 阶段**可定制**：用户可在项目级配置中增加、删除、重命名、重排阶段顺序
- ⏳ 实现基于 tab/session 的快照机制（原「阶段状态机」废弃，改为多 tab 并行，快照粒度按 tab/session）：
  - ⏳ **快照粒度：每个 tab/session 独立维护自己的快照历史**（快照属于会话，回滚只影响该会话）（已确认）
  - ⏳ 快照内容 = **对话上下文 + 输出文件**（两者一起快照才能完整回滚到某个时间点）（待审查，tab 输出落点未定；快照不含阶段模板配置，回滚只恢复对话+输出文件）
  - ⏳ 快照触发时机 = **会话结束时自动 + 用户手动**（原「阶段切换时自动」随串行切换机制一并移除）（待审查，可补充其他触发时机）
  - ✅ 快照清理策略 = **统一按时间淘汰，超过 30 天自动删除**（含手动快照）
  - ✅ 回滚行为：**恢复快照中的输出文件 + 恢复该快照的对话上下文**；回滚本身生成新快照（记录回滚前状态），因此**回滚可撤销**（可再次回滚回到回滚前）
- ✅ 实现基于阶段的配置管理：每个阶段可独立配置 API key（含 baseURL、模型等）
  - ✅ 每阶段配置项：**API key、baseURL、模型、系统提示词、关联 skill 列表**（可选 temperature/maxTokens）
  - ✅ **tab 创建时从阶段模板一次性拷贝配置，之后固定绑定**：API key、baseURL、模型、system prompt、关联 skill 均不随模板后续修改而变化（含 API key 在 vault 中的 secret 引用——tab 创建时固定，不随模板改动）
  - ✅ API key 经 VS Code SecretStorage 录入并注册进 **OneCLI vault**（加密存储，见非功能性需求）；其余配置存**全局目录**
  - ✅ 项目配置文件位置：`~/.workflow-agent/projects/<项目路径转换>/config.json`（即 `docs/.workflow/` 软链接指向的目录，**不在项目内，天然不进 git**）；阶段列表、每阶段 baseURL/模型/系统提示词/关联 skill 列表均在此配置
- ✅ Skill 管理：
  - ✅ 用户自己的 skill：放在 `~/.workflow-agent/skills/`（复用 SKILL.md + 资源文件格式，用户主动放入），插件不碰 `~/.claude/skills/`
  - ✅ Agent 内部 skill：放插件安装目录，**不开放给用户修改**
  - ✅ 阶段配置中的「关联 skill 列表」引用用户 skill 和内置 skill
- ⏳ Agent SDK 会话进程模型：**一个 tab = 一个进程 = 一个 session**（多 tab 并行）。阶段（Stage）仅作为创建 tab 时的**一次性初始模板**（提供初始 system prompt、关联 skill、API key 等配置），创建时拷贝进 tab，之后不随阶段配置变更而更新；**彻底移除「当前激活阶段」的串行切换机制**
  - ✅ tab 关闭：**杀掉对应 SDK 进程，但持久化 `sdk_session_id` + messages 到 storage**，之后可重新打开 tab `{resume}` 续传
  - ✅ 进程数上限/空闲回收：对同时存活的 SDK 进程数**设上限 + 空闲回收**，避免多 tab 耗尽资源（待审查，具体上限值/空闲时长未定）
- 插件与 Claude Code CLI 可同时运行，互不冲突（进程级不冲突：插件用 Agent SDK 跑独立会话，与 CLI 是两套进程/配置）
- 插件内部基于 Claude Agent SDK 实现
- ⏳ 插件为**对话流（Chat Flow）UI**：用户在聊天界面中通过**多 tab** 管理多个独立会话，一个 tab = 一个进程 = 一个 session
  - ✅ UI 技术形态：**VS Code Webview + React 框架**（自定义前端，完全掌控对话 UI、多 tab 管理、快照回滚交互）
- ⏳ 用户通过 tab 新建/管理会话（基于阶段模板），无需重启插件；同一阶段模板可同时创建多个 tab（待审查，tab 输出落点未定）
- ✅ **一个 tab = 一条对话（session）**，无 tab 内对话切换；要新对话即开新 tab，tab 关闭后归档、可重新打开 resume 续传
- ✅ 各 tab/session 对话上下文**互相独立**（隔离）
  - ⏳ 阶段内多 Agent 并行子任务（用不同模型并行执行）：由「多 tab 并行」能力覆盖，无需单独的 V0.2「并行子任务配置」（待审查确认）
- ✅ 项目当前 codebase 目录下创建**文件系统软链接**关联各阶段输出物：
  - ✅ `docs/.workflow/` 整体为软链接，指向全局目录 `~/.workflow-agent/projects/<项目路径转换>/`，因此在项目内可见 `docs/.workflow/config.json` 与 `docs/.workflow/<阶段名>/`（各阶段输出物）
  - ✅ 全局目录路径：`~/.workflow-agent/projects/<项目路径转换>/`，项目路径中特殊字符替换为 `-`（类似 Claude Code CLI 的 `~/.claude/projects` 命名方式，如 `D:\EdgeView\epower2.0` → `D--EdgeView-epower2-0`）
  - ✅ 软链接类型：**目录级链接**；Windows 下用 **junction**（无需管理员权限/开发者模式），非 Windows 用 symlink
  - ✅ 链接指向全局目录，不随阶段切换而变化
  - ✅ 软链接创建时机：**用户在设置面板手动初始化**（点「初始化 workflow」创建 `docs/.workflow/` 链接，含所有已配置阶段）
- ✅ 存储位置分工：
  - 对话上下文 → VS Code `globalStorageUri`（插件标准存储位置）
  - ✅ 快照（含输出文件版本快照 + 对话上下文快照）→ **统一集中存 VS Code `globalStorageUri`**
  - ✅ 输出文件 → 全局目录 `~/.workflow-agent/projects/<项目路径转换>/<阶段名>/`（阶段目录内直接放输出文件，不含快照子目录；软链接后项目内所见即所得）
- ✅ 多项目隔离：每个项目路径对应独立的全局目录与 VS Code storage 命名空间（按项目路径转换隔离），切换工作区即切换整套 workflow 配置与会话，互不干扰

### 非功能性需求

- ✅ **安全性：禁止泄露 API key**，保护机制 = **OneCLI Gateway + 环境变量遮罩**：
  - ✅ **OneCLI Gateway**：插件侧以 Docker 部署 OneCLI Gateway 服务（镜像 `ghcr.io/onecli/onecli:latest`，proxy 端口 10255、dashboard 端口 10254，数据卷由 `SECRET_ENCRYPTION_KEY` 加密），作为所有 Agent SDK 进程出站请求的唯一网关
  - ✅ **HTTPS_PROXY 拦截**：Agent SDK 进程 env 设 `HTTPS_PROXY=http://onecli-gateway:10255`，请求仍发往真实上游（**不改 baseURL**）；gateway 拦截出站 HTTPS，按 **host-pattern** 匹配 vault 中的 secret，**在途改写 Authorization header** 注入真实 key
  - ✅ **占位符**：SDK 进程内仅设 `ANTHROPIC_API_KEY=onecli_placeholder`（满足 SDK 启动要求），**进程不持有、看不到真实 key**
  - ✅ **真实 key 存放**：各阶段 key 在 OneCLI vault 中按 secret 管理（按 host-pattern 区分上游；同一上游时按 agent/进程授权 secret 列表区分阶段），经 VS Code SecretStorage 录入并同步注册
  - ✅ **环境变量遮罩**：key 相关环境变量在日志、Chat Flow UI、错误信息、快照中一律遮罩显示（如 `sk-****xxxx`），禁止任何明文输出
  - ✅ **不落盘明文**：API key 不写入项目目录、全局目录（`~/.workflow-agent/`）、快照及任何日志/配置文件
  - ✅ 与 Claude Code CLI 并行运行时互不读取、互不泄露对方密钥（进程级隔离 + 环境变量遮罩）

## 名词解释

- ⏳ **阶段（Stage）**：开发流程中的一个工作阶段，默认四阶段（计划/设计/开发/测试），可定制增删改排；**仅作为创建 tab 时的「一次性初始模板」**（提供初始 system prompt、关联 skill、API key 等配置），不绑定运行时状态
- ✅ **快照（Snapshot）**：某个时间点上「对话上下文 + 输出文件」的完整副本，用于回滚
- ⏳ ~~**阶段状态机**~~：**已废弃**——记录「当前阶段」+ 每阶段快照历史的机制取消；改为多 tab 并行，无「当前阶段」概念（待审查，快照粒度改为按 tab/session）
- ✅ **全局目录**：`~/.workflow-agent/projects/<项目路径转换>/`，存放各阶段当前输出文件与 `config.json`（项目路径特殊字符替换为 `-`）；快照不在此目录，统一存 VS Code `globalStorageUri`
- ✅ **软链接**：项目内 `docs/.workflow/` 整体指向全局目录，使输出物在 codebase 中可见但不实际占用 codebase 空间
- **Chat Flow UI**：（待审查填充）
- **Claude Agent SDK**：Anthropic 官方 Agent SDK，npm 包 `@anthropic-ai/claude-agent-sdk`，插件内部基于它实现 Agent 会话
- ✅ **OneCLI Gateway**：OneCLI（onecli.sh）的 Agent Vault 网关（Docker 镜像 `ghcr.io/onecli/onecli:latest`），通过 HTTPS_PROXY 拦截 + host-pattern 匹配，在途改写 Authorization header 注入真实 API key；Agent SDK 进程/容器永不持有真实 key

## 核心问题

- ⏳ 多 API key 并行：**核心问题是按 tab/会话并行使用不同 API key 配置，且不影响正在运行的 Claude Code CLI**——现有 AI 编程工具单一 API key 配置无法同时用不同 key 跑不同任务，需按会话独立配置且与 CLI 并行互不干扰
- ⏳ 会话隔离与产物共享：各 tab/session 对话上下文需互相独立，但输出产物需互相可访问（通过软链接共享）（待审查，tab 输出落点未定）
- ✅ 产物回滚：开发阶段输出的文件/决策有时不应进入 codebase，且经常需要回滚，需快照机制支持
- ✅ 与 Claude Code CLI 并行：插件用 Agent SDK 跑独立会话，与 CLI 进程级隔离，互不冲突
- ✅ 提示词按阶段组织：避免混合调用，按开发阶段管理对应 skill（阶段作为 tab 的初始模板）
- **快照清理策略**：密集快照（会话结束+手动）会产生大量快照，如何清理/合并/保留？（待审查）
  - ✅ 已确认：统一按时间淘汰，超过 30 天自动删除（含手动快照）
- ⏳ **会话间数据传递**：一个 tab/session 的产物如何被其他 tab/session 引用/读取？（待审查，tab 输出落点未定）
  - ✅ 已确认（沿用）：全阶段/tab 输出可读、仅当前会话可写（通过软链接 `docs/.workflow/<模板名>/` 访问，Agent 用文件读取工具即可读其他产物，写权限仅限当前会话避免跨会话污染）
- ⏳ **tab 输出落点（未决）**：每个 tab 的 agent 进程 `cwd` 设在哪？同一阶段模板可同时开多个 tab，各自输出文件如何落点与隔离？候选模型：
  - **模型 A（共享阶段目录）**：`cwd` = 阶段目录 `<项目>/<阶段名>/`，同阶段多 tab 共享写该目录做产物归集；回滚靠输出文件快照而非目录切换。优点：软链接直接、产物天然归集；缺点：同阶段多 tab 并发写可能互相覆盖。
  - **模型 B（tab 独立目录 + 显式归集）**：`cwd` = 每 tab 独立目录 `<项目>/sessions/<tab-id>/`，产物先在 tab 内，用户显式「提交/归集」到 `docs/.workflow/<阶段名>/`。优点：tab 完全隔离、回滚干净；缺点：多一步归集操作。
  - **模型 C（阶段目录 + tab 子目录）**：`cwd` = `<项目>/<阶段名>/<tab-id>/`，软链接 `docs/.workflow/<阶段名>/<tab-id>/`。优点：软链接可见每 tab 独立产物、无需手动归集；缺点：软链接层级变深。
  - 倾向：**模型 A 变体**（最贴近已确认软链接形态，避免引入 tab-id 层级；接受同阶段多 tab 产物命名不冲突的假设）

## 方案设计

### 技术选型

| 层 | 选型 |
|---|---|
| 运行时 | **Bun**（`Bun.serve` + `bun:sqlite`） |
| 后端框架 | **Hono**（REST + WebSocket，`hono/bun`） |
| Agent | **`@anthropic-ai/claude-agent-sdk`**（`query()` 流式、`resume` 续传、hooks、appendSystemPrompt） |
| 前端 | **React 18 + Vite + Jotai** + antd/@ant-design/x + react-markdown + remark-gfm + mermaid |
| 数据库 | **bun:sqlite**（sessions/messages 等） |
| 凭据保护 | **OneCLI Gateway**（Docker 外部服务） |
| 测试 | **vitest** + @testing-library/react |

### 架构思路

- 插件分 **Extension 侧**（tab/session 管理、配置、快照、存储、SDK 进程管理）与 **Webview 侧**（React Chat Flow UI，多 tab），经 webview 消息协议通信
- ⏳ **会话模型**：**多 tab 并行**，一个 tab = 一个进程 = 一个 session；`Session` 类管理每个 tab 的 `sdkSessionId` 续传 + 独立 sessions/messages 持久化；阶段仅作 tab 创建时的一次性初始模板，无「当前阶段」串行切换（待审查，tab 输出落点未定）
- ⏳ **阶段系统提示词**：tab 创建时从阶段模板拷贝 system prompt，经 SDK `appendSystemPrompt` 一次性注入；之后阶段配置变更不更新已存在 tab（待审查确认）
- ⏳ **阶段输出物**：SDK 进程 `cwd` 指向全局目录（模板名/阶段名目录），经 `docs/.workflow/` 软链接在项目内可见可读；写权限仅限当前会话（待审查——多 tab 用同一模板时各自输出落点如何隔离/归集未定）
- **技能管理**：用户 skill 放 `~/.workflow-agent/skills/`，内置 skill 放插件安装目录，经 SDK `cwd`/settingSources 注入 agent 进程

### 关键决策

- ⏳ 多 tab 并行：一个 tab = 一个进程 = 一个 session；阶段仅作一次性初始模板，无「当前阶段」串行切换（待审查，tab 输出落点未定）
- ✅ tab 生命周期：tab 关闭即杀进程 + 持久化 `sdk_session_id`/messages，可 resume 续传；SDK 进程数设上限 + 空闲回收
- ⏳ 全模板/会话输出可读、仅当前会话可写（软链接 + cwd 隔离）（待审查，tab 输出落点未定）
- ✅ 真实 API key 永不进入 SDK 进程：进程仅持 `onecli_placeholder` + `HTTPS_PROXY`，由 OneCLI gateway 在途注入
- ⏳ 快照 = 对话上下文（sessions/messages）+ 输出文件版本，统一存 VS Code `globalStorageUri`，超 30 天按时间淘汰；回滚生成新快照（可撤销）（待审查，快照粒度由「阶段」改为「tab/session」）

## 模块

- （待审查填充）

## 数据流向

- （待审查填充）

## 业务规则

- （待审查填充）