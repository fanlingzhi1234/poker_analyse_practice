'use client';

import { useMemo, useState } from 'react';

type AnalyzeResponse = {
  assumptions: {
    mode: 'single-opponent';
    playerCountReceived: number;
    playerCountApplied: number;
    rangeSource: 'preset' | 'text';
  };
  equity: {
    winRate: number;
    tieRate: number;
    loseRate: number;
    equity: number;
    sampleCount: number;
    mode: 'estimated';
  };
  hand: {
    madeHand: string;
    draws: string[];
    overcards: number;
    notes: string[];
  };
  recommendation: {
    action: 'fold' | 'check' | 'call' | 'raise';
    confidence: number;
    reasons: string[];
  };
};

type PickerTarget =
  | { area: 'hero'; index: 0 | 1 }
  | { area: 'board'; index: 0 | 1 | 2 | 3 | 4 };

const presetOptions = ['any-two', 'loose', 'standard', 'tight', 'premium'] as const;
const validRanks = new Set(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']);
const validSuits = new Set(['s', 'h', 'd', 'c']);
const rankOrder = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const suitOrder = ['s', 'h', 'd', 'c'] as const;
const allCards = rankOrder.flatMap((rank) => suitOrder.map((suit) => `${rank}${suit}`));

const exampleScenarios = {
  default: {
    label: '默认示例',
    heroHandInput: 'As Kd',
    boardInput: 'Qh Js 5d',
    rangePreset: 'standard' as const,
    rangeText: '',
    iterations: '5000',
    playerCount: '2',
    rngSeed: '1337',
  },
  premiumFlip: {
    label: 'AA 对 premium 范围',
    heroHandInput: 'As Ah',
    boardInput: '2c 7d 9h',
    rangePreset: 'premium' as const,
    rangeText: '',
    iterations: '5000',
    playerCount: '2',
    rngSeed: '42',
  },
  customRange: {
    label: '自定义范围示例',
    heroHandInput: 'As Kd',
    boardInput: 'Qh Js 5d',
    rangePreset: 'standard' as const,
    rangeText: 'TT+,AJs+,KQo',
    iterations: '5000',
    playerCount: '2',
    rngSeed: '7',
  },
};

function parseCardList(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cardListToInput(cards: string[]): string {
  return cards.filter(Boolean).join(' ');
}

function normalizeCardCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length !== 2) return trimmed;
  return `${trimmed[0]!.toUpperCase()}${trimmed[1]!.toLowerCase()}`;
}

