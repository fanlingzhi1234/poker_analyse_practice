# Poker Trainer Tasks (MVP v0.1)

## 当前阶段
**只做设计确认，不开始编码。**

---

## Phase 0: 设计确认

### Step 1: 冻结产品边界
- Output: `PRD.md` 确认版
- Test: 用户确认 v1 做什么 / 不做什么

### Step 2: 冻结技术架构
- Output: `ARCHITECTURE.md` 确认版
- Test: 用户确认 Web App + 模块化单体 + 混合算法路线

### Step 3: 冻结开发任务拆分
- Output: `TASKS.md` 确认版
- Test: 用户确认执行顺序和优先级

---

## Phase 1: 项目骨架（确认后执行）

### Step 4: 建立 monorepo 骨架
- Output:
  - `apps/web`
  - `apps/api`
  - `packages/shared-types`
  - `packages/poker-core`
  - `packages/range-parser`
  - `packages/rule-engine`
- Test:
  - workspace 能安装依赖
  - 基础脚本可运行

### Step 5: 建共享类型
- Output:
  - Card / Hand / Board / Range / Scenario / Result 类型定义
- Test:
  - TS 类型检查通过

---

## Phase 2: 计算核心（确认后执行）

### Step 6: Card / Deck 基础模块
- Output:
  - 牌编码
  - 冲突检测
  - 剩余牌生成
- Test:
  - 单元测试覆盖基本去重与生成逻辑

### Step 7: Hand Evaluator
- Output:
  - 5~7 张牌型评估
  - rank compare
- Test:
  - 经典牌型用例通过
  - kicker / split pot / board play 用例通过

### Step 8: Draw Analyzer
- Output:
  - made hand 检测
  - flush draw / OESD / gutshot / combo draw 检测
- Test:
  - 指定牌面输入输出符合预期

### Step 9: Equity Engine v1
- Output:
  - 枚举模式
  - Monte Carlo 模式
  - 统一 analyze 接口
- Test:
  - 固定输入结果稳定
  - 简单场景与参考结果近似一致

---

## Phase 3: 范围系统（确认后执行）

### Step 10: 预设范围定义
- Output:
  - any-two / loose / standard / tight / premium
- Test:
  - 每个预设都能展开为合法 combos

### Step 11: 文本范围解析器
- Output:
  - 支持 `22+`, `AJs+`, `KQo` 等基础语法
- Test:
  - 解析结果 combo 数正确
  - 非法语法报错清晰

---

## Phase 4: API 与规则建议（确认后执行）

### Step 12: Analyze API（单对手）
- Output:
  - `POST /api/analyze`
- Test:
  - 能接收 scenario 并返回单对手分析结果 DTO

### Step 13: Rule Engine v1
- Output:
  - heuristic action recommendation
  - reasons[] explanation
- Test:
  - 典型场景下建议和解释不离谱

---

## Phase 5: 前端 MVP（确认后执行）

### Step 14: 输入页
- Output:
  - 桌型选择器
  - 手牌/公牌选择器
  - 范围预设选择器
- Test:
  - 能完整输入一手局面

### Step 15: 结果页
- Output:
  - 胜率卡
  - 牌力/听牌卡
  - 行动建议卡
  - 解释卡
- Test:
  - 输入有效场景后能展示完整结果

### Step 16: 对比训练交互
- Output:
  - 切换玩家人数/范围后重算
- Test:
  - 同一场景能快速比较多个结果

---

## Phase 6: 验证与打磨（确认后执行）

### Step 17: Correctness 回归
- Output:
  - evaluator regression cases
  - equity golden tests
- Test:
  - 核心用例通过率达标

### Step 18: 性能优化
- Output:
  - debounce / sample tuning / 缓存基础支持
- Test:
  - 常见分析 < 1s

### Step 19: 文案与解释打磨
- Output:
  - 用户可读解释模板
- Test:
  - 结果不像黑盒计算器

---

## 建议的 subagent 分工（确认后才正式启动）

### 子任务 A：产品 / PRD
- 负责：PRD、页面信息架构、文案框架

### 子任务 B：技术架构
- 负责：模块边界、API 草案、目录结构、ADR

### 子任务 C：计算核心
- 负责：poker-core、evaluator、equity engine

### 子任务 D：范围系统
- 负责：preset ranges、range parser

### 子任务 E：前端交互
- 负责：输入页、结果页、对比训练交互

### 子任务 F：规则建议
- 负责：heuristic action rules + reasons

---

## 当前建议执行顺序
1. 先确认文档
2. 再建骨架
3. 先做 `poker-core`
4. 再做范围系统
5. 再接 API
6. 最后补前端和解释层

原因：
**这个项目的核心不是 UI，而是“计算正确性 + 可解释输出”。**