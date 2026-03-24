# Poker Trainer V1 / V2 阶段摘要与续接说明

## 1. 项目当前定位

Poker Trainer 是一个面向 **单对手德州扑克训练** 的学习工具。

它的定位不是职业级 solver，而是：

- 用于复盘
- 用于训练范围感与牌感
- 用于理解某手牌在某个牌面和某个对手范围下的大致 equity
- 用于得到教学型建议和解释

---

## 2. V1 已完成内容

### 基础工程骨架
- monorepo 结构搭建完成
- `apps/api` / `apps/web` / `packages/*` 分层完成
- TypeScript 基础构建跑通

### 扑克核心能力
- Card / Deck 基础模块
- 5~7 张牌 hand evaluator
- 手牌强弱比较
- 听牌识别（flush draw / OESD / gutshot / combo draw / overcards）
- 单对手 Monte Carlo equity 计算

### 范围系统基础能力
- 基础 preset
- rangeText 解析
- combos 展开

### API
- `/health`
- `/api/analyze`
- 单对手分析逻辑
- 教练式 explanation 基础结构

### Web MVP
- 输入页与结果页骨架
- 点牌器
- 说明 / 反馈弹窗
- 结果页视觉优化

---

## 3. V2 已完成内容

### V2 Phase 1：概率分析增强（已闭环）
1. `poker-core` 新增最终牌型分布计算
2. `api` 返回 `futureHandDistribution`
3. `web` 展示最终牌型分布可视化

### V2 Phase 2：对手范围系统（当前已推进一大段）
已完成：
- 正式 preset 数据升级
- 中文名 / 中文解释 / 宽度标签 / 类别 / 代表牌型 / 训练提示
- `/api/ranges/presets`
- 范围说明卡
- 中文快捷范围 chips
- 按类别展示更多范围
- 分类筛选器（当前基础版）
- 高级 Range Text 折叠
- 范围对比面板

---

## 4. 当前页面的重要能力

### 输入区
- 点牌器（Hero / Board）
- 两级选牌（先花色，后点数）
- 快捷范围
- 分类范围选择
- 高级文本范围折叠输入

### 结果区
- 主结论卡
- Win / Tie / Lose 拆解
- 当前牌力与听牌
- 教练解释
- 最终牌型分布
- 范围对比
- 当前分析假设

---

## 5. 当前约束（非常重要）

### 当前明确只做
- **单对手分析**

### 当前明确不做
- 多对手建模
- GTO / Solver 级最优策略
- 复杂下注树
- ICM / 锦标赛模型

---

## 6. 已形成的关键设计文档

### 对手范围系统设计
- `poker-trainer/RANGE_SYSTEM_V2.md`

### V2 路线图
- `poker-trainer/V2_PLAN.md`

### 你现在正在看的 handoff 文件
- `poker-trainer/V1_V2_HANDOFF.md`

---

## 7. 当前开发纪律

项目现在默认遵守：

1. 每一步功能升级单独 commit
2. 每次关键改动先验证（测试 / build）
3. 每次改动 push 到远端

远端仓库：
- <https://github.com/fanlingzhi1234/poker_analyse_practice.git>

---

## 8. 已完成的重要 commit（阶段性）

这里只记录代表性里程碑，不记录所有 commit：

- `cb3a791` `feat(poker-trainer): bootstrap single-opponent analyzer MVP`
- `fd0288e` `feat(web): add modal card picker for hero and board selection`
- `18631e1` `feat(web): switch card picker to two-step suit-rank selection`
- `a4ea996` `feat(web): enhance result page visual hierarchy and cards`
- `36e03a0` `feat(explanation): add coach-style explanation and visual insights`
- `28a5917` `feat(range): add v2 preset metadata and preset listing API`
- `e04bdad` `feat(probability): add future hand distribution engine`
- `7a24c7f` `feat(api): expose future hand distribution in analyze response`
- `dcc8132` `feat(web): visualize future hand distribution in results`
- `7d7c5fe` `feat(web): add category-based range filter builder`
- `4048a10` `feat(web): add opponent range comparison panel`

---

## 9. 当前最适合进入的下一阶段（V3 讨论起点）

如果进入 V3，建议优先讨论以下方向：

### V3 方向候选
1. 训练工作台增强
   - 结果区展示当前 Hero / Board
   - 一键重置 / 常见场景模板
   - 场景切换更顺手

2. 对手范围系统继续深化
   - 更多低频筛选项收纳到“更多”中
   - 范围比较进一步增强
   - 自定义筛选组合可视化

3. 建议系统继续升级
   - 更细的训练建议
   - 更强的“为什么建议会变化”解释

4. 历史记录 / 训练记录
   - 保存最近分析
   - 便于复盘和持续训练

---

## 10. 推荐的 V3 起手问题

开启新对话时，推荐从下面这类问题开始，而不是重复描述整个项目背景：

### 建议开场方式
> 继续 Poker Trainer 项目。当前状态请以 `poker-trainer/V1_V2_HANDOFF.md`、`poker-trainer/V2_PLAN.md`、`poker-trainer/RANGE_SYSTEM_V2.md` 为准。我们现在开始讨论并推进 V3。先评估最适合优先落地的 V3 功能，并给出任务拆解。 

---

## 11. 压缩摘要（超短版）

如果只需要一句话概括当前状态：

> Poker Trainer 已完成单对手德州训练工具的 V1 与 V2 第一阶段 / 第二阶段大部分功能，包括：点牌器、单对手 Monte Carlo equity、最终牌型分布、中文对手范围系统、分类筛选器、范围对比、教练式解释和结果页可视化；下一步可以进入 V3，重点讨论训练工作台增强、对手范围系统深化、建议系统升级或历史记录能力。 
