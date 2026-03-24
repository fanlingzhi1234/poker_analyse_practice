# poker_analyse_practice

一个面向 **单对手德州扑克训练** 的学习工具（Poker Trainer）。

当前项目重点不是做职业级 solver，而是帮助用户：

- 输入 Hero 手牌与公共牌
- 选择或构造对手范围
- 计算当前 equity（权益）
- 查看最终牌型分布
- 获得教学型建议与解释
- 对比不同对手范围下的结果变化

---

## 当前能力

### 1. 基础分析能力
- 单对手 Monte Carlo 胜率计算
- Win / Tie / Lose 拆解
- Equity 计算
- 手牌牌型识别
- 听牌识别（同花听牌、两头顺、卡顺、组合听牌等）

### 2. 解释与建议
- 教练式解释结构
- 当前优势 / 风险 / 训练重点
- 教学型动作建议（弃牌 / 过牌 / 跟注 / 加注倾向）

### 3. 概率增强（V2 已完成第一阶段）
- 最终牌型分布（Future Hand Distribution）
- 按街道推测最终可能形成的牌型概率
- Web 结果页概率条可视化

### 4. 对手范围系统（V2 正在推进）
- 中文快捷范围 preset
- 范围说明卡
- 高级 `Range Text` 折叠输入
- 分类筛选器（口袋对子 / 百老汇牌 / 同花牌 / 同花连张 / A 牌结构）
- 范围对比面板

### 5. 交互体验
- 点牌器（Hero / Board）
- 两级选牌弹窗（先花色，再点数）
- 页面说明弹窗
- 反馈弹窗（默认收件人：`cq.fanlingzhi@gmail.com`）

---

## 本地启动

项目目录：

```bash
cd /Users/Reuxs/.openclaw/workspace/poker-trainer
```

### 启动 API
```bash
corepack pnpm --filter api dev
```

默认地址：

```bash
http://localhost:8787
```

健康检查：

```bash
curl http://localhost:8787/health
```

### 启动 Web
```bash
cd /Users/Reuxs/.openclaw/workspace/poker-trainer
corepack pnpm --filter web dev
```

默认地址：

```bash
http://localhost:3000
```

如果 3000 被占用，以终端输出的 `Local:` 地址为准。

---

## 一条命令双开（本地开发）

```bash
cd /Users/Reuxs/.openclaw/workspace/poker-trainer && \
(corepack pnpm --filter api dev) & \
(corepack pnpm --filter web dev) & \
wait
```

---

## API 示例

### 分析一手牌
```bash
curl -X POST http://localhost:8787/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "heroHand": ["As", "Kd"],
    "board": ["Qh", "Js", "5d"],
    "rangePreset": "standard",
    "iterations": 5000,
    "rngSeed": 1337,
    "playerCount": 2
  }'
```

### 获取对手范围 preset 列表
```bash
curl http://localhost:8787/api/ranges/presets
```

---

## 项目结构

```text
poker-trainer/
  apps/
    api/              # 分析 API
    web/              # Web 前端
  packages/
    poker-core/       # 扑克计算核心
    range-parser/     # 对手范围系统
    rule-engine/      # 建议逻辑（保留扩展位）
    shared-types/     # 共享类型
  RANGE_SYSTEM_V2.md  # 对手范围系统设计文档
  V2_PLAN.md          # V2 规划文档
  V1_V2_HANDOFF.md    # V1/V2 阶段总结与 v3 续接摘要
```

---

## 关键文档

### 对手范围系统设计
- `poker-trainer/RANGE_SYSTEM_V2.md`

### V2 路线图
- `poker-trainer/V2_PLAN.md`

### 当前阶段 handoff / 摘要
- `poker-trainer/V1_V2_HANDOFF.md`

---

## 当前产品边界

### 已明确支持
- 单对手分析
- Monte Carlo 概率估算
- 中文化对手范围系统
- 教学型建议和解释

### 暂不支持
- 多对手建模
- GTO / Solver 级最优策略
- 复杂下注树
- 账户与云同步

---

## 当前开发纪律

从当前版本开始，项目默认遵守以下规则：

- 每一步功能升级单独 commit
- 每次关键改动先验证（测试 / build）
- 每次改动 push 到远端 GitHub

远端仓库：

- <https://github.com/fanlingzhi1234/poker_analyse_practice.git>
