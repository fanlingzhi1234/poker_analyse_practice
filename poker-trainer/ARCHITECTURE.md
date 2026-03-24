# Poker Trainer Architecture (MVP v0.1)

## 1. 架构结论
采用 **模块化单体（Modular Monolith）**，形态为 **Web App + API + 独立计算核心包**。

### 推荐栈
- Frontend: Next.js + React + TypeScript + Tailwind/shadcn
- API: Node.js + TypeScript（Fastify 或 NestJS）
- Core: 独立 `poker-core` 计算包
- Monorepo: pnpm workspace / turbo（可选）

### 为什么不做微服务
- MVP 阶段需求还在收敛
- 计算与业务强耦合，拆服务收益低
- 部署和维护成本不值得

### 当前 MVP 收敛约束
- 只做 **单对手** 分析与训练
- 暂不扩展到多对手 equity / 多对手范围建模

---

## 2. 模块划分

## 2.1 Frontend
职责：
- 牌面输入
- 范围选择
- 参数校验与展示
- 结果可视化
- 对比训练交互

核心组件：
- `CardPicker`
- `BoardEditor`
- `RangePresetSelector`
- `ResultSummaryCard`
- `HandExplainCard`
- `RecommendationCard`

## 2.2 API Layer
职责：
- 请求校验
- Scenario 组装
- 调用计算引擎
- 聚合返回 DTO
- 未来可加入缓存

建议接口：
- `POST /api/analyze`
- `POST /api/compare`（可后置）
- `GET /api/ranges/presets`

## 2.3 poker-core
职责：
- 牌编码与去重
- Hand evaluator
- Draw analyzer
- Equity engine
- Probability analyzer

## 2.4 range-parser
职责：
- 预设范围定义
- 文本范围解析
- combo 展开
- 权重处理（v1 可先简化为均匀权重）

## 2.5 rule-engine
职责：
- 根据 equity、牌力、board texture、多人池情况
- 输出 heuristic action + reasons

---

## 3. 核心数据模型

```ts
type Suit = 's' | 'h' | 'd' | 'c';
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A';

interface Card {
  rank: Rank;
  suit: Suit;
  code: string; // As, Td
  id: number;
}

interface HeroHand {
  cards: [Card, Card];
}

interface BoardState {
  flop?: [Card, Card, Card];
  turn?: Card;
  river?: Card;
}

interface Combo {
  cards: [Card, Card];
  weight: number;
}

interface RangeDefinition {
  source: 'preset' | 'text';
  raw: string;
  combos: Combo[];
}

interface ScenarioInput {
  heroHand: HeroHand;
  board: BoardState;
  villainRanges: RangeDefinition[];
  playerCount: number;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  potSize?: number;
  callAmount?: number;
}
```

---

## 4. 计算引擎设计

## 4.1 Card / Deck 基础层
功能：
- 牌编码
- 手牌冲突校验
- 剩余牌组生成

## 4.2 Hand Evaluator
功能：
- 评估 5~7 张牌最终牌型
- 支持 kicker 比较
- 输出可比较 rank

这是可信度最高优先级模块，必须重单测。

## 4.3 Draw Analyzer
功能：
- 识别当前 made hand
- 识别 flush draw / OESD / gutshot / combo draw
- 为解释层提供结构化特征

## 4.4 Equity Engine
### 采用混合策略
- **枚举**：river / turn / 小范围 / 少对手场景
- **Monte Carlo**：flop / preflop / 多人池 / 宽范围场景

### 自适应策略
- 组合规模小：精确枚举
- 组合规模大：自动降级 Monte Carlo

### Monte Carlo 默认建议
- 快速：5,000 samples
- 标准：20,000~50,000 samples
- 精确：100,000+

返回中应包含：
- winRate
- tieRate
- loseRate
- mode（exact / estimated）
- sampleCount
- 可选 ci95

---

## 5. Rule Engine 设计

### 目标
输出教学级而非 solver 级建议。

### 输入特征
- equity
- hand category
- draw strength
- player count
- board texture
- pot odds（v1 可选接入）

### 输出
```ts
interface Recommendation {
  action: 'fold' | 'call' | 'raise' | 'check';
  confidence: number;
  reasons: string[];
}
```

### 设计原则
- 规则配置化，不把逻辑散落硬编码
- 每个建议都必须附原因
- 文案明确为 heuristic

---

## 6. 工程目录建议

```text
poker-trainer/
  apps/
    web/
    api/
  packages/
    shared-types/
    poker-core/
    range-parser/
    rule-engine/
  docs/
    ADRs/
```

---

## 7. API 草案

## 7.1 POST /api/analyze
请求：
```json
{
  "heroHand": ["As", "Ks"],
  "board": ["Qh", "Js", "5d"],
  "playerCount": 6,
  "rangePreset": "any-two"
}
```

响应：
```json
{
  "equity": {
    "winRate": 0.28,
    "tieRate": 0.03,
    "loseRate": 0.69,
    "mode": "estimated",
    "sampleCount": 20000
  },
  "hand": {
    "category": "high-card",
    "draws": ["gutshot"],
    "notes": ["当前未成手", "依赖后续改良"]
  },
  "recommendation": {
    "action": "call",
    "confidence": 0.56,
    "reasons": ["存在听牌潜力", "多人池下边缘权益有限"]
  }
}
```

---

## 8. 性能与验证

## 8.1 性能目标
- 常见单场景分析：< 1s
- 复杂多人池分析：尽量 < 2s
- UI 交互避免每次点牌即重算，建议显式点击分析

## 8.2 正确性验证
优先级最高：
1. evaluator 单测
2. range parser 单测
3. equity regression cases
4. 与成熟实现做 golden test 对拍

---

## 9. ADR 结论

### ADR-001
采用模块化单体，而不是微服务。

### ADR-002
采用枚举 + Monte Carlo 混合算法，而不是单一策略。

### ADR-003
行动建议用可解释 heuristic 规则引擎，而不是 solver / ML。

---

## 10. 目前最合理的开发策略
先确保三件事：
1. 计算结果正确
2. 对手范围切换可理解
3. 输出解释足够像“教练”而不是“计算器”

在这三件事没做稳之前，不应该上复杂功能。