# NOTION_WORKFLOW.md - B哥的 Notion 收纳协议 v1.0

## Purpose

当 B哥 发送链接、文章、报告、产品点子、研究资料或阶段性结论时，目标不是简单“存一下”，而是把内容整理成：
- 可检索
- 可分类
- 可回看
- 可复用
- 可沉淀为记忆

本协议定义：什么值得进 Notion、怎么命名、怎么打标签、怎么判断是否值得长期保留。

## Collection Principles

默认 Notion 不是“资料垃圾桶”，而是 **有筛选的工作知识库**。

### 值得进入 Notion 的内容
- 高信息密度的文章、报告、研究资料
- 对投资、产品、架构、行业判断有参考价值的内容
- 能形成长期复用的框架、方法、清单、结论
- 与 B哥 正在推进的项目、研究主题、决策问题直接相关的内容
- 经过分析后，已经产生结构化摘要、关键数据、标签和判断的内容

### 不值得进入 Notion 的内容
- 纯时效性短讯，过时即失效
- 噪音高、信息密度低的内容
- 纯情绪表达、无结构价值的帖子
- 没有分析价值、没有后续复用价值的一次性链接
- 与 B哥 当前目标明显无关的普通浏览内容

## Default Workflow

当收到一个链接或内容时，默认执行：

1. 先按 `LINK_WORKFLOW.md` 完成分析
2. 判断是否值得进 Notion：值得 / 一般 / 不值得
3. 如果值得或一般，再生成收纳结构
4. 补充标题、摘要、标签、内容类型、用途、状态
5. 再判断是否同步进入长期记忆或只保留在 Notion

## Database Design v1.0

在 Notion 里，默认建议采用一个主数据库：**Knowledge Inbox / 知识收纳库**

### 建议字段
- **Title**：条目标题
- **Type**：内容类型
  - Article
  - Report
  - News
  - Opinion
  - Tutorial
  - Case Study
  - Product Idea
  - Research Note
  - Architecture Note
- **Theme Tags**：主题标签
  - AI / 投资 / 产品 / 架构 / 汽车 / 硬件 / 效率 / 创业 / 行业研究 ...
- **Use Tags**：用途标签
  - 产品灵感 / 投资参考 / 架构参考 / 行业研究 / 写作素材 / 决策输入 ...
- **Status**：状态
  - Inbox / Read / Analyzed / Archived / Follow-up
- **Source URL**：原始链接
- **Source Name**：来源站点/作者/机构
- **Summary**：简要摘要
- **Key Points**：核心观点
- **Key Data**：关键数据与出处
- **My Judgment**：我的判断
- **Worth Saving**：是否值得长期保留（Yes / No / Maybe）
- **Memory Level**：
  - None
  - Daily
  - Long-term
- **Created At**：收录时间
- **Related Project**：关联项目（如有）

## Title Rules

默认标题不要太口语，优先采用：

### 对文章/链接
**[主题] 具体标题**
示例：
- [AI Agent] OpenAI 新代理框架解读
- [投资] 美债收益率变化对科技股估值的影响
- [产品] Notion AI 的功能边界与用户价值

### 对研究整理
**[研究] 主题 - 结论导向标题**
示例：
- [研究] AI Coding Agent 的产品分层判断
- [研究] 车载投影市场的供给链变化

### 对点子/方案
**[Idea] 点子名 / 问题名**
示例：
- [Idea] 面向高信息摄入者的智能知识收纳助手

## Tagging Rules

标签默认分三层，不建议只打一堆平级 tag。

### 1. 主题标签（Theme）
回答“这是什么领域”
- AI
- 投资
- 产品
- 架构
- 汽车
- 硬件
- SaaS
- 效率
- 创业
- 行业研究

### 2. 用途标签（Use）
回答“这东西拿来干嘛”
- 产品灵感
- 投资参考
- 架构参考
- 研究输入
- 决策支持
- 写作素材
- 待验证假设
- 行业跟踪

### 3. 状态标签（Status）
回答“现在处于什么阶段”
- Inbox
- Read
- Analyzed
- Follow-up
- Archived

## Save Decision Rules

### 结论为“值得”时
默认应：
- 进入 Notion
- 附结构化摘要
- 打完整标签
- 视情况进入记忆系统

### 结论为“一般”时
默认应：
- 可进入 Notion，但内容简化
- 不一定进入长期记忆
- 主要作为备查资料

### 结论为“不值得”时
默认应：
- 不入库，除非 B哥 明确要求保留

## Memory Coordination

Notion 和记忆系统分工不同：

### Notion
更像结构化外部知识库，适合：
- 存资料
- 存分析
- 存项目研究
- 存长期检索内容

### `memory/YYYY-MM-DD.md`
更像工作日志，适合：
- 当天看过什么
- 想了什么
- 做了什么判断
- 哪些内容还待跟进

### `MEMORY.md`
更像长期偏好与稳定认知，适合：
- B哥 的稳定偏好
- 长期持续主题
- 被多次验证的重要结论
- 长期项目方向

## Default Output When Preparing for Notion

当我判断内容值得进入 Notion 时，可默认输出：

1. **Notion 标题建议**
2. **内容类型**
3. **主题标签**
4. **用途标签**
5. **状态**
6. **摘要**
7. **核心观点**
8. **关键数据/出处**
9. **我的判断**
10. **记忆建议：None / Daily / Long-term**

## Versioning

当前版本：**v1.0**

后续迭代方向：
- 根据真实入库次数优化字段
- 看是否需要拆成多个数据库
- 看标签体系是否过粗或过细
- 看哪些内容最值得自动化进入 Notion

## Principle

Notion 的目标不是囤积，而是形成 **可复用的第二大脑索引层**。

要避免两种失败：
- 什么都存，最后无法检索
- 分析很多，但没有统一结构，无法积累
