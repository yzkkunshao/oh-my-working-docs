# PRD：多 Tab Claude 克隆插件

> 版本：V0.3（方向大改）
> 状态：核心要点记录中，待后续逐节展开
> 生成方式：prd-writing skill + grill-me 逐节审查

## 背景

- Claude Code CLI 为单会话、单配置形态，无法同时并行运行多个独立会话（不同 API key、不同上下文、不同任务）
- 实际开发中需要在一个界面内并行多个 Claude 会话，且能按需切换配置
- 业务相关内容（开发阶段、PRD 模板、软件研发过程文档等）**都属于模板**，插件本身不绑定任何业务逻辑，只提供运行容器
- 因此构建 **多 Tab Claude 克隆插件**：多 tab 对话、每 tab 独立 session 进程、内置配置切换（cc switch）

## 需求

### 功能性需求

- 多 tab：用户可开多个对话 tab，每个 tab 是一个独立的 Claude 会话
- 每 tab 的 session 进程互相独立（进程隔离，互不影响）
- 内置 cc switch：可切换 Claude Code 配置（API key / baseURL / 模型等）
- 所有业务相关内容都属于模板：插件不内置业务，业务以模板形式由外部提供，插件只负责承载运行

### 非功能性需求

- （待审查填充）

## 名词解释

- **Tab**：插件内的一个对话标签页，对应一个独立的 Claude session / 进程
- **Claude 克隆**：对标 Claude Code CLI 的会话形态，但以多 tab 形式集成在 VS Code 内
- **cc switch**：Claude Code 配置切换，指切换 API key / baseURL / 模型等配置
- **模板**：业务相关的可配置内容（如阶段、PRD 模板、过程文档），由外部提供，插件不内置

## 核心问题

- 在一个插件内实现多 tab 并行、每 tab 独立 session 进程、配置可切换（cc switch），且不影响正在运行的 Claude Code CLI

## 方案设计

- （待审查填充）

## 模块

- （待审查填充）

## 数据流向

- （待审查填充）

## 业务规则

- （待审查填充）