function isValidCardCode(code: string): boolean {
  const normalized = normalizeCardCode(code);
  if (normalized.length !== 2) return false;
  return validRanks.has(normalized[0]!) && validSuits.has(normalized[1]!);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function actionLabel(action: AnalyzeResponse['recommendation']['action']): string {
  switch (action) {
    case 'raise':
      return '偏主动进攻';
    case 'call':
      return '偏继续跟注';
    case 'check':
      return '偏控制底池';
    case 'fold':
      return '偏向放弃';
    default:
      return action;
  }
}

function getEquityTone(equity: number): { label: string; color: string; bg: string } {
  if (equity >= 0.65) return { label: '明显领先', color: '#166534', bg: '#dcfce7' };
  if (equity >= 0.45) return { label: '可以继续', color: '#92400e', bg: '#fef3c7' };
  return { label: '偏弱谨慎', color: '#991b1b', bg: '#fee2e2' };
}

function getMadeHandLabel(value: string): string {
  const map: Record<string, string> = {
    'high-card': '高牌',
    'one-pair': '一对',
    'two-pair': '两对',
    'three-of-a-kind': '三条',
    straight: '顺子',
    flush: '同花',
    'full-house': '葫芦',
    'four-of-a-kind': '四条',
    'straight-flush': '同花顺',
  };
  return map[value] ?? value;
}

function getDrawLabel(value: string): string {
  const map: Record<string, string> = {
    'flush-draw': '同花听牌',
    oesd: '两头顺听牌',
    gutshot: '卡顺听牌',
    overcards: '高张优势',
    'combo-draw': '组合听牌',
  };
  return map[value] ?? value;
}

function getSuitSymbol(suit: string): string {
  return suit === 's' ? '♠' : suit === 'h' ? '♥' : suit === 'd' ? '♦' : '♣';
}

function getSuitColor(suit: string): string {
  return suit === 'h' || suit === 'd' ? '#b91c1c' : '#111827';
}

function getValidationState(heroCards: string[], boardCards: string[]) {
  const normalizedHero = heroCards.map(normalizeCardCode).filter(Boolean);
  const normalizedBoard = boardCards.map(normalizeCardCode).filter(Boolean);
  const allCards = [...normalizedHero, ...normalizedBoard];

  const invalidCards = allCards.filter((card) => !isValidCardCode(card));
  const duplicateCards = allCards.filter((card, index) => allCards.indexOf(card) !== index);

  const messages: string[] = [];

  if (normalizedHero.length !== 2) {
    messages.push('Hero Hand 必须正好 2 张牌。');
  }

  if (![0, 3, 4, 5].includes(normalizedBoard.length)) {
    messages.push('Board 只能是 0 / 3 / 4 / 5 张牌。');
  }

  if (invalidCards.length > 0) {
    messages.push(`存在非法牌面编码：${Array.from(new Set(invalidCards)).join(', ')}`);
  }

  if (duplicateCards.length > 0) {
    messages.push(`存在重复牌：${Array.from(new Set(duplicateCards)).join(', ')}`);
  }

  return {
    isValid: messages.length === 0,
    messages,
    normalizedHero,
    normalizedBoard,
  };
}

function getSummaryLine(result: AnalyzeResponse): string {
  if (result.hand.madeHand === 'high-card' && result.hand.draws.length === 0) {
    return '当前还没成手，而且没有明显听牌，偏向谨慎处理。';
  }
  if (result.hand.draws.includes('combo-draw')) {
    return '虽然未必已经很强，但组合听牌让后续改良空间明显变大。';
  }
  if (result.hand.madeHand !== 'high-card') {
    return `当前已经形成${getMadeHandLabel(result.hand.madeHand)}，不是纯空气牌。`;
  }
  return '当前主要价值来自听牌结构和后续街道的改良机会。';
}

function CardSlot({
  value,
  label,
  onClick,
}: {
  value: string;
  label: string;
  onClick: () => void;
}) {
  const normalized = normalizeCardCode(value);
  const filled = isValidCardCode(normalized);
  const suit = filled ? normalized[1]! : '';

  return (
    <button type="button" onClick={onClick} style={cardSlotStyle}>
      <div style={cardSlotLabelStyle}>{label}</div>
      {filled ? (
        <div style={{ ...cardFaceStyle, color: getSuitColor(suit) }}>
          <span>{normalized[0]}</span>
          <span>{getSuitSymbol(suit)}</span>
        </div>
      ) : (
        <div style={emptyCardFaceStyle}>选择牌</div>
      )}
    </button>
  );
}

export default function HomePage() {
  const [heroHandInput, setHeroHandInput] = useState(exampleScenarios.default.heroHandInput);
  const [boardInput, setBoardInput] = useState(exampleScenarios.default.boardInput);
  const [rangePreset, setRangePreset] = useState<(typeof presetOptions)[number]>(exampleScenarios.default.rangePreset);
  const [rangeText, setRangeText] = useState(exampleScenarios.default.rangeText);
  const [iterations, setIterations] = useState(exampleScenarios.default.iterations);
  const [playerCount, setPlayerCount] = useState(exampleScenarios.default.playerCount);
  const [rngSeed, setRngSeed] = useState(exampleScenarios.default.rngSeed);
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:8787');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  const heroPreview = useMemo(() => parseCardList(heroHandInput), [heroHandInput]);
  const boardPreview = useMemo(() => parseCardList(boardInput), [boardInput]);
  const validation = useMemo(() => getValidationState(heroPreview, boardPreview), [heroPreview, boardPreview]);
  const resultTone = result ? getEquityTone(result.equity.equity) : null;
  const usedCards = useMemo(
    () => [...validation.normalizedHero, ...validation.normalizedBoard].filter(isValidCardCode),
    [validation.normalizedHero, validation.normalizedBoard],
  );

  function applyScenario(key: keyof typeof exampleScenarios) {
    const scenario = exampleScenarios[key];
    setHeroHandInput(scenario.heroHandInput);
    setBoardInput(scenario.boardInput);
    setRangePreset(scenario.rangePreset);
    setRangeText(scenario.rangeText);
    setIterations(scenario.iterations);
    setPlayerCount(scenario.playerCount);
    setRngSeed(scenario.rngSeed);
    setResult(null);
    setError(null);
    setPickerTarget(null);
  }

  function clearSlot(target: PickerTarget) {
    if (target.area === 'hero') {
      const next = [...heroPreview];
      next[target.index] = '';
      setHeroHandInput(cardListToInput(next));
      return;
    }

    const next = [...boardPreview];
    next[target.index] = '';
    setBoardInput(cardListToInput(next.filter(Boolean)));
  }

  function applyCardToTarget(card: string) {
    if (!pickerTarget) return;

    if (pickerTarget.area === 'hero') {
      const next = [heroPreview[0] ?? '', heroPreview[1] ?? ''];
      next[pickerTarget.index] = card;
      setHeroHandInput(cardListToInput(next));
    } else {
      const next = [boardPreview[0] ?? '', boardPreview[1] ?? '', boardPreview[2] ?? '', boardPreview[3] ?? '', boardPreview[4] ?? ''];
      next[pickerTarget.index] = card;
      setBoardInput(cardListToInput(next.filter(Boolean)));
    }

    setPickerTarget(null);
  }

  async function handleAnalyze() {
    if (!validation.isValid) {
      setError(validation.messages[0] ?? '输入不合法');
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        heroHand: validation.normalizedHero,
        board: validation.normalizedBoard,
        rangePreset,
        rangeText: rangeText.trim() || undefined,
        iterations: Number(iterations),
        rngSeed: Number(rngSeed),
        playerCount: Number(playerCount),
      };

      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Analyze request failed');
      }

      setResult(data as AnalyzeResponse);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'Inter, Arial, sans-serif', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 8 }}>Poker Trainer</h1>
        <p style={{ color: '#555', marginTop: 0, lineHeight: 1.6 }}>
          这是一个面向 <strong>单对手训练</strong> 的 MVP 分析页。你输入手牌、公牌和对手范围后，它会给出
          <strong>胜率、当前牌力、听牌结构、以及教学型建议</strong>。
        </p>
      </div>

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <strong>快速示例：</strong>
          {Object.entries(exampleScenarios).map(([key, item]) => (
            <button key={key} onClick={() => applyScenario(key as keyof typeof exampleScenarios)} style={chipButtonStyle}>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>输入参数</h2>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>点牌器</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={pickerLabelStyle}>Hero Hand</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <CardSlot value={heroPreview[0] ?? ''} label="H1" onClick={() => setPickerTarget({ area: 'hero', index: 0 })} />
                  <CardSlot value={heroPreview[1] ?? ''} label="H2" onClick={() => setPickerTarget({ area: 'hero', index: 1 })} />
                </div>
              </div>

              <div>
                <div style={pickerLabelStyle}>Board</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {([0, 1, 2, 3, 4] as const).map((index) => (
                    <CardSlot
                      key={index}
                      value={boardPreview[index] ?? ''}
                      label={`B${index + 1}`}
                      onClick={() => setPickerTarget({ area: 'board', index })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <label style={labelStyle}>
            API Base URL
            <input style={inputStyle} value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
          </label>

          <label style={labelStyle}>
            Hero Hand（文本 fallback）
            <input style={inputStyle} value={heroHandInput} onChange={(e) => setHeroHandInput(e.target.value)} placeholder="As Kd" />
          </label>
          <small style={hintStyle}>也可以直接手输，点牌器和文本输入会同步。</small>

          <label style={labelStyle}>
            Board（文本 fallback）
            <input style={inputStyle} value={boardInput} onChange={(e) => setBoardInput(e.target.value)} placeholder="Qh Js 5d" />
          </label>
          <small style={hintStyle}>支持 0 / 3 / 4 / 5 张公共牌。</small>

          <label style={labelStyle}>
            Range Preset
            <select style={inputStyle} value={rangePreset} onChange={(e) => setRangePreset(e.target.value as (typeof presetOptions)[number])}>
              {presetOptions.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Range Text（可选，填写后优先于 preset）
            <input style={inputStyle} value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder="TT+,AJs+,KQo" />
          </label>
          <small style={hintStyle}>支持：AA / AKs / AKo / TT+ / AJs+ / 76s-54s / 逗号组合</small>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              Iterations
              <input style={inputStyle} value={iterations} onChange={(e) => setIterations(e.target.value)} />
            </label>

            <label style={labelStyle}>
              RNG Seed
              <input style={inputStyle} value={rngSeed} onChange={(e) => setRngSeed(e.target.value)} />
            </label>

            <label style={labelStyle}>
              Player Count
              <input style={inputStyle} value={playerCount} onChange={(e) => setPlayerCount(e.target.value)} />
            </label>
          </div>

          <small style={hintStyle}>当前后端会记录 player count，但实际仍按单对手（2 人）计算。</small>

          {!validation.isValid ? (
            <div style={{ ...noticeStyle, background: '#fff7e6', borderColor: '#ffd591', color: '#ad4e00' }}>
              <strong>输入还没准备好：</strong>
              <ul style={listStyle}>
                {validation.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div style={{ ...noticeStyle, background: '#f6ffed', borderColor: '#b7eb8f', color: '#237804' }}>
              输入格式看起来没问题，可以直接分析。
            </div>
          )}

          <button onClick={handleAnalyze} disabled={loading || !validation.isValid} style={buttonStyle}>
            {loading ? '分析中…' : '开始分析'}
          </button>

          {error ? (
            <div style={{ ...noticeStyle, background: '#fff1f0', borderColor: '#ffccc7', color: '#a8071a' }}>{error}</div>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>分析结论</h2>

            {!result ? (
              <div style={{ color: '#666', lineHeight: 1.7 }}>还没有结果。建议先点一个示例，或者直接在左边点牌后开始分析。</div>
            ) : (
              <>
                <div
                  style={{
                    borderRadius: 12,
                    padding: 16,
                    background: resultTone?.bg,
                    color: resultTone?.color,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>结论先看</div>
                  <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>{actionLabel(result.recommendation.action)}</div>
                  <div style={{ fontSize: 15, lineHeight: 1.6 }}>
                    当前 equity <strong>{pct(result.equity.equity)}</strong>，整体状态属于 <strong>{resultTone?.label}</strong>。{getSummaryLine(result)}
                  </div>
                </div>

                <div style={metricGridStyle}>
                  <div style={metricCardStyle}>
                    <div style={metricLabelStyle}>Equity</div>
                    <div style={metricValueStyle}>{pct(result.equity.equity)}</div>
                  </div>
                  <div style={metricCardStyle}>
                    <div style={metricLabelStyle}>Made Hand</div>
                    <div style={metricValueStyle}>{getMadeHandLabel(result.hand.madeHand)}</div>
                  </div>
                  <div style={metricCardStyle}>
                    <div style={metricLabelStyle}>Action</div>
                    <div style={metricValueStyle}>{actionLabel(result.recommendation.action)}</div>
                  </div>
                  <div style={metricCardStyle}>
                    <div style={metricLabelStyle}>Confidence</div>
                    <div style={metricValueStyle}>{pct(result.recommendation.confidence)}</div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>详细结果</h2>

            {!result ? null : (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={subCardStyle}>
                  <h3 style={subTitleStyle}>胜率拆解</h3>
                  <ul style={listStyle}>
                    <li>winRate: {pct(result.equity.winRate)}</li>
                    <li>tieRate: {pct(result.equity.tieRate)}</li>
                    <li>loseRate: {pct(result.equity.loseRate)}</li>
                    <li>sampleCount: {result.equity.sampleCount}</li>
                  </ul>
                </div>

                <div style={subCardStyle}>
                  <h3 style={subTitleStyle}>牌力与听牌</h3>
                  <ul style={listStyle}>
                    <li>当前牌型：{getMadeHandLabel(result.hand.madeHand)}</li>
                    <li>听牌结构：{result.hand.draws.length ? result.hand.draws.map(getDrawLabel).join('、') : '无明显听牌'}</li>
                    <li>overcards：{result.hand.overcards}</li>
                  </ul>
                  <strong>说明</strong>
                  <ul style={listStyle}>
                    {result.hand.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>

                <div style={subCardStyle}>
                  <h3 style={subTitleStyle}>建议原因</h3>
                  <ul style={listStyle}>
                    {result.recommendation.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>

                <div style={subCardStyle}>
                  <h3 style={subTitleStyle}>当前分析假设</h3>
                  <ul style={listStyle}>
                    <li>mode: {result.assumptions.mode}</li>
                    <li>playerCountReceived: {result.assumptions.playerCountReceived}</li>
                    <li>playerCountApplied: {result.assumptions.playerCountApplied}</li>
                    <li>rangeSource: {result.assumptions.rangeSource}</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {pickerTarget ? (
        <div style={modalOverlayStyle} onClick={() => setPickerTarget(null)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>选择牌面</div>
                <div style={{ color: '#666', fontSize: 13 }}>
                  {pickerTarget.area === 'hero' ? `Hero 第 ${pickerTarget.index + 1} 张` : `Board 第 ${pickerTarget.index + 1} 张`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={secondaryButtonStyle} onClick={() => clearSlot(pickerTarget)}>
                  清空这个位置
                </button>
                <button type="button" style={secondaryButtonStyle} onClick={() => setPickerTarget(null)}>
                  关闭
                </button>
              </div>
            </div>

            <div style={pickerGridStyle}>
              {allCards.map((card) => {
                const normalized = normalizeCardCode(card);
                const suit = normalized[1]!;
                const currentValue = pickerTarget.area === 'hero' ? heroPreview[pickerTarget.index] ?? '' : boardPreview[pickerTarget.index] ?? '';
                const isCurrent = normalizeCardCode(currentValue) === normalized;
                const isUsedElsewhere = usedCards.includes(normalized) && !isCurrent;

                return (
                  <button
                    key={card}
                    type="button"
                    disabled={isUsedElsewhere}
                    onClick={() => applyCardToTarget(normalized)}
                    style={{
                      ...pickerCardStyle,
                      opacity: isUsedElsewhere ? 0.35 : 1,
                      borderColor: isCurrent ? '#2563eb' : '#d1d5db',
                      background: isCurrent ? '#eff6ff' : '#fff',
                      color: getSuitColor(suit),
                    }}
                  >
                    <span>{normalized[0]}</span>
                    <span>{getSuitSymbol(suit)}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>已被当前 Hero/Board 占用的牌会自动禁用，避免重复选牌。</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 18,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

const subCardStyle: React.CSSProperties = {
  background: '#fafafa',
  border: '1px solid #eee',
  borderRadius: 10,
  padding: 12,
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 16,
  fontSize: 20,
};

const subTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 8,
  fontSize: 16,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d9d9d9',
  fontSize: 14,
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 12,
  padding: '12px 16px',
  borderRadius: 10,
  border: 'none',
  background: '#111827',
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  cursor: 'pointer',
};

const chipButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  border: '1px solid #d1d5db',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
};

const hintStyle: React.CSSProperties = {
  display: 'block',
  color: '#666',
  marginTop: -6,
  marginBottom: 12,
};

const noticeStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 8,
  border: '1px solid',
};

const listStyle: React.CSSProperties = {
  paddingLeft: 18,
  marginTop: 8,
  marginBottom: 0,
};

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
};

const metricCardStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 12,
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  marginBottom: 6,
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
};

const pickerLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#4b5563',
  marginBottom: 6,
  fontWeight: 700,
};

const cardSlotStyle: React.CSSProperties = {
  width: 72,
  borderRadius: 12,
  border: '1px solid #d1d5db',
  background: '#fff',
  padding: 8,
  cursor: 'pointer',
};

const cardSlotLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
  marginBottom: 6,
};

const cardFaceStyle: React.CSSProperties = {
  minHeight: 52,
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 22,
  fontWeight: 800,
  gap: 2,
  background: '#f9fafb',
};

const emptyCardFaceStyle: React.CSSProperties = {
  minHeight: 52,
  borderRadius: 10,
  border: '1px dashed #d1d5db',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  color: '#9ca3af',
  background: '#fafafa',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 50,
};

const modalCardStyle: React.CSSProperties = {
  width: 'min(860px, 100%)',
  maxHeight: '90vh',
  overflow: 'auto',
  background: '#fff',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
};

const pickerGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(56px, 1fr))',
  gap: 8,
};

const pickerCardStyle: React.CSSProperties = {
  minHeight: 64,
  borderRadius: 10,
  border: '1px solid #d1d5db',
  background: '#fff',
  fontSize: 22,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
};
